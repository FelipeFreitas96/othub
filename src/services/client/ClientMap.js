/**
 * Map – port do OTClient src/client/map.h + map.cpp
 * Copyright (c) 2010-2020 OTClient; portado para JS neste projeto.
 * Apenas funções que existem em map.cpp.
 * Walk: delegado à Creature (OTC: estado de walk fica na Creature).
 * View state: construído via getTile (OTC: MapView usa map.getTile).
 */
import { Creature } from './Creature.js'
import { localPlayer } from '../game/LocalPlayer.js'
import { Tile } from './Tile.js'
import { g_drawPool } from '../graphics/DrawPoolManager.js'
import { DrawPoolType } from '../graphics/DrawPool.js'

const SEA_FLOOR = 7
const MAX_Z = 15
const AWARE_UNDEGROUND_FLOOR_RANGE = 2

export class ClientMap {
  constructor() {
    this.m_centralPosition = { x: 0, y: 0, z: SEA_FLOOR }
    this.m_tiles = new Map()
    this.m_knownCreatures = new Map()
    this.m_awareRange = { left: 8, right: 9, top: 6, bottom: 7 }
    this.m_mapKnown = false
    this.w = 18
    this.h = 14
    /** OTC: Map::m_mapViews – map.h; addMapView/removeMapView (map.cpp L88-96). */
    this.m_mapViews = []
  }

  /** OTC: Map::addMapView(const MapViewPtr& mapView) – map.cpp L88. Registra pipeline em g_drawPool para FOREGROUND_MAP e CREATURE_INFORMATION (OTC usa mesmo atlas). */
  addMapView(mapView) {
    if (!mapView || this.m_mapViews.includes(mapView)) return
    this.m_mapViews.push(mapView)
    if (mapView.pipeline) {
      g_drawPool.setPool(DrawPoolType.FOREGROUND_MAP, mapView.pipeline)
      g_drawPool.setPool(DrawPoolType.CREATURE_INFORMATION, mapView.pipeline)
    }
  }

  /** OTC: Map::removeMapView(const MapViewPtr& mapView) – map.cpp L91-96. */
  removeMapView(mapView) {
    const i = this.m_mapViews.indexOf(mapView)
    if (i >= 0) this.m_mapViews.splice(i, 1)
  }

  /** OTC: Map::getMapView(size_t i) – map.h L76. */
  getMapView(i) {
    return i >= 0 && i < this.m_mapViews.length ? this.m_mapViews[i] : null
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
    if (!pos || pos.x === this.m_centralPosition.x && pos.y === this.m_centralPosition.y && pos.z === this.m_centralPosition.z) return
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
      tile = { pos: { ...pos }, things: [], walkingCreatures: [] }
      this.m_tiles.set(k, tile)
    }
    if (!tile.walkingCreatures) tile.walkingCreatures = []
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

  /** OTC: Map::notificateCameraMove(const Point& offset) – map.cpp L105-113. */
  notificateCameraMove(offset) {
    g_drawPool.repaint(DrawPoolType.FOREGROUND_MAP)
    g_drawPool.repaint(DrawPoolType.CREATURE_INFORMATION)
    for (const mapView of this.m_mapViews) {
      mapView.onCameraMove(offset)
    }
  }

  /** OTC: Map::notificateTileUpdate(pos, thing, operation) – map.cpp L115-126: if !pos.isMapPosition() return; for mapView mapView->onTileUpdate(pos, thing, op); if thing&&isItem g_minimap.updateTile. */
  notificateTileUpdate(pos, thing, operation) {
    if (!pos || !Number.isFinite(pos.x) || !Number.isFinite(pos.y) || !Number.isFinite(pos.z)) return
    for (const mapView of this.m_mapViews) {
      mapView.onTileUpdate?.(pos, thing, operation)
    }
  }

  /** OTC: Map::notificateWalkTerminated(creature) – notifica fim do walk; instância singular sobrescreve para localPlayer.terminateWalk. */
  notificateWalkTerminated(creature) {
    // Base: vazio; singleton sobrescreve
  }

  /**
   * OTC: Map::addThing(thing, pos, stackPos) – early return !thing; item id 0; missile stub; getOrCreateTile; add if m_floatingEffect || !isEffect || tile has ground; tile->addThing; notificateTileUpdate.
   */
  addThing(thing, pos, stackPos = -1) {
    if (!thing) return

    if (thing.kind === 'item' && (thing.id == null || thing.id === 0)) return

    if (thing.kind === 'missile') {
      return
    }

    const tile = this.getOrCreateTile(pos)
    if (!tile) return

    const floatingEffect = this.m_floatingEffect ?? false
    const isEffect = thing.kind === 'effect'
    const hasGround = (tile.things?.length ?? 0) > 0

    if (floatingEffect || !isEffect || hasGround) {
      if (stackPos < 0 || stackPos >= tile.things.length) tile.things.push(thing)
      else tile.things.splice(stackPos, 0, thing)
      this.notificateTileUpdate(pos, thing, 'add')
    }
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
    if (id == null) return null
    return this.m_knownCreatures.get(id) ?? this.m_knownCreatures.get(Number(id)) ?? this.m_knownCreatures.get(String(id)) ?? null
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
   * Constrói o grid de um andar a partir de getTile (OTC: MapView usa map.getTile; sem snapshot separado).
   * Origem por andar: parseMapDescription usa offset = nz - z, então andar abaixo fica em (baseX+1, baseY+1).
   * Para bater, view (0,0) no andar z deve ser world (center.x - left + (z - center.z), center.y - top + (z - center.z), z).
   */
  snapshotFloor(z) {
    const center = this.getCentralPosition()
    const r = this.getAwareRange()
    const { w, h } = this.getAwareDims()
    const out = Array.from({ length: h }, () => Array.from({ length: w }, () => ({ groundId: 0, stack: [], wx: 0, wy: 0, z })))
    const dz = z - center.z
    const ox = center.x - r.left + dz
    const oy = center.y - r.top + dz
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const pos = { x: ox + x, y: oy + y, z }
      const tile = this.getTile(pos)
      out[y][x].wx = pos.x
      out[y][x].wy = pos.y
      const walkingCreatures = []
      if (tile && (tile.walkingCreatures || []).length) {
        for (const c of (tile.walkingCreatures || [])) {
          const off = c.getWalkOffset?.() ?? { x: 0, y: 0 }
          walkingCreatures.push({
            entry: { ...(c.m_entry || {}), direction: c.m_direction, walking: true, walkAnimationPhase: c.m_walkAnimationPhase ?? 0 },
            offsetX: off.x,
            offsetY: off.y,
          })
        }
      }
      if (!tile || !tile.things?.length) {
        out[y][x].walkingCreatures = walkingCreatures
        continue
      }
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
      out[y][x] = { groundId, stack, wx: pos.x, wy: pos.y, z, walkingCreatures }
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
      if (tile?.walkingCreatures?.length) tile.walkingCreatures = []
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

  /** OTC: m_mapKnown – true após primeiro parseMapDescription (0x64). */
  get mapKnown() { return this.m_mapKnown }

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
export const g_map = new ClientMap()
