/**
 * Tile – 1:1 port of OTClient src/client/tile.h + tile.cpp
 * OTC: Tile::draw() chama thing->draw(dest, scaleFactor, ...) para cada Thing.
 * OTC drawThing: setDrawOrder(FIRST/SECOND/FOURTH/THIRD) → thing->draw() → resetDrawOrder().
 * OTC drawCreature: skip walking in m_things; setDrawOrder(THIRD) → m_walkingCreatures at cDest → resetDrawOrder().
 */

import { DrawFlags } from '../graphics/drawFlags'
import { g_drawPool } from '../graphics/DrawPoolManager'
import { DrawOrder } from '../graphics/DrawPool'
import { Item } from './Item'
import { Creature } from './Creature'
import { g_map } from './ClientMap'
import { g_game } from './Game'
import { Thing } from './types'
import type { Point } from './types'
import { Position, PositionLike, ensurePosition } from './Position'
import { ThingTypeManager } from '../things/thingTypeManager'
import { ThingAttr } from '../things/thingType'
import type { LightView } from './LightView'
import type { AwareRange } from './StaticData'
import { getThings } from '../protocol/things'

export const MAX_THINGS = 10
export const TILE_PIXELS = 32
export const MAX_ELEVATION = 255
export const MAP_MAX_Z = 15

/** OTC: g_gameConfig.getTileMaxThings() */
function getTileMaxThings(): number {
  return MAX_THINGS
}

// Tile flags (from OTC tile.h)
const NOT_WALKABLE = 1 << 0
const NOT_PATHABLE = 1 << 1
const NOT_SINGLE_DIMENSION = 1 << 2

export class Tile {
  m_position: Position
  m_drawElevation: number
  m_drawTopAndCreature: boolean
  m_lastDrawDest: { x: number, y: number } | null
  m_minimapColor: number
  m_flags: number
  m_things: Thing[]
  m_effects: any[]
  m_meta: any
  m_isCompletelyCovered: number
  m_isCovered: number
  m_walkingCreatures: Creature[]
  m_elevation: number
  m_thingTypeFlag: number

  constructor(x: number, y: number, z: number) {
    this.m_position = new Position(x, y, z)
    this.m_drawElevation = 0
    this.m_drawTopAndCreature = true
    this.m_lastDrawDest = null
    this.m_minimapColor = 0
    this.m_flags = 0
    this.m_things = []
    this.m_effects = []
    this.m_meta = null
    this.m_isCompletelyCovered = 0
    this.m_isCovered = 0
    this.m_walkingCreatures = []
    this.m_elevation = 0
    this.m_thingTypeFlag = 0
  }

  addWalkingCreature(creature: Creature) {
    // Use ID to prevent duplicates
    const id = creature.getId?.()
    if (id == null) return
    
    const existing = this.m_walkingCreatures.find(c => c.getId?.() === id)
    if (!existing) {
      this.m_walkingCreatures.push(creature);
    }
  }

  removeWalkingCreature(creature: Creature) {
    // Use ID for reliable removal
    const id = creature.getId?.()
    if (id == null) return
    
    const index = this.m_walkingCreatures.findIndex(c => c.getId?.() === id);
    if (index !== -1) {
      this.m_walkingCreatures.splice(index, 1);
    }
  }

  getGroundSpeed(): number {
    const ground = this.m_things[0] as Item;
    if (ground && ground.isGround?.()) {
      const tt = ground.getThingType();
      return tt?.m_attribs?.get(0) || 150; // 0 = ThingAttr.Ground
    }
    return 150;
  }

  getPosition(): Position { return this.m_position }
  get x(): number { return this.m_position.x }
  get y(): number { return this.m_position.y }
  get z(): number { return this.m_position.z }
  get stack(): Thing[] { return this.m_things }
  get things(): Thing[] { return this.m_things }
  set things(v: Thing[]) { this.m_things = v }
  get meta(): any { return this.m_meta }

  getDrawElevation(): number { return this.m_drawElevation }
  getThingCount(): number { return this.m_things.length + this.m_effects.length }
  getThings(): Thing[] { return this.m_things }
  isEmpty(): boolean { return this.m_things.length === 0 }
  isDrawable(): boolean { return this.m_things.length > 0 || this.m_effects.length > 0 }
  canErase(): boolean { return this.m_things.length === 0 && this.m_effects.length === 0 && this.m_walkingCreatures.length === 0 }

  /** OTC: Tile::getGround() – returns first thing if it's ground */
  getGround(): Item | null {
    const ground = this.m_things[0]
    return ground?.isGround?.() ? (ground as Item) : null
  }

  /** OTC: Tile::hasCreatures() */
  hasCreatures(): boolean {
    return this.m_things.some(t => t?.isCreature?.())
  }

