// ui/game/draw/DrawPool.js
import * as THREE from 'three'

export class DrawPool {
  constructor({ scene, w, h, thingsRef, mapStoreRef, debugQueue = false, debugDelayMs = 25 } = {}) {
    this.id = 0;
    this.scene = scene
    this.w = w
    this.h = h
    this.thingsRef = thingsRef
    this.mapStoreRef = mapStoreRef
    this.debugQueue = !!debugQueue
    this.debugDelayMs = Math.max(0, debugDelayMs | 0)

    // passes
    this.PASS_GROUND = 0
    this.PASS_ONBOTTOM = 1
    this.PASS_ITEMS = 2
    this.PASS_CREATURES = 3
    this.PASS_ONTOP = 4
    this.PASS_UNKNOWN = 5
    this.PASS_COUNT = 6

    this.plane = new THREE.PlaneGeometry(1, 1)
    this.tileGroups = Array.from({ length: w * h }, () => new THREE.Group())

    for (let ty = 0; ty < h; ty++) {
      for (let tx = 0; tx < w; tx++) {
        const g = this.tileGroups[ty * w + tx]
        g.position.set(tx - w / 2 + 0.5, (h - 1 - ty) - h / 2 + 0.5, 0)
        scene.add(g)
      }
    }

    this.texCache = new globalThis.Map()
    this.canvasTexCache = new globalThis.Map()

    // OTC: ordem de desenho = ordem de chamada (Tile chama thing->draw() em sequência; addTexturedRect na hora).
    // Uma única fila; flush na ordem em que foi enfileirado (sem sort/renderOrder).
    this.drawQueue = []
    this.timer = 0
    this.curQueueIndex = 0

    // Set by MapView before drawing, used for autotile adjacency and coverage decisions.
    this.map = null
    this.lockedFirstVisibleFloor = -1
  }

  setMap(map) {
    this.map = map
  }

  coveredUp(pos) {
    return { x: pos.x + 1, y: pos.y + 1, z: pos.z - 1 }
  }

  coveredDown(pos) {
    return { x: pos.x - 1, y: pos.y - 1, z: pos.z + 1 }
  }

  _tt(thing, types) { return thing?.getThingType?.() ?? types?.getItem?.(thing?.m_entry?.id ?? thing?.id) }
  _isItem(thing) { return !!thing?.isItem?.() || thing?.kind === 'item' }
  _isCreature(thing) { return !!thing?.isCreature?.() || thing?.kind === 'creature' }

  isLookPossibleAt(x, y, z, types) {
    const t = this.map?.getTileWorld?.(x, y, z)
    if (!t) return true
    const stack = t.getThings?.() ?? t.stack ?? []
    for (const it of stack) {
      if (!this._isItem(it)) continue
      const tt = this._tt(it, types)
      if (tt?.blockProjectile) return false
    }
    return true
  }

  tileLimitsFloorsView(tile, types, isFreeView) {
    const stack = tile?.getThings?.() ?? tile?.stack ?? []
    const firstItem = stack.find((s) => this._isItem(s)) || null
    if (!firstItem) return false
    const tt = this._tt(firstItem, types)
    if (!tt || tt.dontHide) return false

    if (isFreeView) {
      if (tt.ground) return true
      if (tt.onBottom) return true
      return false
    }

    if (tt.ground) return true
    if (tt.onBottom && tt.blockProjectile) return true
    return false
  }

