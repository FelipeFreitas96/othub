/**
 * Map – port do OTClient src/client/map.h + map.cpp
 * Copyright (c) 2010-2020 OTClient; portado para JS neste projeto.
 * Apenas funções que existem em map.cpp.
 * Walk: delegado à Creature (OTC: estado de walk fica na Creature).
 * View state: construído via getTile (OTC: MapView usa map.getTile).
 */
import { Creature } from './Creature'
import { Tile } from './Tile'
import { g_drawPool } from '../graphics/DrawPoolManager'
import { DrawPoolType } from '../graphics/DrawPool'
import { g_dispatcher } from '../framework/EventDispatcher'
import { g_player } from './LocalPlayer'
import { Thing, MapView } from './types'
import type { Light } from './types'
import { Position, PositionLike, ensurePosition } from './Position'
import { Item } from './Item'
import { Missile } from './Missile'
import { AnimatedText } from './AnimatedText'

const SEA_FLOOR = 7
const MAX_Z = 15
const AWARE_UNDEGROUND_FLOOR_RANGE = 2

export interface SnapshotTile {
  groundId: number
  stack: Thing[]  // Agora usa Thing diretamente em vez de objetos serializados
  wx: number
  wy: number
  z: number
  walkingCreatures?: Creature[]
}

export interface SnapshotFloor {
  w: number
  h: number
  tiles: SnapshotTile[][]
}

export class ClientMap {
  m_centralPosition: Position
  m_tiles: Map<string, Tile>
  m_knownCreatures: Map<number | string, Creature>
  m_awareRange: { left: number, right: number, top: number, bottom: number }
  m_mapKnown: boolean
  w: number
  h: number
  m_mapViews: MapView[]
  m_floatingEffect?: boolean
  /** OTC Map::setLight / getLight – luz global (subterrâneo). */
  m_light: Light = { intensity: 250, color: 215 }
  /** OTC: m_floors[z].missiles – map.cpp removeThing (missile branch). */
  m_floors: Record<number, { missiles: Thing[] }> = {}
  /** OTC: m_animatedTexts – map.h L248. */
  m_animatedTexts: AnimatedText[] = []

  constructor() {
    this.m_centralPosition = new Position(0, 0, SEA_FLOOR)
    this.m_tiles = new Map()
    this.m_knownCreatures = new Map()
    this.m_awareRange = { left: 8, right: 9, top: 6, bottom: 7 }
    this.m_mapKnown = false
    this.w = 18
    this.h = 14
    /** OTC: Map::m_mapViews – map.h; addMapView/removeMapView (map.cpp L88-96). */
    this.m_mapViews = []
  }

  /** OTC: Map::addMapView(const MapViewPtr& mapView) – map.cpp L88. Registra pipeline; se local player já no mapa, follow. */
  addMapView(mapView: MapView) {
    this.m_mapViews.push(mapView)
  }

  /** OTC: Map::removeMapView(const MapViewPtr& mapView) – map.cpp L91-96. */
  removeMapView(mapView: MapView) {
    const i = this.m_mapViews.indexOf(mapView)
    if (i >= 0) this.m_mapViews.splice(i, 1)
  }

  /** OTC: Map::getMapView(size_t i) – map.h L76. */
  getMapView(i: number) {
    return i >= 0 && i < this.m_mapViews.length ? this.m_mapViews[i] : null
  }

  /** OTC: dimensões da área aware (para parse 0x64). */
  getAwareDims() {
    const r = this.m_awareRange
    return { w: r.left + r.right + 1, h: r.top + r.bottom + 1 }
  }

  _key(x: number, y: number, z: number) {
    return `${x},${y},${z}`
  }

  getCentralPosition(): Position {
    return this.m_centralPosition.clone()
  }

