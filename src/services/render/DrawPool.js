/*
 * Copyright (c) 2010-2026 OTClient <https://github.com/edubart/otclient>
 * Port 1:1 from src/framework/graphics/drawpool.cpp + drawpool.h
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in
 * all copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
 * THE SOFTWARE.
 */

import * as THREE from 'three'

// OTC declarations.h
const DEFAULT_DISPLAY_DENSITY = 1

/** OTC: enum DrawOrder : uint8_t */
export const DrawOrder = {
  FIRST: 0,   // GROUND
  SECOND: 1,  // BORDER
  THIRD: 2,   // BOTTOM & TOP
  FOURTH: 3,  // TOP ~ TOP
  FIFTH: 4,   // ABOVE ALL - MISSILE
  LAST: 5,
}

/** OTC: enum class DrawPoolType */
export const DrawPoolType = {
  MAP: 0,
  CREATURE_INFORMATION: 1,
  LIGHT: 2,
  FOREGROUND_MAP: 3,
  FOREGROUND: 4,
  LAST: 5,
}

/** OTC: DrawHashController */
class DrawHashController {
  constructor(agroup = false) {
    this.m_agroup = !!agroup
    this.m_hashs = new Set()
    this.m_lastHash = 0
    this.m_currentHash = 0
    this.m_lastObjectHash = 0
  }

  put(hash) {
    const hashNum = Number(hash)
    if ((this.m_agroup && this.m_hashs.add(hashNum).has(hashNum) !== false) || this.m_lastObjectHash !== hashNum) {
      this.m_lastObjectHash = hashNum
      this.m_currentHash = (this.m_currentHash * 31 + hashNum) | 0
      return true
    }
    return false
  }

  isLast(hash) {
    return this.m_lastObjectHash === Number(hash)
  }

  forceUpdate() {
    this.m_currentHash = 1
  }

  wasModified() {
    return this.m_currentHash !== this.m_lastHash
  }

  reset() {
    if (this.m_currentHash !== 1) this.m_lastHash = this.m_currentHash
    this.m_hashs.clear()
    this.m_currentHash = 0
    this.m_lastObjectHash = 0
  }
}

/** OTC: DrawMethodType */
const DrawMethodType = {
  RECT: 0,
  TRIANGLE: 1,
  REPEATED_RECT: 2,
  BOUNDING_RECT: 3,
  UPSIDEDOWN_RECT: 4,
}

/** OTC: DrawMethod */
function makeDrawMethod(opts = {}) {
  return {
    type: opts.type ?? DrawMethodType.RECT,
    dest: opts.dest ?? {},
    src: opts.src ?? {},
    a: opts.a ?? {}, b: opts.b ?? {}, c: opts.c ?? {},
    intValue: opts.intValue ?? 0,
  }
}

/** OTC: PoolState – equality by hash; execute() aplica estado no painter (aqui: stub, usamos só para batching). */
function makePoolState(opts = {}) {
  return {
    transformMatrix: opts.transformMatrix ?? null,
    opacity: opts.opacity ?? 1,
    compositionMode: opts.compositionMode ?? 0,
    blendEquation: opts.blendEquation ?? 0,
    clipRect: opts.clipRect ?? {},
    shaderProgram: opts.shaderProgram ?? null,
    action: opts.action ?? null,
    color: opts.color ?? null,
    texture: opts.texture ?? null,
    textureId: opts.textureId ?? 0,
    textureMatrixId: opts.textureMatrixId ?? 0,
    hash: opts.hash ?? 0,
  }
}

function poolStateEquals(a, b) {
  return a && b && a.hash === b.hash
}

/** OTC: DrawObject – either action (lambda) or state + coords; aqui coords = rect (payload para addTexturedRect). */
function makeDrawObjectAction(action) {
  return { action, coords: null, state: null }
}

function makeDrawObjectState(state, rect) {
  return { action: null, coords: rect, state }
}

/**
 * DrawPool – port 1:1 from OTC drawpool.cpp / drawpool.h
 * Integração: scene/tileGroups/beginFrame/endFrame/addTexturedRect/_draw para Three.js.
 */
export class DrawPool {
  static FPS1 = 1000 / 1
  static FPS10 = 1000 / 10
  static FPS20 = 1000 / 20
  static FPS60 = 1000 / 60