  /** OTC: Tile::hasElevation(elevation = 1) – tile.h:128 */
  hasElevation(elevation = 1): boolean {
    return this.m_elevation >= elevation
  }

  removeThing(thing: Thing): boolean {
    if (!thing) return false
    if (thing.isEffect?.()) {
      const effectIndex = this.m_effects.indexOf(thing)
      if (effectIndex === -1) return false
      this.m_effects.splice(effectIndex, 1)
      return true;
    }

    const thingIndex = this.m_things.indexOf(thing)
    if (thingIndex === -1) return false
    this.m_things.splice(thingIndex, 1)
    thing.setStackPos(-1)

    if (thing.hasElevation?.()) {
      this.m_elevation = Math.max(0, this.m_elevation - 1)
    }

    this.updateThingStackPos()

    if (thing.hasElevation?.()) {
      this.m_drawElevation = 0
      for (const t of this.m_things) this.updateElevationForAdd(t)
    }

    thing.onDisappear()
    return true
  }

  clean(): void {
    while (this.m_things.length > 0) {
      this.removeThing(this.m_things[0])
    }
    this.m_effects.length = 0
    this.m_walkingCreatures.length = 0
    this.m_drawTopAndCreature = true
    this.m_drawElevation = 0
    this.m_elevation = 0
    this.m_thingTypeFlag = 0
    this.m_isCovered = 0
    this.m_isCompletelyCovered = 0
  }

  /** OTC: markHighlightedThing(Color::white) – stub */
  private markHighlightedThing(_color: number): void {}

  /** OTC: updateCreatureRangeForInsert(stackPos, thing) – stub */
  private updateCreatureRangeForInsert(_stackPos: number, _thing: Thing): void {}

  /** OTC: setThingFlag(thing) – stub */
  private setThingFlag(_thing: Thing): void {}

  /** OTC: updateThingStackPos() – updates m_stackPos on each thing to match index */
  private updateThingStackPos(): void {
    for (let i = 0; i < this.m_things.length; i++) {
      this.m_things[i].setStackPos(i)
    }
  }

  /** OTC: updateElevation(thing, m_drawElevation) when adding thing to tile */
  private updateElevationForAdd(thing: Thing): void {
    if (!thing?.hasElevation?.()) return
    const elevPx = thing.getElevation?.() ?? 0
    this.m_drawElevation = Math.min(MAX_ELEVATION, this.m_drawElevation + elevPx)
  }

  /** OTC: checkForDetachableThing() – stub */
  private checkForDetachableThing(): void {}

  /**
   * OTC: void Tile::addThing(const ThingPtr& thing, int stackPos) – 1:1
   * Effect: isTopEffect → emplace_back, else insert(begin). Non-effect: priority insert, setPosition(pos, stackPos), updateThingStackPos.
   */
  addThing(thing: Thing, stackPos: number): void {
    if (!thing) return

    if (thing.isEffect?.()) {
      const newEffect = thing as any
      const mustOptimize = false
      for (const prevEffect of this.m_effects) {
        if (prevEffect?.canDraw?.() === false) continue
        if (mustOptimize && newEffect.getSize?.() > prevEffect.getSize?.()) {
          if (prevEffect.canDraw) prevEffect.canDraw(false)
        } else if (mustOptimize || newEffect.getId?.() === prevEffect.getId?.()) {
          if (newEffect.waitFor?.(prevEffect) === false) return
        }
      }
      if (!newEffect.isTopEffect?.()) {
        this.m_effects.unshift(thing)
      } else {
        this.m_effects.push(thing)
      }
      this.setThingFlag(thing)
      thing.setPosition(this.m_position)
      thing.onAppear()
      return
    }

    const size = this.m_things.length

    if (stackPos < 0 || stackPos === 255) {
      const priority = thing.getStackPriority()
      let append: boolean
      if (stackPos === -2) {
        append = true
      } else {
        append = priority <= 3
        if (g_game.getClientVersion() >= 854 && priority === 4) append = !append
      }
      stackPos = 0
      for (let i = 0; i < size; i++) {
        const otherPriority = this.m_things[i].getStackPriority()
        if ((append && otherPriority > priority) || (!append && otherPriority >= priority)) {
          stackPos = i
          break
        }
        stackPos = i + 1
      }
    } else if (stackPos > size) {
      stackPos = size
    }

    this.markHighlightedThing(0xffffff)

    this.m_things.splice(stackPos, 0, thing)

    this.updateCreatureRangeForInsert(stackPos, thing)
    this.setThingFlag(thing)

    if (size > getTileMaxThings()) {
      const removed = this.m_things[getTileMaxThings()]
      this.removeThing(removed)
    }

    this.updateThingStackPos()

    thing.setPosition(this.m_position, stackPos)
    thing.onAppear()

    this.updateElevationForAdd(thing)
    this.checkForDetachableThing()
  }