  /** OTC Map::setCentralPosition – map.cpp L421-448: fix local player when removed from map; notify mapViews onMapCenterChange. */
  setCentralPosition(pos: Position) {
    if (!pos || (pos.x === this.m_centralPosition.x && pos.y === this.m_centralPosition.y && pos.z === this.m_centralPosition.z)) return
    const centralPosition = pos instanceof Position ? pos.clone() : Position.from(pos)
    this.m_centralPosition = centralPosition
    // @ts-ignore
    if (this.removeUnawareThings) this.removeUnawareThings()

    // OTC: fix local player position when removed from map (too many creatures on tile → no stackpos from server)
    g_dispatcher.addEvent(() => {
      const playerId = g_player?.getId?.()
      if (playerId == null) return
      const creature = this.getCreatureById(playerId)
      if (!creature?.getPosition) return
      const playerPos = creature.getPosition()
      if (playerPos && playerPos.x === centralPosition.x && playerPos.y === centralPosition.y && playerPos.z === centralPosition.z) return
      const tile = creature.getTile?.()
      if (tile && tile.m_things?.includes(creature)) return
      const oldPos = creature.getPosition()
      if (oldPos && (oldPos.x !== centralPosition.x || oldPos.y !== centralPosition.y)) {
        if (!creature.m_removed) creature.onDisappear?.()
        creature.setPosition(centralPosition)
        creature.onAppear?.()
      }
    })

    for (const mapView of this.m_mapViews) {
      const oldPos = (mapView as any).getLastCameraPosition?.() ?? null
        ; (mapView as any).onMapCenterChange?.(centralPosition, oldPos)
    }
  }

  getAwareRange() {
    return { ...this.m_awareRange }
  }

  setAwareRange(range: { left: number, right: number, top: number, bottom: number }) {
    this.m_awareRange = { ...range }
    // @ts-ignore
    if (this.removeUnawareThings) this.removeUnawareThings()
  }

  resetAwareRange() {
    this.m_awareRange = { left: 8, right: 8, top: 6, bottom: 6 }
    // @ts-ignore
    if (this.removeUnawareThings) this.removeUnawareThings()
  }

  getFirstAwareFloor() {
    if (this.m_centralPosition.z > SEA_FLOOR) return Math.max(0, this.m_centralPosition.z - AWARE_UNDEGROUND_FLOOR_RANGE)
    return 0
  }

  getLight(): Light { return { ...this.m_light } }
  setLight(light: Light) {
    this.m_light = { ...light }
    this.m_mapViews.forEach((mv: any) => mv.onGlobalLightChange?.(this.m_light))
  }

  getLastAwareFloor() {
    if (this.m_centralPosition.z > SEA_FLOOR) return Math.min(this.m_centralPosition.z + AWARE_UNDEGROUND_FLOOR_RANGE, MAX_Z)
    return SEA_FLOOR
  }

  isAwareOfPosition(pos: Position) {
    if (pos.z < this.getFirstAwareFloor() || pos.z > this.getLastAwareFloor()) return false
    const c = this.m_centralPosition
    const r = this.m_awareRange
    const relX = pos.x - c.x
    const relY = pos.y - c.y
    return relX >= -r.left && relX <= r.right && relY >= -r.top && relY <= r.bottom
  }

  /** OTC Map::isLookPossible(pos) – tiles we can look through (e.g. windows, doors). Stub: true. */
  isLookPossible(_pos: PositionLike): boolean {
    return true
  }

  getTile(pos: PositionLike): Tile | null {
    if (!pos || !Number.isFinite(pos.x) || !Number.isFinite(pos.y) || !Number.isFinite(pos.z)) return null
    return this.m_tiles.get(this._key(pos.x, pos.y, pos.z)) || null
  }

  /** OTC: same as getTile({ x, y, z }). */
  getTileWorld(x: number, y: number, z: number): Tile | null {
    return this.getTile({ x, y, z })
  }

  /**
   * OTC Map::isCovered(pos, isLoading, firstFloor) – map.cpp L699-722.
   * Check tiles on top of position; if any is fully opaque or has top ground, position is covered.
   */
  isCovered(pos: PositionLike, isLoadingRef: { isLoading: boolean }, firstFloor: number): boolean {
    const tilePos = Position.from(pos).clone()
    while (tilePos.coveredUp(1) && tilePos.z >= firstFloor) {
      const tile = this.getTile(tilePos)
      if (tile?.isLoading?.()) {
        isLoadingRef.isLoading = true
        return false
      }
      if (tile?.isFullyOpaque?.()) return true
      const tile11 = this.getTile(tilePos.translated(1, 1))
      if (tile11?.hasTopGround?.()) return true
    }
    return false
  }