  /**
   * OTC MapView::calcFirstVisibleFloor()
   * - lockedFirstVisibleFloor: retorna esse valor se >= 0.
   * - !multifloor: retorna cameraZ.
   * - cameraZ > SEA_FLOOR: firstFloor = max(cameraZ - AWARE_UNDERGROUND_FLOOR_RANGE, UNDERGROUND_FLOOR).
   * - Senão: firstFloor = 0; loop 3x3 (center ou orthogonal+isLookPossible); while subir andares, limitsFloorsView → firstFloor = z+1.
   * - Extensão: acima do chão (cameraZ <= 7) limitamos firstFloor <= cameraZ para sempre desenhar o andar do jogador.
   */
  calcFirstVisibleFloor(types) {
    const SEA_FLOOR = 7
    const AWARE_UNDERGROUND_FLOOR_RANGE = 2
    const UNDERGROUND_FLOOR = 8
    const MAX_Z = 15
    const map = this.map
    const cameraZ = map?.cameraZ ?? SEA_FLOOR
    const cameraX = map?.cameraX ?? 0
    const cameraY = map?.cameraY ?? 0

    if (!map) return Math.max(0, Math.min(MAX_Z, cameraZ))
    if (this.lockedFirstVisibleFloor >= 0) return Math.max(0, Math.min(MAX_Z, this.lockedFirstVisibleFloor))
    if (!map.multifloor) return Math.max(0, Math.min(MAX_Z, cameraZ))

    if (cameraZ > SEA_FLOOR) {
      return Math.max(0, Math.min(MAX_Z, Math.max(UNDERGROUND_FLOOR, cameraZ - AWARE_UNDERGROUND_FLOOR_RANGE)))
    }

    const rangeLeft = map.range?.left ?? 8
    const rangeTop = map.range?.top ?? 6
    const getTileAt = (wx, wy, z) => {
      let t = map.getTileWorld(wx, wy, z)
      if (t) return t
      const sx = wx - cameraX + rangeLeft - z + cameraZ
      const sy = wy - cameraY + rangeTop - z + cameraZ
      if (sx >= 0 && sy >= 0) return map.getTile(sx, sy, z) || null
      return null
    }

    let firstFloor = 0
    for (let ix = -1; ix <= 1 && firstFloor < cameraZ; ix++) {
      for (let iy = -1; iy <= 1 && firstFloor < cameraZ; iy++) {
        const isCenter = ix === 0 && iy === 0
        const isOrthogonal = Math.abs(ix) !== Math.abs(iy)
        const canCheck = isCenter || (isOrthogonal && this.isLookPossibleAt(cameraX + ix, cameraY + iy, cameraZ, types))
        if (!canCheck) continue

        const pos = { x: cameraX + ix, y: cameraY + iy, z: cameraZ }
        const freeView = this.isLookPossibleAt(pos.x, pos.y, pos.z, types)
        let upperPos = { ...pos }
        let coveredPos = { ...pos }

        while (coveredPos.z > firstFloor) {
          upperPos = { x: upperPos.x, y: upperPos.y, z: upperPos.z - 1 }
          coveredPos = this.coveredUp(coveredPos)
          if (upperPos.z < firstFloor) break

          const tilePhys = getTileAt(upperPos.x, upperPos.y, upperPos.z)
          if (tilePhys && this.tileLimitsFloorsView(tilePhys, types, !freeView)) {
            firstFloor = upperPos.z + 1
            break
          }
          const tileGeom = getTileAt(coveredPos.x, coveredPos.y, coveredPos.z)
          if (tileGeom && this.tileLimitsFloorsView(tileGeom, types, freeView)) {
            firstFloor = coveredPos.z + 1
            break
          }
        }
      }
    }

    // OTC: cap at cameraZ so we always include player floor; optionally floor at cameraZ so we don't draw below player on surface.
    if (cameraZ <= SEA_FLOOR) {
      firstFloor = Math.min(firstFloor, cameraZ)
      firstFloor = Math.max(firstFloor, cameraZ) // surface: don't draw floors below player (0..cameraZ-1)
    }
    return Math.max(0, Math.min(MAX_Z, firstFloor))
  }

