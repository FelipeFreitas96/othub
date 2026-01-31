/**
 * Map – port do OTClient src/client/map.h + map.cpp
 * Copyright (c) 2010-2020 OTClient; portado para JS neste projeto.
 * Apenas funções que existem em map.cpp.
 * Walk: delegado à Creature (OTC: estado de walk fica na Creature).
 * View state: construído via getTile (OTC: MapView usa map.getTile).
 */
import { Creature } from '../things/Creature.js'
import { localPlayer } from '../game/LocalPlayer.js'

const SEA_FLOOR = 7
const MAX_Z = 15
const AWARE_UNDEGROUND_FLOOR_RANGE = 2
const TILE_PIXELS = 32

export class MapStore {
  constructor() {
    this.m_centralPosition = { x: 0, y: 0, z: SEA_FLOOR }
    this.m_tiles = new Map()
    this.m_knownCreatures = new Map()
    this.m_awareRange = { left: 8, right: 9, top: 6, bottom: 7 }
    this.w = 18
    this.h = 14
  }

  /** OTC: dimensões da área aware (para parse 0x64). */
  getAwareDims() {
    const r = this.m_awareRange
    return { w: r.left + r.right + 1, h: r.top + r.bottom + 1 }
  }

  _key(x, y, z) {
    return `${x},${y},${z}`
  }

  getCentralPosition() {
    return { ...this.m_centralPosition }
  }

  setCentralPosition(pos) {
    if (pos.x === this.m_centralPosition.x && pos.y === this.m_centralPosition.y && pos.z === this.m_centralPosition.z) return
    this.m_centralPosition = { ...pos }
    if (this.removeUnawareThings) this.removeUnawareThings()
  }

  getAwareRange() {
    return { ...this.m_awareRange }
  }

  setAwareRange(range) {
    this.m_awareRange = { ...range }
    if (this.removeUnawareThings) this.removeUnawareThings()
  }

  resetAwareRange() {
    this.m_awareRange = { left: 8, right: 9, top: 6, bottom: 7 }
    if (this.removeUnawareThings) this.removeUnawareThings()
  }

  getFirstAwareFloor() {
    if (this.m_centralPosition.z > SEA_FLOOR) return Math.max(0, this.m_centralPosition.z - AWARE_UNDEGROUND_FLOOR_RANGE)
    return 0
  }

  getLastAwareFloor() {
    if (this.m_centralPosition.z > SEA_FLOOR) return Math.min(this.m_centralPosition.z + AWARE_UNDEGROUND_FLOOR_RANGE, MAX_Z)
    return SEA_FLOOR
  }

  isAwareOfPosition(pos) {
    if (pos.z < this.getFirstAwareFloor() || pos.z > this.getLastAwareFloor()) return false
    const c = this.m_centralPosition
    const r = this.m_awareRange
    const dx = Math.abs(pos.x - c.x)
    const dy = Math.abs(pos.y - c.y)
    return dx <= r.left && dx <= r.right && dy <= r.top && dy <= r.bottom
  }

  getTile(pos) {
    if (!pos || !Number.isFinite(pos.x) || !Number.isFinite(pos.y) || !Number.isFinite(pos.z)) return null
    return this.m_tiles.get(this._key(pos.x, pos.y, pos.z)) || null
  }

  getOrCreateTile(pos) {
    if (!pos || !Number.isFinite(pos.x) || !Number.isFinite(pos.y) || !Number.isFinite(pos.z)) return null
    const k = this._key(pos.x, pos.y, pos.z)
    let tile = this.m_tiles.get(k)
    if (!tile) {
      tile = { pos: { ...pos }, things: [] }
      this.m_tiles.set(k, tile)
    }
    return tile
  }

  getTiles(floor = -1) {
    const out = []
    if (floor > MAX_Z) return out
    if (floor < 0) {
      for (let z = 0; z <= MAX_Z; z++) {
        for (const tile of this.m_tiles.values()) {
          if (tile?.pos?.z === z) out.push(tile)
        }
      }
    } else {
      for (const tile of this.m_tiles.values()) {
        if (tile?.pos?.z === floor) out.push(tile)
      }
    }
    return out
  }