  /** OTC: Tile::hasFloorChange() – tile.cpp:487 */
  hasFloorChange(): boolean {
    for (const thing of this.m_things) {
      const tt = (thing as Item)?.getThingType?.() as any
      // Check for floor change attributes via ThingType flags
      if (tt?.m_attribs?.FloorChange || tt?.isFloorChange?.()) return true
    }
    return false
  }

  /** OTC: Tile::isWalkable(ignoreCreatures = false) – tile.cpp:666 */
  isWalkable(ignoreCreatures = false): boolean {
    // Check if tile has NOT_WALKABLE flag or no ground
    if ((this.m_thingTypeFlag & NOT_WALKABLE) || !this.getGround()) {
      return false
    }

    // Check for blocking creatures
    if (!ignoreCreatures && this.hasCreatures()) {
      for (const thing of this.m_things) {
        if (!thing?.isCreature?.()) continue
        const creature = thing as Creature
        // isPassable defaults to false for normal creatures
        const isPassable = (creature as any).m_passable === true
        // canBeSeen - creature must be visible
        const canBeSeen = creature.canBeSeen?.() !== false
        if (!isPassable && canBeSeen) {
          return false
        }
      }
    }

    return true
  }

  /** OTC: Tile::isPathable() */
  isPathable(): boolean {
    return !(this.m_thingTypeFlag & NOT_PATHABLE)
  }

  /** OTC Tile::isFullyOpaque() – conservative path: true for full ground. */
  isFullyOpaque(): boolean {
    return this.m_things.some((thing) => thing != null && !!thing.isFullGround?.())
  }

  /** OTC Tile::hasTopGround(ignoreBorder) – top-ground or top-ground-border. */
  hasTopGround(ignoreBorder = false): boolean {
    const ground = this.getGround()
    if (ground && (ground.getWidth?.() ?? 1) * (ground.getHeight?.() ?? 1) === 4) return true
    if (ignoreBorder) return false
    return this.m_things.some((thing) => !!thing?.isGroundBorder?.() && ((thing.getWidth?.() ?? 1) * (thing.getHeight?.() ?? 1) === 4))
  }

  /** OTC Tile::isSingleDimension() – no thing with width or height != 1. */
  isSingleDimension(types: ThingTypeManager): boolean {
    const stack = this.getThings?.() ?? this.m_things ?? []
    for (const thing of stack) {
      const w = thing.getWidth?.() ?? 1
      const h = thing.getHeight?.() ?? 1
      if (w !== 1 || h !== 1) return false
    }
    return true
  }

  setStack(stack: Thing[], meta: any, types: ThingTypeManager) {
    const raw = (stack || []).slice(0, MAX_THINGS)
    this.m_things = raw.map((e) => {
      // Se já é uma instância de Thing, usa diretamente
      if (e instanceof Creature) {
        const id = e.getId()
        const known = g_map?.getCreatureById?.(id)
        if (known) {
          // Atualiza os dados da criatura conhecida
          known.m_name = e.m_name ?? known.m_name
          known.m_healthPercent = e.m_healthPercent ?? known.m_healthPercent
          if (e.m_direction != null) known.setDirection(e.m_direction)
          known.m_outfit = e.m_outfit ?? known.m_outfit
          known.m_speed = e.m_speed ?? known.m_speed
          known.m_baseSpeed = e.m_baseSpeed ?? known.m_baseSpeed
          return known
        }
        return e
      }
      if (e instanceof Item) {
        return e
      }
      // Fallback para objetos plain (compatibilidade)
      if (e.isCreature?.()) {
        return e as Creature
      }
      return e as Item
    })
    this.m_meta = meta
    this.m_isCompletelyCovered = 0
    this.m_isCovered = 0
  }

  /** OTC: Tile::addWalkingCreature(creature) – opera em qualquer objeto tile com walkingCreatures (map tile ou instância). */
  static addWalkingCreature(tile: any, creature: Creature) {
    if (!tile || !creature) return
    if (!tile.m_walkingCreatures) tile.m_walkingCreatures = []
    if (!tile.m_walkingCreatures.includes(creature)) tile.m_walkingCreatures.push(creature)
  }

  /** OTC: Tile::removeWalkingCreature(creature) – remove criatura da lista de walking do tile. */
  static removeWalkingCreature(tile: any, creature: Creature) {
    if (!tile?.m_walkingCreatures?.length || !creature) return
    const id = creature.getId?.()
    if (id == null) return
    
    tile.m_walkingCreatures = tile.m_walkingCreatures.filter((c: any) => {
      const cid = c.getId?.()
      return cid == null || (Number(cid) !== Number(id) && String(cid) !== String(id))
    })
  }