  static create(type, opts = {}) {
    const pool = new DrawPool(opts)
    if (type === DrawPoolType.MAP || type === DrawPoolType.FOREGROUND) {
      if (type === DrawPoolType.MAP) {
        // pool.m_framebuffer->m_useAlphaWriting = false; pool->disableBlend();
      } else if (type === DrawPoolType.FOREGROUND) {
        pool.setFPS(10)
      }
    } else if (type === DrawPoolType.LIGHT) {
      pool.m_hashCtrl = new DrawHashController(true)
    } else {
      pool.m_alwaysGroupDrawings = true
      pool.setFPS(500)
    }
    pool.m_type = type
    return pool
  }

  constructor({ scene, w, h, thingsRef, mapStoreRef, debugQueue = false, debugDelayMs = 25 } = {}) {
    this.id = 0
    this.scene = scene
    this.w = w ?? 15
    this.h = h ?? 11
    this.thingsRef = thingsRef
    this.mapStoreRef = mapStoreRef
    this.debugQueue = !!debugQueue
    this.debugDelayMs = Math.max(0, debugDelayMs | 0)

    this.m_enabled = true
    this.m_alwaysGroupDrawings = false
    this.m_bindedFramebuffers = -1
    this.m_refreshDelay = 0
    this.m_shaderRefreshDelay = 0
    this.m_onlyOnceStateFlag = 0
    this.m_lastFramebufferId = 0
    this.m_previousOpacity = 1
    this.m_previousBlendEquation = 0
    this.m_previousCompositionMode = 0
    this.m_previousClipRect = {}
    this.m_previousShaderProgram = null
    this.m_previousShaderAction = null

    this.m_states = [makePoolState()]
    this.m_lastStateIndex = 0
    this.m_type = DrawPoolType.LAST
    this.m_currentDrawOrder = DrawOrder.FIRST
    this.m_hashCtrl = new DrawHashController(false)
    this.m_transformMatrixStack = []
    this.m_temporaryFramebuffers = []
    this.m_objects = Array.from({ length: DrawOrder.LAST }, () => [])
    this.m_objectsFlushed = []
    this.m_objectsDraw = [[], []]
    this.m_coordsCache = []
    this.m_coords = new Map()
    this.m_parameters = new Map()
    this.m_scaleFactor = 1
    this.m_scale = DEFAULT_DISPLAY_DENSITY
    this.m_framebuffer = null
    this.m_beforeDraw = null
    this.m_afterDraw = null
    this.m_atlas = null
    this.m_shouldRepaint = false

    this.plane = new THREE.PlaneGeometry(1, 1)
    this.tileGroups = this.scene ? Array.from({ length: this.w * this.h }, () => new THREE.Group()) : []
    if (this.scene) {
      for (let ty = 0; ty < this.h; ty++) {
        for (let tx = 0; tx < this.w; tx++) {
          const g = this.tileGroups[ty * this.w + tx]
          g.position.set(tx - this.w / 2 + 0.5, (this.h - 1 - ty) - this.h / 2 + 0.5, 0)
          this.scene.add(g)
        }
      }
    }

    this.texCache = new Map()
    this.canvasTexCache = new Map()
    this.timer = 0
    this.curQueueIndex = 0
    this.map = null
    this.lockedFirstVisibleFloor = -1
    if (scene) this.m_type = DrawPoolType.MAP
  }

  setEnable(v) { this.m_enabled = !!v }
  isEnabled() { return this.m_enabled }
  getType() { return this.m_type }
  isType(type) { return this.m_type === type }
  isValid() { return !this.m_framebuffer || true }
  hasFrameBuffer() { return this.m_framebuffer != null }
  getFrameBuffer() { return this.m_framebuffer }
  repaint() { this.m_hashCtrl.forceUpdate(); this.m_refreshTimer = -1000 }
  agroup(v) { this.m_alwaysGroupDrawings = !!v }
  setScaleFactor(scale) { this.m_scaleFactor = scale }
  getScaleFactor() { return this.m_scaleFactor }
  isScaled() { return this.m_scaleFactor !== DEFAULT_DISPLAY_DENSITY }
  onBeforeDraw(f) { this.m_beforeDraw = f }
  onAfterDraw(f) { this.m_afterDraw = f }
  getHashController() { return this.m_hashCtrl }
  shouldRepaint() { return this.m_shouldRepaint }
  getDrawOrder() { return this.m_currentDrawOrder }
  setDrawOrder(order) { this.m_currentDrawOrder = order }
  resetDrawOrder() { this.m_currentDrawOrder = DrawOrder.FIRST }