  /**
   * OTC Map::isCompletelyCovered(pos, isLoading, firstFloor) – map.cpp L724-773.
   * For each floor above (coveredUp): (1) Top Ground check at tilePos and tilePos+(1,1); (2) 2x2 isFullyOpaque at tilePos.translated(-x,-y).
   */
  isCompletelyCovered(pos: PositionLike, isLoadingRef: { isLoading: boolean }, firstFloor: number, types?: any): boolean {
    const checkTile = this.getTile(pos)
    const tilePos = Position.from(pos).clone()
    while (tilePos.coveredUp(1) && tilePos.z >= firstFloor) {
      let covered = true
      let done = false
      // Check is Top Ground – OTC: getTile(tilePos.translated(x, y)) for x,y in 0..1
      for (let x = 0; x < 2 && !done; x++) {
        for (let y = 0; y < 2 && !done; y++) {
          const tile = this.getTile(tilePos.translated(x, y))
          if (!tile || !tile.hasTopGround()) {
            covered = false
            done = true
          } else if (x === 1 && y === 1 && (!checkTile || checkTile.isSingleDimension(types))) {
            done = true
          }
        }
      }
      if (covered) return true

      covered = true
      done = false
      // check in 2x2 range tiles that have no transparent pixels – OTC: getTile(tilePos.translated(-x, -y))
      for (let x = 0; x < 2 && !done; x++) {
        for (let y = 0; y < 2 && !done; y++) {
          const tile = this.getTile(tilePos.translated(-x, -y))
          if (tile?.isLoading?.()) {
            isLoadingRef.isLoading = true
            return false
          }
          if (!tile || !tile.isFullyOpaque()) {
            covered = false
            done = true
          } else if (x === 0 && y === 0 && (!checkTile || checkTile.isSingleDimension(types))) {
            done = true
          }
        }
      }
      if (covered) return true
    }
    return false
  }

  getOrCreateTile(pos: PositionLike): Tile | null {
    if (!pos || !Number.isFinite(pos.x) || !Number.isFinite(pos.y) || !Number.isFinite(pos.z)) return null
    const k = this._key(pos.x, pos.y, pos.z)
    let tile = this.m_tiles.get(k)
    if (!tile) {
      tile = new Tile(pos.x, pos.y, pos.z)
      this.m_tiles.set(k, tile)
    }
    return tile
  }

  setTile(pos: Position, tile: Tile) {
    if (!pos || !tile) return
    const k = this._key(pos.x, pos.y, pos.z)
    this.m_tiles.set(k, tile)
  }

  getTiles(floor: number = -1): Tile[] {
    const out: Tile[] = []
    if (floor > MAX_Z) return out
    if (floor < 0) {
      for (let z = 0; z <= MAX_Z; z++) {
        for (const tile of this.m_tiles.values()) {
          if (tile?.m_position?.z === z) out.push(tile)
        }
      }
    } else {
      for (const tile of this.m_tiles.values()) {
        if (tile?.m_position?.z === floor) out.push(tile)
      }
    }
    return out
  }

  cleanTile(pos: Position) {
    const key = this._key(pos.x, pos.y, pos.z)
    const tile = this.m_tiles.get(key)
    if (!tile) {
      return
    }

    tile.clean()
    if (tile.canErase()) {
      this.m_tiles.delete(key)
    }
    this.notificateTileUpdate(pos, null, 'clean')
  }

  /** OTC: Map::notificateCameraMove(const Point& offset) – map.cpp L105-113. */
  notificateCameraMove(offset: { x: number, y: number }) {
    g_drawPool.repaint(DrawPoolType.FOREGROUND_MAP)
    g_drawPool.repaint(DrawPoolType.CREATURE_INFORMATION)
    for (const mapView of this.m_mapViews) {
      mapView.onCameraMove(offset)
    }
  }