  /**
   * OTC MapView::calcLastVisibleFloor()
   * - Acima/na superfície (z <= SEA_FLOOR): last = SEA_FLOOR (7) → desenha 7, 6, 5…
   * - Abaixo do mar (z > SEA_FLOOR): last = cameraZ + AWARE_UNDERGROUND_FLOOR_RANGE
   */
  calcLastVisibleFloor(firstFloor) {
    const SEA_FLOOR = 7
    const AWARE_UNDERGROUND_FLOOR_RANGE = 2
    const MAX_Z = 15
    const map = this.map
    const cameraZ = map?.cameraZ ?? SEA_FLOOR
    if (!map || !map.multifloor) return firstFloor

    let z = SEA_FLOOR
    if (cameraZ > SEA_FLOOR) {
      z = cameraZ + AWARE_UNDERGROUND_FLOOR_RANGE
    }
    return Math.max(0, Math.min(MAX_Z, z))
  }

  isTileCovered(x, y, z, types) {
    const map = this.map
    if (!map) return false
    const zMin = map.zMin ?? z
    // Covered by any floor above (smaller z) that blocks floors view.
    for (let zz = z - 1; zz >= zMin; zz--) {
      const base = map.getTile(x, y, z)
      const wx = base?.meta?.wx
      const wy = base?.meta?.wy
      if (!Number.isFinite(wx) || !Number.isFinite(wy)) return false
      const t = map.getTileWorld(wx, wy, zz)
      if (!t) continue
      if (this.tileBlocksFloorsView(t, types)) return true
    }
    return false
  }

  tileBlocksFloorsView(tile, types) {
    const stack = tile?.getThings?.() ?? tile?.stack ?? []
    const firstItem = stack.find((s) => this._isItem(s)) || null
    if (!firstItem) return false
    const tt = this._tt(firstItem, types)
    if (!tt) return false
    if (tt.dontHide) return false
    if (tt.fullGround) return true
    if (tt.ground) return true
    if (tt.onBottom && tt.blockProjectile) return true
    return false
  }

  beginFrame() {
    for (const g of this.tileGroups) {
      while (g.children.length) {
        const c = g.children.pop()
        if (c?.material) c.material.dispose()
      }
    }
    this.drawQueue.length = 0
    if (this.timer) {
      clearTimeout(this.timer)
      this.timer = 0
    }
    this.curQueueIndex = 0
  }

  endFrame() {
    if (this.debugQueue) this._pump()
    else this._flushAll()
  }

  tileOrder(x, y) {
    // Must match GameMap diagonal traversal: diagonals by (x+y) increasing,
    // and within each diagonal top->bottom (y increasing).
    return ((x + y) * this.h + y) * 1000
  }

  passOf(it) {
    if (this._isCreature(it)) return this.PASS_CREATURES
    if (!this._isItem(it)) return this.PASS_UNKNOWN

    const tt = it.getThingType?.() ?? it.tt
    if (!tt) return this.PASS_UNKNOWN
    if (tt.ground) return this.PASS_GROUND
    if (tt.onBottom && !tt.onTop) return this.PASS_ONBOTTOM
    if (tt.onTop) return this.PASS_ONTOP
    return this.PASS_ITEMS
  }

  texForSprite(spriteId, sprites) {
    if (!spriteId || !sprites) return null
    if (this.texCache.has(spriteId)) return this.texCache.get(spriteId)
    const canvas = sprites.getCanvas(spriteId)
    if (!canvas) { this.texCache.set(spriteId, null); return null }
    const tex = new THREE.CanvasTexture(canvas)
    tex.magFilter = THREE.NearestFilter
    tex.minFilter = THREE.NearestFilter
    this.texCache.set(spriteId, tex)
    return tex
  }

  /** Converts a canvas (from ThingType.getTexture) to THREE texture; caches by canvas ref. */
  texForCanvas(canvas) {
    if (!canvas) return null
    if (this.canvasTexCache.has(canvas)) return this.canvasTexCache.get(canvas)
    const tex = new THREE.CanvasTexture(canvas)
    tex.magFilter = THREE.NearestFilter
    tex.minFilter = THREE.NearestFilter
    this.canvasTexCache.set(canvas, tex)
    return tex
  }