  static addWalkingCreatureToTile(creature: Creature, fromPos: Position) {
    if (!creature || !fromPos) return
    const tiles = g_map.m_tiles?.values?.()
    if (tiles) {
      for (const tile of tiles) {
        Tile.removeWalkingCreature(tile, creature)
      }
    }
    const creatureId = creature.getId?.()
    if (creatureId != null && g_map.findCreaturePosition && g_map.removeThingByPos) {
      const found = g_map.findCreaturePosition(creatureId)
      if (found?.pos != null && found.stackPos != null) {
        const pos = found.pos instanceof Position ? found.pos : Position.from(found.pos)
        g_map.removeThingByPos(pos, found.stackPos)
      }
    }
    const tile = g_map.getOrCreateTile?.(fromPos)
    if (tile) Tile.addWalkingCreature(tile, creature)
  }

  getThing(stackPos: number): Thing | null {
    if (stackPos >= 0 && stackPos < this.m_things.length) return this.m_things[stackPos]
    return null
  }

  private hasThingAttr(thing: Thing | null | undefined, attr: number): boolean {
    if (!thing || thing.isCreature?.()) return false
    const tt = thing.getThingType?.() as any
    if (!tt) return false
    if (typeof tt.hasAttr === 'function') return tt.hasAttr(attr)
    if (tt.m_attribs?.has) return tt.m_attribs.has(attr)
    return false
  }

  private isIgnoreLookThing(thing: Thing | null | undefined): boolean {
    if (!thing) return false
    const tt = thing.getThingType?.() as any
    return !!(tt?.isIgnoreLook?.() || this.hasThingAttr(thing, ThingAttr.Look))
  }

  private isForceUseThing(thing: Thing | null | undefined): boolean {
    return this.hasThingAttr(thing, ThingAttr.ForceUse)
  }

  private isNotMoveableThing(thing: Thing | null | undefined): boolean {
    return this.hasThingAttr(thing, ThingAttr.NotMoveable)
  }

  getTopLookThing(): Thing | null {
    if (this.isEmpty()) return null

    for (const thing of this.m_things) {
      const normalItem =
        !thing?.isGround?.() &&
        !thing?.isGroundBorder?.() &&
        !thing?.isOnBottom?.() &&
        !thing?.isOnTop?.()
      if (!this.isIgnoreLookThing(thing) && normalItem) return thing
    }

    return this.m_things[0] ?? null
  }

  getTopUseThing(): Thing | null {
    if (this.isEmpty()) return null

    for (const thing of this.m_things) {
      const normalItem =
        !thing?.isGround?.() &&
        !thing?.isGroundBorder?.() &&
        !thing?.isOnBottom?.() &&
        !thing?.isOnTop?.() &&
        !thing?.isCreature?.() &&
        !this.hasThingAttr(thing, ThingAttr.Splash)
      if (this.isForceUseThing(thing) || normalItem) return thing
    }

    for (let i = this.m_things.length - 1; i > 0; i--) {
      const thing = this.m_things[i]
      if (!this.hasThingAttr(thing, ThingAttr.Splash) && !thing?.isCreature?.()) return thing
    }

    return this.m_things[0] ?? null
  }

  getTopCreature(checkAround = false): Creature | null {
    if (!this.hasCreatures() && this.m_walkingCreatures.length === 0 && !checkAround) return null

    let localPlayer: Creature | null = null
    for (const thing of this.m_things) {
      if (!thing?.isCreature?.()) continue
      const creature = thing as Creature
      if (thing?.isLocalPlayer?.()) localPlayer = creature
      else return creature
    }

    if (localPlayer) return localPlayer
    if (this.m_walkingCreatures.length > 0) return this.m_walkingCreatures[this.m_walkingCreatures.length - 1]

    if (checkAround) {
      for (const pos of this.m_position.getPositionsAround()) {
        const tile = g_map.getTile(pos)
        if (!tile?.m_walkingCreatures?.length) continue
        for (const creature of tile.m_walkingCreatures) {
          const fromPos = creature.getLastStepFromPosition?.()
          const duration = creature.getStepDuration?.()
          const elapsed = creature.getWalkTicksElapsed?.()
          const progress = duration && duration > 0 && elapsed != null ? elapsed / duration : 1
          const leftFromThisTile =
            fromPos &&
            fromPos.x === this.m_position.x &&
            fromPos.y === this.m_position.y &&
            fromPos.z === this.m_position.z
          if (creature.isWalking?.() && leftFromThisTile && progress < 0.75) {
            return creature
          }
        }
      }
    }

    return null
  }