  getCurrentState() { return this.m_states[this.m_lastStateIndex] }
  getOpacity() { return this.getCurrentState().opacity }
  getClipRect() { return this.getCurrentState().clipRect }
  setOpacity(opacity, onlyOnce = false) {
    if (onlyOnce && !(this.m_onlyOnceStateFlag & 1)) {
      this.m_previousOpacity = this.getCurrentState().opacity
      this.m_onlyOnceStateFlag |= 1
    }
    this.getCurrentState().opacity = opacity
  }
  setClipRect(clipRect, onlyOnce = false) {
    if (onlyOnce && !(this.m_onlyOnceStateFlag & 2)) {
      this.m_previousClipRect = { ...this.getCurrentState().clipRect }
      this.m_onlyOnceStateFlag |= 2
    }
    this.getCurrentState().clipRect = clipRect ?? {}
  }
  resetOpacity() { this.getCurrentState().opacity = 1 }
  resetClipRect() { this.getCurrentState().clipRect = {} }
  resetState() {
    this.m_coords.clear()
    this.m_parameters.clear()
    this.m_hashCtrl.reset()
    this.m_states[this.m_lastStateIndex] = makePoolState()
    this.m_lastFramebufferId = 0
    this.m_shaderRefreshDelay = 0
    this.m_scale = DEFAULT_DISPLAY_DENSITY
  }
  nextStateAndReset() {
    this.m_lastStateIndex++
    if (!this.m_states[this.m_lastStateIndex]) this.m_states[this.m_lastStateIndex] = makePoolState()
    this.m_states[this.m_lastStateIndex] = makePoolState()
  }
  backState() { this.m_lastStateIndex-- }

  resetOnlyOnceParameters() {
    if (this.m_onlyOnceStateFlag === 0) return
    const s = this.getCurrentState()
    if (this.m_onlyOnceStateFlag & 1) s.opacity = this.m_previousOpacity
    if (this.m_onlyOnceStateFlag & 2) s.clipRect = { ...this.m_previousClipRect }
    if (this.m_onlyOnceStateFlag & 4) { s.shaderProgram = this.m_previousShaderProgram; s.action = this.m_previousShaderAction }
    if (this.m_onlyOnceStateFlag & 8) s.compositionMode = this.m_previousCompositionMode
    if (this.m_onlyOnceStateFlag & 16) s.blendEquation = this.m_previousBlendEquation
    this.m_onlyOnceStateFlag = 0
  }

  /** OTC: add(color, texture, method, coordsBuffer) – aqui coordsBuffer = rect (payload do addTexturedRect). */
  add(color, texture, method, coordsBuffer) {
    const hasCoord = coordsBuffer != null
    if (!this.updateHash(method ?? makeDrawMethod(), texture, color ?? {}, hasCoord)) {
      this.resetOnlyOnceParameters()
      return
    }
    const list = this.m_objects[this.m_currentDrawOrder]
    const state = this.getState(texture, null, color ?? {})
    const rect = coordsBuffer != null ? coordsBuffer : (method && (method.dest != null || method.src != null)
      ? { tileX: method.dest?.x ?? 0, tileY: method.dest?.y ?? 0, texture, width: method.dest?.width ?? 1, height: method.dest?.height ?? 1, z: method.intValue ?? 0, dx: 0, dy: 0 }
      : null)
    if (!list.length || !poolStateEquals(list[list.length - 1].state, state) || !list[list.length - 1].coords) {
      list.push(makeDrawObjectState(state, rect))
    } else if (rect) {
      const last = list[list.length - 1]
      if (last.coords && typeof last.coords === 'object' && !Array.isArray(last.coords)) last.coords = [last.coords]
      if (last.coords) last.coords.push(rect)
      else list.push(makeDrawObjectState(state, rect))
    }
    this.resetOnlyOnceParameters()
  }

  updateHash(method, texture, color, hasCoord) {
    const state = this.getCurrentState()
    let h = 0
    if (this.m_bindedFramebuffers > -1) h = (h * 31 + this.m_lastFramebufferId) | 0
    if (state.opacity !== 1) h = (h * 31 + (state.opacity * 1000) | 0) | 0
    if (color && (color.r !== 1 || color.g !== 1 || color.b !== 1)) h = (h * 31 + (color.r + color.g * 2 + color.b * 3) | 0) | 0
    if (texture && typeof texture.hash === 'function') h = (h * 31 + texture.hash()) | 0
    else if (texture && texture.id) h = (h * 31 + texture.id) | 0
    if (hasCoord && method) {
      if (method.dest) h = (h * 31 + (method.dest.x + method.dest.y * 1000) | 0) | 0
      if (method.src) h = (h * 31 + (method.src.x + method.src.y * 1000) | 0) | 0
    }
    state.hash = h
    if (this.hasFrameBuffer()) {
      let poolHash = state.hash
      if (method?.dest) poolHash = (poolHash * 31 + (method.dest.x + method.dest.y * 1000) | 0) | 0
      if (!hasCoord && this.m_hashCtrl.isLast(poolHash)) return false
      this.m_hashCtrl.put(poolHash)
    }
    return true
  }