  /** OTC Map::resetLastCamera() – map.cpp L668-672: each mapView->resetLastCamera(). */
  resetLastCamera() {
    for (const mapView of this.m_mapViews) {
      (mapView as any).resetLastCamera?.()
    }
  }

  notificateTileUpdate(pos: Position, thing: Thing | null, operation: string) {
    if (!pos || !Number.isFinite(pos.x) || !Number.isFinite(pos.y) || !Number.isFinite(pos.z)) return
    for (const mapView of this.m_mapViews) {
      mapView.onTileUpdate?.(pos, thing, operation)
    }

    if (thing?.isItem?.()) {
      // g_minimap
    }
  }

  /** OTC: Map::notificateWalkTerminated(creature) – notifica fim do walk. */
  notificateWalkTerminated(creature: Creature) {
    const pos = creature.m_lastStepFromPosition || creature.getPosition()
    if (pos) {
      this.notificateTileUpdate(pos, creature, 'clean')
    }
    // Notifica os MapViews para atualizarem o cache de tiles visíveis
    for (const mapView of this.m_mapViews) {
      mapView.requestUpdateVisibleTiles?.()
    }
  }

  /**
   * OTC: Map::addThing(thing, pos, stackPos) – early return !thing; item id 0; missile stub; getOrCreateTile; add if m_floatingEffect || !isEffect || tile has ground; tile->addThing; notificateTileUpdate.
   * Stack order is 1:1 with OTC via Tile::addThing(thing, stackPos) priority logic.
   */
  addThing(thing: Thing, pos: PositionLike, stackPos: number = -1) {
    if (!thing) return
    if (thing.isItem() && (thing.getId() == null || thing.getId() === 0)) return
    if (thing.isMissile?.()) {
      const position = ensurePosition(pos)
      const z = position.z ?? 0
      if (!this.m_floors[z]) this.m_floors[z] = { missiles: [] }
      this.m_floors[z].missiles.push(thing)
      thing.setPosition(position, 0)
      thing.onAppear?.()
      return
    }

    const tile = this.getOrCreateTile(pos)
    if (!tile) return

    const position = ensurePosition(pos)
    const floatingEffect = this.m_floatingEffect ?? false
    const isEffect = thing.isEffect()
    const hasGround = (tile.m_things?.length ?? 0) > 0

    if (floatingEffect || !isEffect || hasGround) {
      if (thing.isCreature?.()) {
        const id = thing.getId?.()
        if (id != null && tile.m_things.some((t: Thing) => t.isCreature?.() && t.getId?.() === id)) return
        this.addCreature(thing as Creature)
      }
      tile.addThing(thing, stackPos)
      this.notificateTileUpdate(position, thing, 'add')
    }
  }

  getThing(pos: Position, stackPos: number) {
    const tile = this.getTile(pos)
    if (!tile || stackPos < 0 || stackPos >= (tile.m_things?.length ?? 0)) return null
    return tile.m_things[stackPos] ?? null
  }

  getThingStackPos(pos: Position, thing: Thing): number {
    const tile = this.getTile(pos)
    if (!tile?.m_things?.length) return -1
    return tile.m_things.indexOf(thing)
  }

  removeThingByPos(pos: Position, stackPos: number) {
    const tile = this.getTile(pos)
    if (!tile || stackPos < 0 || stackPos >= (tile.m_things?.length ?? 0)) return false
    tile.m_things.splice(stackPos, 1)
    if (tile.m_things.length === 0) this.cleanTile(pos)
    return true
  }