  getTopMoveThing(): Thing | null {
    if (this.isEmpty()) return null

    for (let i = 0; i < this.m_things.length; i++) {
      const thing = this.m_things[i]
      if (!this._isCommon(thing)) continue
      if (i > 0 && this.isNotMoveableThing(thing)) return this.m_things[i - 1]
      return thing
    }

    for (const thing of this.m_things) {
      if (thing?.isCreature?.()) return thing
    }

    return this.m_things[0] ?? null
  }

  getTopMultiUseThing(): Thing | null {
    if (this.isEmpty()) return null

    const topCreature = this.getTopCreature()
    if (topCreature) return topCreature

    for (const thing of this.m_things) {
      if (this.isForceUseThing(thing)) return thing
    }

    for (let i = 0; i < this.m_things.length; i++) {
      const thing = this.m_things[i]
      const normalItem =
        !thing?.isGround?.() &&
        !thing?.isGroundBorder?.() &&
        !thing?.isOnBottom?.() &&
        !thing?.isOnTop?.()
      if (!normalItem) continue
      if (i > 0 && this.hasThingAttr(thing, ThingAttr.Splash)) return this.m_things[i - 1]
      return thing
    }

    for (const thing of this.m_things) {
      if (!thing?.isGround?.() && !thing?.isGroundBorder?.() && !thing?.isOnTop?.()) return thing
    }

    return this.m_things[0] ?? null
  }

  /** OTC: isCommon() – !ground && !groundBorder && !onTop && !creature && !onBottom. */
  _isCommon(thing: Thing): boolean {
    return !thing?.isGround?.() && !thing?.isGroundBorder?.() && !thing?.isOnBottom?.() && !thing?.isOnTop?.() && !thing?.isCreature?.()
  }

  hasCommonItem(): boolean {
    return this.m_things.some((t) => this._isCommon(t))
  }

  hasTopItem(): boolean {
    return this.m_things.some((t) => t?.isOnTop?.())
  }

  /** OTC Tile::hasLight() – thing with light. */
  hasLight(): boolean {
    return this.m_things.some((t) => (t as any)?.hasLight?.())
  }

  /** OTC: Tile::hasWideThings() – any thing with width > 1. */
  hasWideThings(): boolean {
    return this.m_things.some((t) => (t.getWidth?.() ?? 1) > 1)
  }

  /** OTC: Tile::hasWideThings2() – used in canRender; same as hasWideThings for port. */
  hasWideThings2(): boolean {
    return this.hasWideThings()
  }

  /** OTC: Tile::hasTallThings() – any thing with height > 1. */
  hasTallThings(): boolean {
    return this.m_things.some((t) => (t.getHeight?.() ?? 1) > 1)
  }

  /** OTC: Tile::hasTallThings2() – used in canRender; same as hasTallThings for port. */
  hasTallThings2(): boolean {
    return this.hasTallThings()
  }

  /** OTC: Tile::hasDisplacement() – any thing type with displacement. */
  hasDisplacement(): boolean {
    return this.m_things.some((t) => (t.getThingType?.() as any)?.hasDisplacement?.())
  }

  /** OTC: Tile::hasThingWithElevation() – any thing with elevation. */
  hasThingWithElevation(): boolean {
    return this.m_things.some((t) => (t as any)?.hasElevation?.())
  }

  /**
   * OTC: bool Tile::canRender(uint32_t& flags, const Position& cameraPosition, const AwareRange viewPort)
   * Check for non-visible tiles on the screen and ignore them; may clear DrawThings/DrawLights/DrawManaBar/DrawNames/DrawBars.
   * Returns true if flags > 0 (tile still has something to draw).
   */
  canRender(flags: number, cameraPosition: Position, viewPort: AwareRange): boolean {
    const flagsRef = { flags };
    const dz = this.m_position.z - cameraPosition.z
    const checkPos = this.m_position.translated(dz, dz)

    let draw = true

    if (
      cameraPosition.x - checkPos.x >= viewPort.left ||
      (checkPos.x - cameraPosition.x === viewPort.right &&
        !this.hasWideThings() &&
        !this.hasDisplacement() &&
        !this.hasThingWithElevation() &&
        this.m_walkingCreatures.length === 0)
    ) {
      draw = false
    } else if (
      cameraPosition.y - checkPos.y >= viewPort.top ||
      (checkPos.y - cameraPosition.y === viewPort.bottom &&
        !this.hasTallThings() &&
        !this.hasWideThings2() &&
        !this.hasDisplacement() &&
        !this.hasThingWithElevation() &&
        this.m_walkingCreatures.length === 0)
    ) {
      draw = false
    } else if (
      ((checkPos.x - cameraPosition.x > viewPort.right &&
        (!this.hasWideThings() || !this.hasDisplacement() || !this.hasThingWithElevation())) ||
        checkPos.y - cameraPosition.y > viewPort.bottom) &&
      !this.hasTallThings2()
    ) {
      draw = false
    }

    if (!draw) {
      flagsRef.flags &= ~DrawFlags.DrawThings
      if (!this.hasLight()) flagsRef.flags &= ~DrawFlags.DrawLights
      if (!this.hasCreatures()) flagsRef.flags &= ~(DrawFlags.DrawManaBar | DrawFlags.DrawNames | DrawFlags.DrawBars)
    }

    return flagsRef.flags > 0
  }