  getState(texture, textureAtlas, color) {
    const copy = makePoolState({
      ...this.getCurrentState(),
      color: color ?? this.getCurrentState().color,
      texture: textureAtlas || texture || this.getCurrentState().texture,
      textureId: texture?.id ?? this.getCurrentState().textureId,
    })
    return copy
  }

  setFPS(fps) { this.m_refreshDelay = 1000 / fps }

  /** OTC: addAction(action, hash) – MAP pool usa order THIRD. */
  addAction(action, hash = 0) {
    const order = this.m_type === DrawPoolType.MAP ? DrawOrder.THIRD : DrawOrder.FIRST
    this.m_objects[order].push(makeDrawObjectAction(action))
    if (this.hasFrameBuffer() && hash > 0 && !this.m_hashCtrl.isLast(hash)) this.m_hashCtrl.put(hash)
  }

  /** OTC: flush() – merge m_objects into m_objectsFlushed by DrawOrder; merge consecutive same state. */
  flush() {
    this.m_coords.clear()
    for (let o = 0; o < DrawOrder.LAST; o++) {
      const objs = this.m_objects[o]
      let addFirst = true
      if (objs.length && this.m_objectsFlushed.length) {
        const last = this.m_objectsFlushed[this.m_objectsFlushed.length - 1]
        const first = objs[0]
        if (poolStateEquals(last.state, first.state) && last.coords && first.coords) {
          if (Array.isArray(last.coords)) last.coords.push(...(Array.isArray(first.coords) ? first.coords : [first.coords]))
          else last.coords = [last.coords, ...(Array.isArray(first.coords) ? first.coords : [first.coords])]
          addFirst = false
        }
      }
      if (objs.length) {
        const start = addFirst ? 0 : 1
        for (let i = start; i < objs.length; i++) this.m_objectsFlushed.push(objs[i])
        objs.length = 0
      }
    }
  }

  /** OTC: release() – merge m_objectsFlushed + m_objects into m_objectsDraw[0], set m_shouldRepaint. */
  release() {
    if (this.hasFrameBuffer() && !this.m_hashCtrl.wasModified()) {
      for (const objs of this.m_objects) objs.length = 0
      this.m_objectsFlushed.length = 0
      return
    }
    this.m_objectsDraw[0].length = 0
    if (this.m_objectsFlushed.length) {
      this.m_objectsDraw[0].push(...this.m_objectsFlushed)
      this.m_objectsFlushed.length = 0
    }
    for (const objs of this.m_objects) {
      let addFirst = true
      if (this.m_objectsDraw[0].length && objs.length) {
        const last = this.m_objectsDraw[0][this.m_objectsDraw[0].length - 1]
        const first = objs[0]
        if (poolStateEquals(last.state, first.state) && last.coords && first.coords) {
          if (Array.isArray(last.coords)) last.coords.push(...(Array.isArray(first.coords) ? first.coords : [first.coords]))
          else last.coords = [last.coords, ...(Array.isArray(first.coords) ? first.coords : [first.coords])]
          addFirst = false
        }
      }
      if (objs.length) {
        const start = addFirst ? 0 : 1
        for (let i = start; i < objs.length; i++) this.m_objectsDraw[0].push(objs[i])
        objs.length = 0
      }
    }
    this.m_shouldRepaint = true
  }

  scale(factor) {
    if (this.m_scale === factor) return
    this.m_scale = factor
    this.getCurrentState().transformMatrix = { scale: factor }
  }

  translate(x, y) {
    const s = this.getCurrentState()
    s.transformMatrix = s.transformMatrix || {}
    s.transformMatrix.translate = s.transformMatrix.translate || { x: 0, y: 0 }
    s.transformMatrix.translate.x += x
    s.transformMatrix.translate.y += y
  }

  rotate(angle) {
    this.getCurrentState().transformMatrix = this.getCurrentState().transformMatrix || {}
    this.getCurrentState().transformMatrix.rotate = angle
  }