  /**
   * OTC: bool Map::removeThing(const ThingPtr& thing) – map.cpp L266-289
   * 1) Missile → m_floors[z].missiles.erase(thing); 2) else thing->getTile() && tile->removeThing(thing) → notificateTileUpdate(REMOVE).
   */
  removeThing(thing: Thing): boolean {
    if (!thing) return false

    if (thing.isMissile?.()) {
      const pos = thing.getPosition()
      if (!pos) return false
      const z = pos.z ?? 0
      if (!this.m_floors[z]) return false
      const missileIndex = this.m_floors[z].missiles.indexOf(thing)
      if (missileIndex === -1) return false
      this.m_floors[z].missiles.splice(missileIndex, 1)
      return true
    }

    const tile = thing.getTile()
    if (tile && tile.removeThing(thing)) {
      const pos = thing.getPosition()
      if (pos) this.notificateTileUpdate(pos, thing, 'remove')
      return true
    }

    return false
  }

  /** OTC: void Map::addAnimatedText(const AnimatedTextPtr& txt, const Position& pos) – map.cpp L220. */
  addAnimatedText(txt: AnimatedText, pos: PositionLike): void {
    const position = ensurePosition(pos)
    let merged = false
    for (const other of this.m_animatedTexts) {
      const op = other.getPosition()
      if (op.x === position.x && op.y === position.y && op.z === position.z && other.merge(txt)) {
        merged = true
        break
      }
    }
    if (!merged) {
      this.m_animatedTexts.push(txt)
    }
    txt.setPosition(position)
    txt.onAppear()
  }

  /** OTC: bool Map::removeAnimatedText(const AnimatedTextPtr& txt) – map.cpp L308. */
  removeAnimatedText(txt: AnimatedText): boolean {
    const i = this.m_animatedTexts.indexOf(txt)
    if (i === -1) return false
    this.m_animatedTexts.splice(i, 1)
    return true
  }

  /** OTC: getAnimatedTexts() – map.h L215. */
  getAnimatedTexts(): AnimatedText[] {
    return this.m_animatedTexts
  }

  /** OTC: getFloorMissiles(z) – mapview.cpp draws missiles per floor. */
  getFloorMissiles(z: number): Thing[] {
    return this.m_floors[z]?.missiles ?? []
  }

  /** Armazena Creature (OTC: criaturas conhecidas). Aceita Creature ou plain entry. */
  addCreature(creature: Creature) {
    if (!creature) return
    const id = creature.getId()
    // Always use number as key for consistency
    if (id != null) this.m_knownCreatures.set(Number(id), creature)
  }

  getCreatureById(id: number | string | null): Creature | null {
    if (id == null) return null
    // Always search with number key
    return this.m_knownCreatures.get(Number(id)) ?? null
  }