  /** OTC Tile::limitsFloorsView(isFreeView) – ground and walls limit the view to upper floors. */
  limitsFloorsView(isFreeView = false): boolean {
    for (const thing of this.m_things) {
      // Iterate until first common item.
      if (this._isCommon(thing)) break

      const tt = thing?.getThingType?.() as any
      const dontHide = tt?.dontHide ?? tt?.isDontHide?.() ?? false
      const isGround = thing?.isGround?.() ?? false
      const onBottom = thing?.isOnBottom?.() ?? false
      const blocksProjectile = tt?.blockProjectile?.() ?? false
      if (!dontHide && (isGround || (isFreeView ? onBottom : (onBottom && blocksProjectile)))) {
        return true
      }
    }

    return false
  }

  /** OTC Tile::canShade() – tile contributes to light shades. Stub: false. */
  /** OTC: Tile::isClickable() */
  isClickable(): boolean {
    let hasGround = false
    let hasOnBottom = false
    let hasIgnoreLook = false

    for (const thing of this.m_things) {
      if (thing?.isGround?.()) hasGround = true
      else if (thing?.isOnBottom?.()) hasOnBottom = true

      if (this.isIgnoreLookThing(thing)) hasIgnoreLook = true
      if ((hasGround || hasOnBottom) && !hasIgnoreLook) return true
    }

    return false
  }

  /** OTC Tile::canShade() â€“ tile contributes to light shades. Stub: false. */
  canShade(): boolean {
    return false
  }

  /** OTC Tile::onAddInMapView() – called when tile is added to visible cache. No-op. */
  onAddInMapView(): void {}

  /** OTC Tile::isLoading() – true if any thing on the tile is still loading. Stub: false. */
  isLoading(): boolean {
    return this.m_things.some((t) => (t as any)?.isLoading?.() === true) ?? false
  }

  /**
   * OTC Tile::isCompletelyCovered(uint8_t firstFloor, bool resetCache) – tile.cpp L685-715.
   * Early outs: z==0, z==firstFloor, hasCreatures, !m_walkingCreatures.empty(), hasLight. Then g_map.isCompletelyCovered(m_position, isLoading, firstFloor); cache result; if isLoading clear and return false.
   */
  isCompletelyCovered(firstFloor: number, resetCache: boolean): boolean {
    if (this.z === 0 || this.z === firstFloor) return false
    if (resetCache) {
      this.m_isCompletelyCovered = 0
      this.m_isCovered = 0
    }
    if (this.hasCreatures?.() || (this.m_walkingCreatures?.length ?? 0) > 0 || this.hasLight?.()) return false

    const idChecked = 1 << firstFloor
    const idState = 1 << (firstFloor + MAP_MAX_Z)
    if ((this.m_isCompletelyCovered & idChecked) === 0) {
      this.m_isCompletelyCovered |= idChecked
      const isLoadingRef = { isLoading: false }
      if (g_map.isCompletelyCovered(this.getPosition(), isLoadingRef, firstFloor, getThings()?.types)) {
        this.m_isCompletelyCovered |= idState
        this.m_isCovered |= idChecked
        this.m_isCovered |= idState
      }
      if (isLoadingRef.isLoading) {
        this.m_isCompletelyCovered &= ~idState
        this.m_isCovered &= ~idChecked
        this.m_isCovered &= ~idState
        return false
      }
    }
    return (this.m_isCompletelyCovered & idState) === idState
  }

  /**
   * OTC Tile::isCovered(int8_t firstFloor) – tile.cpp L718-738.
   * Cache by firstFloor; delegate to g_map.isCovered(m_position, isLoading, firstFloor); if isLoading clear and return false.
   */
  isCovered(firstFloor: number): boolean {
    if (this.z === 0 || this.z === firstFloor) return false
    const idChecked = 1 << firstFloor
    const idState = 1 << (firstFloor + MAP_MAX_Z)
    if ((this.m_isCovered & idChecked) === 0) {
      this.m_isCovered |= idChecked
      const isLoadingRef = { isLoading: false }
      if (g_map.isCovered(this.getPosition(), isLoadingRef, firstFloor)) this.m_isCovered |= idState
      if (isLoadingRef.isLoading) {
        this.m_isCovered &= ~idChecked
        this.m_isCovered &= ~idState
        return false
      }
    }
    return (this.m_isCovered & idState) === idState
  }