  getSpriteIndex(tt, bw, bh, layer, xPat, yPat, zPat, phase) {
    if (typeof tt.getSpriteIndex === 'function') {
      return tt.getSpriteIndex(0, 0, layer, xPat, yPat, zPat, phase)
    }
    const layers = tt.layers ?? tt.m_layers ?? 1
    const px = tt.patternX ?? tt.m_numPatternX ?? 1
    const py = tt.patternY ?? tt.m_numPatternY ?? 1
    const pz = tt.patternZ ?? tt.m_numPatternZ ?? 1
    const ph = Math.max(1, tt.phases ?? tt.m_animationPhases ?? 1)
    if (layer >= layers || xPat >= px || yPat >= py || zPat >= pz || phase >= ph) return -1
    return ((((((phase % ph) * pz + zPat) * py + yPat) * px + xPat) * layers + layer) * bh + 0) * bw + 0
  }

  /**
   * OTC: addTexturedRect(screenRect, texture, textureRect, color)
   * Adiciona um rect à fila; desenho na ordem de chamada (sem sort).
   * @param {object} rect - { tileX, tileY, texture, width?, height?, z, dx, dy }
   */
  addTexturedRect(rect) {
    if (!rect?.texture) return
    this.drawQueue.push({
      tileX: rect.tileX,
      tileY: rect.tileY,
      texture: rect.texture,
      width: rect.width ?? 1,
      height: rect.height ?? 1,
      z: rect.z ?? 0,
      dx: rect.dx ?? 0,
      dy: rect.dy ?? 0,
    })
  }

  /** @deprecated Use addTexturedRect(rect). */
  enqueueDraw(_pass, job) {
    this.addTexturedRect(job)
  }

  _flushAll() {
    for (const rect of this.drawQueue) this._draw(rect)
    this.drawQueue.length = 0
  }

  flushNow() {
    this._flushAll()
  }

  _pump() {
    if (this.timer) return
    const step = () => {
      this.timer = 0
      if (this.curQueueIndex >= this.drawQueue.length) return
      const rect = this.drawQueue[this.curQueueIndex++]
      if (rect) this._draw(rect)
      this.timer = setTimeout(step, this.debugDelayMs)
    }
    this.timer = setTimeout(step, this.debugDelayMs)
  }

  /**
   * Cria mesh e adiciona ao tileGroup; ordem = ordem da fila (OTC: back-to-front).
   * No Tibia: andar 7 = chão (baixo), andar 6 = acima. No Three.js usamos position.z = -floor
   * para que andar 6 fique à frente do 7 (câmera olhando -Z: menor z numérico = mais perto).
   */
  _draw({ tileX, tileY, texture, z, dx, dy, width = 1, height = 1 }) {
    const tx = Math.max(0, Math.min(this.w - 1, Math.floor(tileX)))
    const ty = Math.max(0, Math.min(this.h - 1, Math.floor(tileY)))
    if (!texture) return
    const mat = new THREE.MeshBasicMaterial({ map: texture, transparent: true })
    mat.depthTest = false
    mat.depthWrite = false
    const m = new THREE.Mesh(this.plane, mat)
    m.visible = true
    m.scale.set(width, height, 1)
    const ox = width > 1 ? (width - 1) / 2 : 0
    let oy = height > 1 ? (height - 1) / 2 : 0
    if (height > 1) oy -= 1
    // Inverter Z: andar 6 (acima) na frente do 7 (chão). renderOrder: andar menor = desenho por último = por cima.
    const threeZ = -z
    m.position.set(ox + dx + (tileX - tx), oy + dy + (tileY - ty), threeZ)
    m.renderOrder = 15 - z // andar menor (ex: 6) → maior renderOrder → desenhado por cima do 7
    this.tileGroups[ty * this.w + tx].add(m)
  }
}