  cleanTile(pos) {
    if (!pos) return
    this.m_tiles.delete(this._key(pos.x, pos.y, pos.z))
  }

  addThing(thing, pos, stackPos = -1) {
    if (!thing) return
    const tile = this.getOrCreateTile(pos)
    if (!tile) return
    if (stackPos < 0 || stackPos >= tile.things.length) tile.things.push(thing)
    else tile.things.splice(stackPos, 0, thing)
  }

  getThing(pos, stackPos) {
    const tile = this.getTile(pos)
    if (!tile || stackPos < 0 || stackPos >= (tile.things?.length ?? 0)) return null
    return tile.things[stackPos] ?? null
  }

  removeThingByPos(pos, stackPos) {
    const tile = this.getTile(pos)
    if (!tile || stackPos < 0 || stackPos >= (tile.things?.length ?? 0)) return false
    tile.things.splice(stackPos, 1)
    if (tile.things.length === 0) this.cleanTile(pos)
    return true
  }

  /** Armazena Creature (OTC: criaturas conhecidas). Aceita Creature ou plain entry. */
  addCreature(creatureOrEntry) {
    if (!creatureOrEntry) return
    if (creatureOrEntry instanceof Creature) {
      const id = creatureOrEntry.getId?.() ?? creatureOrEntry.m_entry?.creatureId ?? creatureOrEntry.m_entry?.id
      if (id != null) this.m_knownCreatures.set(id, creatureOrEntry)
      return
    }
    const id = creatureOrEntry.creatureId ?? creatureOrEntry.id
    if (id == null) return
    let c = this.m_knownCreatures.get(id)
    if (!c) c = new Creature(creatureOrEntry)
    else c.m_entry = { ...c.m_entry, ...creatureOrEntry }
    this.m_knownCreatures.set(id, c)
  }

  getCreatureById(id) {
    return this.m_knownCreatures.get(id) ?? null
  }

  /** Encontra a posição de uma criatura nos tiles (para getMappedThing 0xffff). */
  findCreaturePosition(creatureId) {
    for (const tile of this.m_tiles.values()) {
      if (!tile?.pos || !tile.things?.length) continue
      for (let i = 0; i < tile.things.length; i++) {
        const t = tile.things[i]
        if (t.kind === 'creature' && (Number(t.creatureId) === Number(creatureId) || t.creatureId === creatureId)) {
          return { pos: { ...tile.pos }, stackPos: i }
        }
      }
    }
    return null
  }

  /**
   * OTC: atualiza walk de todas as criaturas; chama localPlayer.terminateWalk() quando o local player termina.
   */
  updateWalk(now, thingsRef) {
    const types = thingsRef?.current?.types
    for (const creature of this.m_knownCreatures.values()) {
      if (!creature.updateWalk) continue
      const terminated = creature.updateWalk(now, types)
      if (terminated && localPlayer.getId() != null && Number(creature.getId?.()) === Number(localPlayer.getId())) {
        localPlayer.terminateWalk()
      }
    }
  }

  /**
   * OTC MapView: criaturas em walk que estão visualmente neste tile (para desenhar com offset).
   */
  getWalkingCreaturesForWorldTile(wx, wy, z) {
    const out = []
    for (const creature of this.m_knownCreatures.values()) {
      if (!creature.isWalking?.() || !creature.m_fromPos || creature.m_fromPos.z !== z) continue
      const from = creature.m_fromPos
      const to = creature.m_toPos
      if (!to) continue
      const t = (creature.m_walkedPixels ?? 0) / TILE_PIXELS
      const curX = from.x + (to.x - from.x) * t
      const curY = from.y + (to.y - from.y) * t
      const tileX = Math.floor(curX)
      const tileY = Math.floor(curY)
      if (tileX !== wx || tileY !== wy) continue
      const off = creature.getWalkOffset?.() ?? { x: 0, y: 0 }
      out.push({
        entry: { ...(creature.m_entry || {}), direction: creature.m_direction, walking: true, walkAnimationPhase: creature.m_walkAnimationPhase ?? 0 },
        offsetX: off.x,
        offsetY: off.y,
      })
    }
    return out
  }