  /**
   * OTC: updateElevation(thing, drawElevation)
   * if (thing->hasElevation()) drawElevation = min(drawElevation + thing->getElevation(), getTileMaxElevation())
   */
  updateElevation(thing: Thing, state: any) {
    if (!thing?.hasElevation?.()) return
    const elevPx = thing.getElevation?.() ?? 0
    state.drawElevationPx = Math.min(MAX_ELEVATION, state.drawElevationPx + elevPx)
  }

  /**
   * OTC: drawThing(thing, dest, flags, drawElevation, lightView) – free function in tile.cpp
   * newDest = dest - drawElevation * scaleFactor; if (flags == DrawLights) thing->drawLight(newDest, lightView); else setDrawOrder(isSingleGround→FIRST, isSingleGroundBorder→SECOND, isEffect&&isDrawingEffectsOnTop→FOURTH, else THIRD); thing->draw(newDest, flags&DrawThings, lightView); updateElevation; resetDrawOrder().
   */
  _drawThing(thing: Thing, drawFlags: number, drawElevationPx: number, state?: any) {
    if (!g_drawPool.isValid()) return
    const viewX = state?.drawX ?? this.x
    const viewY = state?.drawY ?? this.y
    const lightView = state?.lightView as LightView | null | undefined
    const drawDest = {
      x: viewX * TILE_PIXELS,
      y: viewY * TILE_PIXELS,
      drawElevationPx,
      tileZ: this.z,
    }

    if (drawFlags & DrawFlags.DrawLights) {
      thing.drawLight?.(drawDest, lightView ?? null)
      return
    }

    if (thing?.isSingleGround?.()) g_drawPool.setDrawOrder(DrawOrder.FIRST)
    else if (thing?.isSingleGroundBorder?.()) g_drawPool.setDrawOrder(DrawOrder.SECOND)
    else if (thing?.isEffect?.() && g_drawPool.isDrawingEffectsOnTop()) g_drawPool.setDrawOrder(DrawOrder.FOURTH)
    else g_drawPool.setDrawOrder(DrawOrder.THIRD)

    thing.draw(drawDest, !!(drawFlags & DrawFlags.DrawThings), lightView ?? undefined)
    if (state) this.updateElevation(thing, state)
    g_drawPool.resetDrawOrder()
  }

  /**
   * OTC: Tile::drawCreature(dest, flags, forceDraw, drawElevation, lightView)
   * 1) Non-walking creatures from m_things (skip if isWalking()).
   * 2) Walking creatures are drawn separately by their walking tile.
   */
  drawCreature(drawFlags: number, forceDraw: boolean, state: any) {
    if (!g_drawPool.isValid()) return
    if (!forceDraw && !this.m_drawTopAndCreature) return
    const { DrawCreatures } = DrawFlags
    if (!(drawFlags & DrawCreatures)) return

    let localPlayerDrawed = false

    for (const thing of this.m_things) {
      if (!thing.isCreature?.() || thing.isWalking?.()) continue

      // @ts-ignore
      if (thing.isLocalPlayer?.()) {
        const pos = thing.getPosition?.()
        if (pos && (pos.x !== this.x || pos.y !== this.y || pos.z !== this.z)) continue
        localPlayerDrawed = true
      }

      this._drawThing(thing, drawFlags, state.drawElevationPx, state)
    }

    g_drawPool.setDrawOrder(DrawOrder.THIRD)
    for (const creature of this.m_walkingCreatures) {
      const viewX = state?.drawX ?? this.x
      const viewY = state?.drawY ?? this.y
      const lightView = state?.lightView as LightView | null | undefined

      const creaturePos = creature.getPosition()
      const posDiffX = ((creaturePos?.x ?? this.x) - this.x) * TILE_PIXELS
      const posDiffY = ((creaturePos?.y ?? this.y) - this.y) * TILE_PIXELS
      const creatureDrawElevation = (creature as any).getDrawElevation?.() ?? 0
      const cDestX = viewX * TILE_PIXELS + posDiffX - creatureDrawElevation
      const cDestY = viewY * TILE_PIXELS + posDiffY - creatureDrawElevation

      if (drawFlags & DrawFlags.DrawLights) {
        creature.drawLight?.({ x: cDestX, y: cDestY, drawElevationPx: 0, tileZ: this.z }, lightView ?? null)
      } else {
        creature.draw({ x: cDestX, y: cDestY, drawElevationPx: 0, tileZ: this.z, isWalkDraw: true }, true, lightView ?? undefined)
      }
    }
    g_drawPool.resetDrawOrder()

    const localPlayer =
      Array.from(g_map.creatures.values()).find((c: any) => c?.isLocalPlayer?.()) ?? null
    if (!localPlayerDrawed && localPlayer && !localPlayer.isWalking?.()) {
      const pos = localPlayer.getPosition?.()
      if (pos && pos.x === this.x && pos.y === this.y && pos.z === this.z) {
        this._drawThing(localPlayer as Thing, drawFlags, state.drawElevationPx, state)
      }
    }
  }