  pushTransformMatrix() {
    this.m_transformMatrixStack.push({ ...this.getCurrentState().transformMatrix })
  }

  popTransformMatrix() {
    if (this.m_transformMatrixStack.length) {
      this.getCurrentState().transformMatrix = this.m_transformMatrixStack.pop()
    }
  }

  // —— Integração com o resto do projeto (MapView, Tile, ThingType) ——

  setMap(map) { this.map = map }
  coveredUp(pos) { return { x: pos.x + 1, y: pos.y + 1, z: pos.z - 1 } }
  coveredDown(pos) { return { x: pos.x - 1, y: pos.y - 1, z: pos.z + 1 } }
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
    if (isFreeView) return !!(tt.ground || tt.onBottom)
    return !!(tt.ground || (tt.onBottom && tt.blockProjectile))
  }

  calcFirstVisibleFloor(types) {
    const SEA_FLOOR = 7, AWARE_UNDERGROUND_FLOOR_RANGE = 2, UNDERGROUND_FLOOR = 8, MAX_Z = 15
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
      return (sx >= 0 && sy >= 0) ? map.getTile(sx, sy, z) || null : null
    }
    let firstFloor = 0
    for (let ix = -1; ix <= 1 && firstFloor < cameraZ; ix++) {
      for (let iy = -1; iy <= 1 && firstFloor < cameraZ; iy++) {
        const isOrthogonal = Math.abs(ix) !== Math.abs(iy)
        const canCheck = (ix === 0 && iy === 0) || (isOrthogonal && this.isLookPossibleAt(cameraX + ix, cameraY + iy, cameraZ, types))
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
    if (cameraZ <= SEA_FLOOR) firstFloor = Math.min(firstFloor, cameraZ)
    return Math.max(0, Math.min(MAX_Z, firstFloor))
  }

  calcLastVisibleFloor(firstFloor) {
    const SEA_FLOOR = 7, AWARE_UNDERGROUND_FLOOR_RANGE = 2, MAX_Z = 15
    const map = this.map
    const cameraZ = map?.cameraZ ?? SEA_FLOOR
    if (!map || !map.multifloor) return firstFloor
    const z = cameraZ > SEA_FLOOR ? cameraZ + AWARE_UNDERGROUND_FLOOR_RANGE : SEA_FLOOR
    return Math.max(0, Math.min(MAX_Z, z))
  }

  isTileCovered(x, y, z, types) {
    const map = this.map
    if (!map) return false
    const zMin = map.zMin ?? z
    for (let zz = z - 1; zz >= zMin; zz--) {
      const base = map.getTile(x, y, z)
      const wx = base?.meta?.wx, wy = base?.meta?.wy
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
    return !!(tt && !tt.dontHide && (tt.fullGround || tt.ground || (tt.onBottom && tt.blockProjectile)))
  }

  beginFrame() {
    for (const g of this.tileGroups) {
      while (g.children.length) {
        const c = g.children.pop()
        if (c?.material) c.material.dispose()
      }
    }
    this.resetState()
    for (const objs of this.m_objects) objs.length = 0
    this.m_objectsFlushed.length = 0
    this.m_objectsDraw[0].length = 0
    this.m_states[0] = makePoolState()
    this.m_lastStateIndex = 0
    this.m_currentDrawOrder = DrawOrder.FIRST
    if (this.timer) { clearTimeout(this.timer); this.timer = 0 }
    this.curQueueIndex = 0
  }

  endFrame() {
    this.flush()
    this.release()
    const list = this.m_objectsDraw[0]
    if (this.debugQueue) {
      const pump = () => {
        if (this.curQueueIndex >= list.length) return
        const obj = list[this.curQueueIndex++]
        if (obj) this._executeDrawObject(obj)
        this.timer = setTimeout(pump, this.debugDelayMs)
      }
      this.timer = setTimeout(pump, this.debugDelayMs)
    } else {
      for (const obj of list) this._executeDrawObject(obj)
    }
  }

  _executeDrawObject(obj) {
    if (obj.action) {
      obj.action()
      return
    }
    const rects = obj.coords == null ? [] : Array.isArray(obj.coords) ? obj.coords : [obj.coords]
    for (const rect of rects) {
      if (rect && (rect.texture || rect.tileX != null)) this._draw(rect)
    }
  }

  tileOrder(x, y) { return ((x + y) * this.h + y) * 1000 }

  texForSprite(spriteId, sprites) {
    if (!spriteId || !sprites) return null
    if (this.texCache.has(spriteId)) return this.texCache.get(spriteId)
    const canvas = sprites.getCanvas(spriteId)
    if (!canvas) { this.texCache.set(spriteId, null); return null }
    const tex = new THREE.CanvasTexture(canvas)
    tex.magFilter = tex.minFilter = THREE.NearestFilter
    this.texCache.set(spriteId, tex)
    return tex
  }
  texForCanvas(canvas) {
    if (!canvas) return null
    if (this.canvasTexCache.has(canvas)) return this.canvasTexCache.get(canvas)
    const tex = new THREE.CanvasTexture(canvas)
    tex.magFilter = tex.minFilter = THREE.NearestFilter
    this.canvasTexCache.set(canvas, tex)
    return tex
  }

  getSpriteIndex(tt, bw, bh, layer, xPat, yPat, zPat, phase) {
    if (typeof tt?.getSpriteIndex === 'function') return tt.getSpriteIndex(0, 0, layer, xPat, yPat, zPat, phase)
    const layers = tt.layers ?? tt.m_layers ?? 1
    const px = tt.patternX ?? tt.m_numPatternX ?? 1
    const py = tt.patternY ?? tt.m_numPatternY ?? 1
    const pz = tt.patternZ ?? tt.m_numPatternZ ?? 1
    const ph = Math.max(1, tt.phases ?? tt.m_animationPhases ?? 1)
    if (layer >= layers || xPat >= px || yPat >= py || zPat >= pz || phase >= ph) return -1
    return ((((((phase % ph) * pz + zPat) * py + yPat) * px + xPat) * layers + layer) * bh + 0) * bw + 0
  }

  /** OTC: addTexturedRect – enfileira rect no m_objects[m_currentDrawOrder] (equivalente a add com method = rect). */
  addTexturedRect(rect) {
    if (!rect?.texture) return
    const method = makeDrawMethod({
      type: DrawMethodType.RECT,
      dest: { x: rect.tileX ?? 0, y: rect.tileY ?? 0, width: rect.width ?? 1, height: rect.height ?? 1 },
      intValue: rect.z ?? 0,
    })
    this.add(rect.color ?? {}, rect.texture, method, rect)
  }

  enqueueDraw(_pass, job) { this.addTexturedRect(job) }
  flushNow() { this.flush(); this.release(); for (const obj of this.m_objectsDraw[0]) this._executeDrawObject(obj) }

  _draw(rect) {
    const tileX = rect.tileX ?? 0
    const tileY = rect.tileY ?? 0
    const texture = rect.texture
    const width = rect.width ?? 1
    const height = rect.height ?? 1
    const z = rect.z ?? 0
    const dx = rect.dx ?? 0
    const dy = rect.dy ?? 0
    const tx = Math.max(0, Math.min(this.w - 1, Math.floor(tileX)))
    const ty = Math.max(0, Math.min(this.h - 1, Math.floor(tileY)))
    if (!texture || !this.tileGroups.length) return
    const mat = new THREE.MeshBasicMaterial({ map: texture, transparent: true })
    mat.depthTest = false
    mat.depthWrite = false
    const m = new THREE.Mesh(this.plane, mat)
    m.visible = true
    m.scale.set(width, height, 1)
    const ox = width > 1 ? (width - 1) / 2 : 0
    let oy = height > 1 ? (height - 1) / 2 : 0
    if (height > 1) oy -= 1
    const threeZ = -z
    m.position.set(ox + dx + (tileX - tx), oy + dy + (tileY - ty), threeZ)
    m.renderOrder = 15 - z
    this.tileGroups[ty * this.w + tx].add(m)
  }
}
/** OTC: DrawPoolManager – drawpoolmanager.h/cpp; get(type), repaint(type). Usado por Map::notificateCameraMove. */
class DrawPoolManager {
  constructor() {
    this.m_pools = {}
  }

  get(type) {
    return this.m_pools[type] ?? null
  }

  repaint(drawPoolType) {
    const pool = this.get(drawPoolType)
    if (pool && typeof pool.repaint === 'function') pool.repaint()
  }

  /** Liga um pool a um tipo (ex.: MapView registra seu pipeline em addMapView). */
  setPool(type, pool) {
    if (type != null) this.m_pools[type] = pool ?? null
  }
}

/** OTC: extern Map g_map; equivalente para draw pool – g_drawPool (drawpoolmanager). */
export const g_drawPool = new DrawPoolManager()