  /**
   * Constrói o grid de um andar a partir de getTile (OTC: MapView usa map.getTile; sem snapshot separado).
   */
  snapshotFloor(z) {
    const center = this.getCentralPosition()
    const r = this.getAwareRange()
    const { w, h } = this.getAwareDims()
    const out = Array.from({ length: h }, () => Array.from({ length: w }, () => ({ groundId: 0, stack: [], wx: 0, wy: 0, z })))
    const ox = center.x - r.left
    const oy = center.y - r.top
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const pos = { x: ox + x, y: oy + y, z }
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
    const center = this.getCentralPosition()
    const min = Math.min(zMin ?? center.z, zMax ?? center.z)
    const max = Math.max(zMin ?? center.z, zMax ?? center.z)
    const floors = {}
    for (let z = min; z <= max; z++) floors[z] = this.snapshotFloor(z)
    return { zMin: min, zMax: max, floors }
  }

  removeCreatureById(id) {
    if (id == null) return
    this.m_knownCreatures.delete(id)
  }

  clean() {
    this.cleanDynamicThings()
    this.m_tiles.clear()
  }

  cleanDynamicThings() {
    for (const tile of this.m_tiles.values()) {
      if (tile?.things?.length) {
        tile.things = tile.things.filter((t) => t.kind !== 'creature')
        if (tile.things.length === 0) this.cleanTile(tile.pos)
      }
    }
    this.m_knownCreatures.clear()
  }

  removeUnawareThings() {
    for (const tile of this.m_tiles.values()) {
      if (!tile?.pos || this.isAwareOfPosition(tile.pos)) continue
      for (let i = tile.things.length - 1; i >= 0; i--) {
        const t = tile.things[i]
        if (t.kind === 'creature' && (t.creatureId != null || t.id != null)) {
          this.m_knownCreatures.delete(t.creatureId ?? t.id)
          tile.things.splice(i, 1)
        }
      }
      if (tile.things.length === 0) this.cleanTile(tile.pos)
    }
  }

  /** Compat: alias para código que usa center/range/tiles/creatures/getCreature/setCenter/setTile. */
  get center() { return this.m_centralPosition }
  set center(pos) { this.setCentralPosition(pos || this.m_centralPosition) }
  get tiles() { return this.m_tiles }
  get creatures() { return this.m_knownCreatures }
  get range() { return this.m_awareRange }
  setCenter(pos) { this.setCentralPosition(pos) }
  setTile(pos, tile) {
    if (!pos) return
    this.m_tiles.set(this._key(pos.x, pos.y, pos.z), tile)
  }
  getCreature(id) { return this.getCreatureById(id) }
  upsertCreature(creature) { this.addCreature(creature) }
  key(x, y, z) { return this._key(x, y, z) }

  /**
   * Estado para a view (GameMap.loadFromOtState). Fonte única: dados do mapStore; sem DTO no protocolo.
   */
  getMapStateForView() {
    const pos = this.getCentralPosition()
    const zMin = Math.max(0, pos.z - 2)
    const zMax = Math.min(15, pos.z + 2)
    const snap = this.snapshotFloors(zMin, zMax)
    const current = snap.floors?.[pos.z] ?? this.snapshotFloor(pos.z)
    return {
      pos: { ...pos },
      w: current.w,
      h: current.h,
      tiles: current.tiles,
      floors: snap.floors,
      zMin: snap.zMin,
      zMax: snap.zMax,
      range: { ...this.m_awareRange },
      ts: Date.now(),
    }
  }
}

/** Singleton: instância única do mapa (OTC: g_map). */
const mapStoreInstance = new MapStore()

export function getMapStore() {
  return mapStoreInstance
}

if (typeof window !== 'undefined') {
  window.__otMapStore = mapStoreInstance
}
