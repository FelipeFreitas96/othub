import { Creature } from '../things/Creature.js'

export class MapStore {
  constructor() {
    this.center = { x: 0, y: 0, z: 7 }
    this.tiles = new Map() // key "x,y,z" -> { pos, things:[{kind,id,subtype}] }
    this.creatures = new Map() // creatureId -> creature data
    /** OTC: walk state por creatureId (Creature::m_walking, m_walkOffset, m_walkAnimationPhase). */
    this.walkStates = new Map() // creatureId -> { fromPos, toPos, startTime, stepDuration, direction, entry, ... }
    this.w = 18
    this.h = 14
    this.range = { left: 8, right: 9, top: 6, bottom: 7 } // OTC default
  }

  key(x, y, z) { return `${x},${y},${z}` }
  setCenter(pos) { this.center = { ...pos } }
  cleanTile(pos) { this.tiles.delete(this.key(pos.x, pos.y, pos.z)) }
  setTile(pos, tile) { this.tiles.set(this.key(pos.x, pos.y, pos.z), tile) }
  getTile(pos) { return this.tiles.get(this.key(pos.x, pos.y, pos.z)) || null }
  upsertCreature(creature) { if (creature?.id) this.creatures.set(creature.id, creature) }
  getCreature(id) { return this.creatures.get(id) || null }

  /** OTC: acha posição atual da criatura no mapa (para getMappedThing por creatureId). */
  findCreaturePosition(creatureId) {
    for (const tile of this.tiles.values()) {
      const idx = tile.things?.findIndex(
        (t) => t.kind === 'creature' && (t.creatureId === creatureId || t.id === creatureId)
      )
      if (idx >= 0) return { pos: tile.pos }
    }
    return null
  }

  /**
   * OTC Creature::walk(oldPos, newPos) – inicia walk; remove criatura do tile antigo, coloca no novo, registra estado.
   * @param {boolean} skipTileUpdate - se true, só registra walk state (mapa já foi atualizado pelo protocolo, ex.: 0x64).
   */
  startWalk(creatureId, fromPos, toPos, entry, skipTileUpdate = false) {
    const c = this.getCreature(creatureId) || entry
    const data = { ...(c && typeof c === 'object' ? c : {}), ...(entry && typeof entry === 'object' ? entry : {}) }
    const direction = Creature.getDirectionFromPosition(fromPos, toPos)
    const stepDuration = Creature.getStepDuration(data, fromPos, toPos)
    this.walkStates.set(creatureId, {
      creatureId,
      fromPos: { ...fromPos },
      toPos: { ...toPos },
      startTime: typeof performance !== 'undefined' ? performance.now() : Date.now(),
      stepDuration,
      direction,
      entry: data,
      walking: true,
      walkedPixels: 0,
      walkAnimationPhase: 0,
      footStep: 0,
      lastFootTime: 0,
    })
    if (skipTileUpdate) return
    const tileFrom = this.getTile(fromPos)
    if (tileFrom?.things?.length) {
      const thingsFrom = tileFrom.things.filter((t) => !(t.kind === 'creature' && (t.creatureId === creatureId || t.id === creatureId)))
      this.setTile(fromPos, { pos: fromPos, things: thingsFrom })
    } else {
      this.cleanTile(fromPos)
    }
    const tileAtTo = this.getTile(toPos)
    const existing = tileAtTo?.things ? [...tileAtTo.things] : []
    existing.push({ kind: 'creature', creatureId, id: data.outfit?.lookType || 0, outfit: data.outfit || null, direction, name: data.name || '' })
    this.setTile(toPos, { pos: toPos, things: existing })
  }

  /**
   * Atualiza todos os walk states (chamar a cada frame). OTC: nextWalkUpdate → updateWalk.
   */
  updateWalk(now, thingsRef) {
    const types = thingsRef?.current?.types
    for (const [creatureId, state] of this.walkStates) {
      if (!state.walking) continue
      const entry = state.entry || {}
      const lookType = entry.outfit?.lookType ?? entry.lookType ?? 0
      const tt = types?.getCreature?.(lookType)
      const phases = tt?.getAnimationPhases?.() ?? tt?.phases ?? 1
      Creature.updateWalkState(state, now, phases)
      if (!state.walking) this.walkStates.delete(creatureId)
    }
  }

  /**
   * Retorna criaturas em walk que estão visualmente no tile (wx, wy, z). OTC: m_walkingTile.
   */
  getWalkingCreaturesForWorldTile(wx, wy, z) {
    const TILE_PIXELS = 32
    const out = []
    for (const state of this.walkStates.values()) {
      if (!state.walking || state.fromPos.z !== z) continue
      const from = state.fromPos
      const to = state.toPos
      const t = state.walkedPixels / TILE_PIXELS
      const curX = from.x + (to.x - from.x) * t
      const curY = from.y + (to.y - from.y) * t
      const tileX = Math.floor(curX)
      const tileY = Math.floor(curY)
      if (tileX !== wx || tileY !== wy) continue
      out.push({
        entry: { ...state.entry, direction: state.direction, walking: true, walkAnimationPhase: state.walkAnimationPhase ?? 0 },
        offsetX: state.walkOffsetX ?? 0,
        offsetY: state.walkOffsetY ?? 0,
      })
    }
    return out
  }

  getAwareDims() { return { w: this.range.left + this.range.right + 1, h: this.range.top + this.range.bottom + 1 } }

  snapshotFloor(z = this.center.z) {
    const { w, h } = this.getAwareDims()
    const out = Array.from({ length: h }, () => Array.from({ length: w }, () => ({ groundId: 0, stack: [], wx: 0, wy: 0, z })))
    const ox = this.center.x - this.range.left
    const oy = this.center.y - this.range.top
    const dz = z - (this.center?.z ?? 0)
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      // OTClient-style: floors are projected with (dz, dz) translation.
      const pos = { x: ox + x + dz, y: oy + y + dz, z }
      const tile = this.getTile(pos)
      out[y][x].wx = pos.x
      out[y][x].wy = pos.y
      if (!tile || !tile.things?.length) continue
      let groundId = 0
      const stack = []
      for (const t of tile.things) {
        if (t.kind === 'item') {
          if (!groundId) groundId = t.id
          stack.push({ kind: 'item', id: t.id, subtype: t.subtype ?? null })
        } else if (t.kind === 'creature') {
          stack.push({ kind: 'creature', id: t.id, creatureId: t.creatureId, outfit: t.outfit || null, direction: t.direction ?? 0, name: t.name || '' })
        }
      }
      out[y][x] = { groundId, stack, wx: pos.x, wy: pos.y, z }
    }
    return { w, h, tiles: out }
  }

  snapshotFloors(zMin, zMax) {
    const min = Math.min(zMin ?? this.center.z, zMax ?? this.center.z)
    const max = Math.max(zMin ?? this.center.z, zMax ?? this.center.z)
    const floors = {}
    for (let z = min; z <= max; z++) floors[z] = this.snapshotFloor(z)
    return { zMin: min, zMax: max, floors }
  }
}