  /**
   * OTC: Tile::drawTop(dest, flags, forceDraw, drawElevation)
   * drawElevation = 0; effects then onTop items.
   */
  drawTop(drawFlags: number, forceDraw: boolean, state: any) {
    if (!forceDraw && !this.m_drawTopAndCreature) return
    const { DrawEffects, DrawOnTop } = DrawFlags

    state.drawElevationPx = 0

    if (drawFlags & DrawEffects && this.m_effects.length > 0) {
      const viewX = state?.drawX ?? this.x
      const viewY = state?.drawY ?? this.y
      for (const effect of this.m_effects) {
        g_drawPool.setDrawOrder(DrawOrder.FOURTH)
        const effectDest = { x: viewX * TILE_PIXELS, y: viewY * TILE_PIXELS, drawElevationPx: 0, tileZ: this.z }
        effect.draw(effectDest, true, state.lightView ?? undefined)
        g_drawPool.resetDrawOrder()
      }
    }

    if (drawFlags & DrawOnTop && this.hasTopItem()) {
      for (const thing of this.m_things) {
        if (!thing.isOnTop?.()) continue
        this._drawThing(thing, drawFlags, 0, state)
      }
    }
  }

  /**
   * OTC: Tile::drawAttachedEffect(dest, dest, lightView, onTop)
   */
  drawAttachedEffect(lightView: any, onTop: boolean) {
    // No attached effects in this port; stub for 1:1 API.
  }

  /**
   * OTC: Tile::drawAttachedParticlesEffect(dest)
   */
  drawAttachedParticlesEffect() {
    // No particles in this port; stub for 1:1 API.
  }

  /**
   * OTC: Tile::draw(dest, flags, lightView)
   * Order: bottom → drawAttachedEffect(false) → common items → [m_tilesRedraw] → drawCreature → drawTop → drawAttachedEffect(true) → drawAttachedParticlesEffect.
   */
  /**
   * OTC: Tile::draw(dest, flags, lightView) – m_lastDrawDest = dest; depois ground, common, drawCreature, drawTop.
   */
  /** OTC: Tile::draw(dest, scaleFactor, drawFlags, lightView) – dest = transformPositionTo2D(tile->getPosition()). */
  draw(dest: Point, drawFlags: number = 0, lightView?: LightView | null) {
    if (!g_drawPool.isValid()) return
    const viewX = dest.x / TILE_PIXELS
    const viewY = dest.y / TILE_PIXELS
    this.m_lastDrawDest = { x: viewX, y: viewY }
    const state = { drawElevationPx: 0, drawX: viewX, drawY: viewY, lightView: lightView ?? null, drawFlags }

    // 1) OTC: for (thing : m_things) { if (!ground && !groundBorder && !onBottom) break; drawThing(thing); updateElevation(thing); }
    state.drawElevationPx = 0
    for (const thing of this.m_things) {
      if (!thing.isGround?.() && !thing.isGroundBorder?.() && !thing.isOnBottom?.())
        break;

      this._drawThing(thing, drawFlags, state.drawElevationPx, state)
    }

    this.drawAttachedEffect(null, false)

    // 2) OTC: if (hasCommonItem()) for (item : reverse(m_things)) if (isCommon()) drawThing(item)
    if (this.hasCommonItem()) {
      for (let i = this.m_things.length - 1; i >= 0; i--) {
        const thing = this.m_things[i]
        if (!this._isCommon(thing)) continue
        this._drawThing(thing, drawFlags, state.drawElevationPx, state)
      }
    }

    // 3) OTC: drawCreature(dest, flags, false, drawElevation)
    this.drawCreature(drawFlags, false, state)

    // 4) OTC: drawTop(dest, flags, false, drawElevation)
    this.drawTop(drawFlags, false, state)

    this.drawAttachedEffect(null, true)
    this.drawAttachedParticlesEffect()

  }
}

export { DrawFlags, DEFAULT_DRAW_FLAGS } from '../graphics/drawFlags'