  /** Encontra a posição de uma criatura nos tiles (para getMappedThing 0xffff). */
  findCreaturePosition(creatureId: number | string) {
    for (const tile of this.m_tiles.values()) {
      if (!tile?.m_position || !tile.m_things?.length) continue
      for (let i = 0; i < tile.m_things.length; i++) {
        const t = tile.m_things[i]
        if (t.isCreature() && (Number(t.getId()) === Number(creatureId) || t.getId() === creatureId)) {
          return { pos: { ...tile.m_position }, stackPos: i }
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
  snapshotFloor(z: number): SnapshotFloor {
    const center = this.getCentralPosition()
    const r = this.getAwareRange()
    const { w, h } = this.getAwareDims()
    const out: SnapshotTile[][] = Array.from({ length: h }, () => Array.from({ length: w }, () => ({ groundId: 0, stack: [], wx: 0, wy: 0, z })))
    const dz = z - center.z
    const ox = center.x - r.left + dz
    const oy = center.y - r.top + dz
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const pos = { x: ox + x, y: oy + y, z }
      const tile = this.getTile(pos)
      out[y][x].wx = pos.x
      out[y][x].wy = pos.y
      const walkingCreatures: any[] = []
      if (tile && (tile.m_walkingCreatures || []).length) {
        for (const c of (tile.m_walkingCreatures || [])) {
          // CRITICAL: Apenas inclui na lista de snapshot se a criatura ainda estiver andando
          if (!c.isWalking()) continue

          const off = c.getDrawOffset?.() ?? { x: 0, y: 0 }
          walkingCreatures.push({
            entry: { direction: c.m_direction, walking: true, walkAnimationPhase: c.m_walkAnimationPhase ?? 0 },
            offsetX: off.x,
            offsetY: off.y,
          })
        }
      }
      if (!tile || !tile.m_things?.length) {
        out[y][x].walkingCreatures = walkingCreatures
        continue
      }
      let groundId = 0
      const stack: Thing[] = []
      for (const t of tile.m_things) {
        if (t.isItem()) {
          const item = t as Item
          if (!groundId) groundId = item.getId()
        }
        stack.push(t)
      }
      out[y][x] = { groundId, stack, wx: pos.x, wy: pos.y, z, walkingCreatures }
    }
    return { w, h, tiles: out }
  }

  snapshotFloors(zMin: number, zMax: number) {
    const center = this.getCentralPosition()
    const min = Math.min(zMin ?? center.z, zMax ?? center.z)
    const max = Math.max(zMin ?? center.z, zMax ?? center.z)
    const floors: Record<number, SnapshotFloor> = {}
    for (let z = min; z <= max; z++) floors[z] = this.snapshotFloor(z)
    return { zMin: min, zMax: max, floors }
  }

  removeCreatureById(id: number | string) {
    if (id == null) return
    const numId = Number(id)
    const known = this.m_knownCreatures.get(numId) ?? null

    // OTC: remove known creature entry and thing from tile.
    if (known) {
      this.removeThing(known as unknown as Thing)
      this.m_knownCreatures.delete(numId)
      return
    }

    // Desync fallback: remove lingering creature instances in tiles.
    for (const tile of this.m_tiles.values()) {
      if (!tile?.m_things?.length) continue
      for (let i = tile.m_things.length - 1; i >= 0; i--) {
        const thing = tile.m_things[i]
        if (!thing?.isCreature?.()) continue
        if (Number(thing.getId?.()) !== numId) continue
        this.removeThing(thing)
      }
    }

    this.m_knownCreatures.delete(numId)
  }

  clean() {
    this.cleanDynamicThings()
    this.m_tiles.clear()
  }

  /** OTC Map::cleanDynamicThings – map.cpp L144-177: followCreature(nullptr) before clearing creatures. */
  cleanDynamicThings() {
    for (const mapView of this.m_mapViews) {
      (mapView as any).followCreature?.(null)
    }
    for (const tile of this.m_tiles.values()) {
      if (tile?.m_things?.length) {
        tile.m_things = tile.m_things.filter((t) => !t.isCreature())
        if (tile.m_things.length === 0) this.cleanTile(tile.m_position)
      }
      if (tile?.m_walkingCreatures?.length) tile.m_walkingCreatures = []
    }
    this.m_knownCreatures.clear()
  }

  removeUnawareThings() {
    for (const tile of this.m_tiles.values()) {
      if (!tile?.m_position || this.isAwareOfPosition(tile.m_position)) continue
      for (let i = tile.m_things.length - 1; i >= 0; i--) {
        const t = tile.m_things[i]
        if (t.isCreature() && (t.getId() != null)) {
          this.m_knownCreatures.delete(Number(t.getId()!))
          tile.m_things.splice(i, 1)
        }
      }
      if (tile.m_things.length === 0) this.cleanTile(tile.m_position)
    }
  }

  /** OTC: m_mapKnown – true após primeiro parseMapDescription (0x64). */
  get mapKnown() { return this.m_mapKnown }

  /** Compat: alias para código que usa center/range/tiles/creatures/getCreature/setCenter/setTile. */
  get center() { return this.m_centralPosition }
  set center(pos: Position) { this.setCentralPosition(pos || this.m_centralPosition) }
  get tiles() { return this.m_tiles }
  get creatures() { return this.m_knownCreatures }
  get range() { return this.m_awareRange }
  setCenter(pos: Position) { this.setCentralPosition(pos) }
  getCreature(id: number | string) { return this.getCreatureById(id) }
  upsertCreature(creature: Creature) { this.addCreature(creature) }
  key(x: number, y: number, z: number) { return this._key(x, y, z) }
}

/** Singleton: instância única do mapa (OTC: g_map). */
export const g_map = new ClientMap()

