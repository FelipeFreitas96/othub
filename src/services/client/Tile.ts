/**
 * Tile – 1:1 port of OTClient src/client/tile.h + tile.cpp
 * OTC: Tile::draw() chama thing->draw(dest, scaleFactor, ...) para cada Thing.
 * OTC drawThing: setDrawOrder(FIRST/SECOND/FOURTH/THIRD) → thing->draw() → resetDrawOrder().
 * OTC drawCreature: skip walking in m_things; setDrawOrder(THIRD) → m_walkingCreatures at cDest → resetDrawOrder().
 */

import { DrawFlags } from '../graphics/drawFlags'
import { DrawOrder, DrawPool } from '../graphics/DrawPool'
import { Item } from './Item'
import { Creature } from './Creature'
import { g_map } from './ClientMap'
import { g_game } from './Game'
import { Thing } from './types'
import { Position, PositionLike, ensurePosition } from './Position'
import { ThingTypeManager } from '../things/thingTypeManager'
import type { LightView } from './LightView'

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

  /** OTC: Tile::removeThing – erase from m_things, thing->onDisappear() */
  removeThing(thing: Thing): boolean {
    const thingIndex = this.m_things.indexOf(thing)
    if (thingIndex === -1) return false
    this.m_things.splice(thingIndex, 1)
    ;(thing as any).onDisappear?.()
    return true
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

  /** OTC Tile::isFullyOpaque() – tile is opaque se qualquer thing na stack for full ground. */
  isFullyOpaque(): boolean {
    return this.m_things.some((thing) => thing != null && !!thing.isFullGround?.())
  }

  /** OTC Tile::hasTopGround() – tile has solid top (full ground); usamos mesmo critério que isFullyOpaque. */
  hasTopGround(): boolean {
    return this.isFullyOpaque()
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
          known.m_direction = e.m_direction ?? known.m_direction
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

  /** OTC: isCommon() – item that is not ground, groundBorder, onBottom, onTop. */
  _isCommon(thing: Thing): boolean {
    return !thing?.isGround?.() && !thing?.isGroundBorder?.() && !thing?.isOnBottom?.() && !thing?.isOnTop?.();
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

  /**
   * OTC Tile::isCompletelyCovered(firstFloor, resetCache) — cache por firstFloor (idChecked = 1<<firstFloor, idState = 1<<(firstFloor+MAP_MAX_Z)).
   * Early outs (z==0, z==firstFloor, hasCreatures, hasLight); depois delega para map.isCompletelyCovered e cacheia o resultado.
   */
  isCompletelyCovered(firstFloor: number, resetCache: boolean, map: any, types: ThingTypeManager): boolean {
    if (this.z === 0 || this.z === firstFloor) return false
    if (this.hasCreatures?.() || this.hasLight?.()) return false
    if (!map?.isCompletelyCovered) return false

    const idChecked = 1 << firstFloor
    const idState = 1 << (firstFloor + MAP_MAX_Z)

    if (resetCache) {
      this.m_isCompletelyCovered &= ~(idChecked | idState)
      this.m_isCovered &= ~(idChecked | idState)
    }

    if ((this.m_isCompletelyCovered & idChecked) === 0) {
      this.m_isCompletelyCovered |= idChecked
      if (map.isCompletelyCovered(this, firstFloor, types)) {
        this.m_isCompletelyCovered |= idState
        this.m_isCovered |= idChecked
        this.m_isCovered |= idState
      }
    }

    return (this.m_isCompletelyCovered & idState) === idState
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
  _drawThing(thing: Thing, pipeline: DrawPool, drawFlags: number, drawElevationPx: number, steps: Function[], state?: any) {
    const elev = drawElevationPx
    const self = this
    const viewX = state?.drawX ?? self.x
    const viewY = state?.drawY ?? self.y
    const TILE_PIXELS = 32
    const centerPx = (v: number) => v * TILE_PIXELS + TILE_PIXELS / 2
    const { DrawLights } = DrawFlags
    steps.push(() => {
      // OTC: luz é adicionada no draw da criatura (Creature::draw → lightView->addLightSource(dest + (animationOffset + Point(16,16))*scale)).
      const lightView = state?.lightView as LightView | null | undefined
      if (lightView && !(drawFlags & DrawLights)) {
        if (thing instanceof Item) {
          const tt = thing.getThingType()
          if (tt?.hasLight?.()) {
            const light = tt.getLight()
            if (light) lightView.addLightSource(centerPx(viewX), centerPx(viewY), light, 1)
          }
        } else if (thing instanceof Creature) {
          const light = thing.getLight()
          if (light?.intensity > 0) {
            const off = thing.getDrawOffset()
            lightView.addLightSource(centerPx(viewX) + off.x, centerPx(viewY) - off.y, light, 1)
          }
        }
      }
      if (drawFlags & DrawLights) {
        thing.drawLight?.(pipeline, viewX, viewY, elev, 0, self.z, undefined)
        return
      }
      if (thing?.isSingleGround?.()) pipeline.setDrawOrder(DrawOrder.FIRST)
      else if (thing?.isSingleGroundBorder?.()) pipeline.setDrawOrder(DrawOrder.SECOND)
      // @ts-ignore
      else if (thing?.isEffect?.() && pipeline.isDrawingEffectsOnTop?.()) pipeline.setDrawOrder(DrawOrder.FOURTH)
      else pipeline.setDrawOrder(DrawOrder.THIRD)
      thing.draw(pipeline, viewX, viewY, elev, 0, self.z)
      if (state) self.updateElevation(thing, state)
      pipeline.resetDrawOrder()
    })
  }

  /**
   * OTC: Tile::drawCreature(dest, flags, forceDraw, drawElevation, lightView)
   * 1) Non-walking creatures from m_things (skip if isWalking()).
   * 2) Walking creatures are drawn separately by MapView._drawWalkingCreatures().
   */
  drawCreature(pipeline: DrawPool, drawFlags: number, forceDraw: boolean, state: any, steps: Function[]) {
    if (!forceDraw && !this.m_drawTopAndCreature) return
    const { DrawCreatures } = DrawFlags
    if (!(drawFlags & DrawCreatures)) return

    // Draw only NON-walking creatures from m_things.
    for (const thing of this.m_things) {
      if (!thing.isCreature?.() || thing.isWalking?.()) continue
      
      // @ts-ignore
      if (thing.isLocalPlayer?.()) {
        const pos = thing.getPosition?.()
        if (pos && (pos.x !== this.x || pos.y !== this.y || pos.z !== this.z)) continue
      }

      this._drawThing(thing, pipeline, drawFlags, state.drawElevationPx, steps, state)
    }

    // Draw walking creatures
    // OTC: tile.cpp L152-156; luz como em Creature::draw → addLightSource(dest + (animationOffset + Point(16,16))*scale)
    for (const creature of this.m_walkingCreatures) {
      const self = this
      const viewX = state?.drawX ?? self.x
      const viewY = state?.drawY ?? self.y
      const lightView = state?.lightView as LightView | null | undefined
      steps.push(() => {
        pipeline.setDrawOrder(DrawOrder.THIRD)

        const drawOffset = creature.getDrawOffset()
        const creaturePos = creature.getPosition()
        const spriteSize = 32

        // OTC: cDest = dest + ((creature->getPosition() - m_position) * spriteSize) + walkOffset
        const posDiffX = ((creaturePos?.x ?? self.x) - self.x) * spriteSize
        const posDiffY = ((creaturePos?.y ?? self.y) - self.y) * spriteSize
        const pixelOffsetX = posDiffX + drawOffset.x
        const pixelOffsetY = posDiffY + drawOffset.y

        if (lightView) {
          const light = creature.getLight?.()
          if (light?.intensity > 0) {
            const px = viewX * spriteSize + spriteSize / 2 + pixelOffsetX
            const py = viewY * spriteSize + spriteSize / 2 - pixelOffsetY
            lightView.addLightSource(px, py, light, 1)
          }
        }

        creature.draw(pipeline, viewX, viewY, state.drawElevationPx, 0, self.z, pixelOffsetX, pixelOffsetY, true)

        pipeline.resetDrawOrder()
      })
    }
  }

  /**
   * OTC: Tile::drawTop(dest, flags, forceDraw, drawElevation)
   * drawElevation = 0; effects (drawThing → setDrawOrder); onTop items (drawThing).
   */
  drawTop(pipeline: DrawPool, drawFlags: number, forceDraw: boolean, state: any, steps: Function[]) {
    if (!forceDraw && !this.m_drawTopAndCreature) return
    const { DrawEffects, DrawOnTop } = DrawFlags

    state.drawElevationPx = 0

    if (drawFlags & DrawEffects && this.m_effects.length > 0) {
      const viewX = state?.drawX ?? this.x
      const viewY = state?.drawY ?? this.y
      for (const effect of this.m_effects) {
        const self = this
        steps.push(() => {
          pipeline.setDrawOrder(DrawOrder.FOURTH)
          effect.draw?.(pipeline, viewX, viewY, 0, 0, self.z)
          pipeline.resetDrawOrder()
        })
      }
    }
    if (drawFlags & DrawOnTop && this.hasTopItem()) {
      for (const thing of this.m_things) {
        if (!thing.isOnTop?.()) continue
        this._drawThing(thing, pipeline, drawFlags, 0, steps, state)
      }
    }
  }

  /**
   * OTC: Tile::drawAttachedEffect(dest, dest, lightView, onTop)
   */
  drawAttachedEffect(pipeline: DrawPool, lightView: any, onTop: boolean) {
    // No attached effects in this port; stub for 1:1 API.
  }

  /**
   * OTC: Tile::drawAttachedParticlesEffect(dest)
   */
  drawAttachedParticlesEffect(pipeline: DrawPool) {
    // No particles in this port; stub for 1:1 API.
  }

  /**
   * OTC: Tile::draw(dest, flags, lightView)
   * Order: bottom → drawAttachedEffect(false) → common items → [m_tilesRedraw] → drawCreature → drawTop → drawAttachedEffect(true) → drawAttachedParticlesEffect.
   */
  /**
   * OTC: Tile::draw(dest, flags, lightView) – m_lastDrawDest = dest; depois ground, common, drawCreature, drawTop.
   */
  /** OTC: Tile::draw(dest, scaleFactor, drawFlags, lightView) – luz é adicionada no draw de cada thing (Creature::draw, etc.). */
  draw(pipeline: DrawPool, drawFlags: number = 0, viewX: number, viewY: number, lightView?: LightView | null) {
    const things = pipeline.thingsRef?.current
    if (!things) return

    this.m_lastDrawDest = { x: viewX, y: viewY }
    const state = { drawElevationPx: 0, drawX: viewX, drawY: viewY, lightView: lightView ?? null }
    const steps: Function[] = []

    // 1) OTC: for (thing : m_things) { if (!ground && !groundBorder && !onBottom) break; drawThing(thing); updateElevation(thing); }
    state.drawElevationPx = 0
    for (const thing of this.m_things) {
      if (!thing.isGround?.() && !thing.isGroundBorder?.() && !thing.isOnBottom?.())
        break;

      this._drawThing(thing, pipeline, drawFlags, state.drawElevationPx, steps, state)
    }

    this.drawAttachedEffect(pipeline, null, false)

    // 2) OTC: if (hasCommonItem()) for (item : reverse(m_things)) if (isCommon()) drawThing(item)
    if (this.hasCommonItem()) {
      for (let i = this.m_things.length - 1; i >= 0; i--) {
        const thing = this.m_things[i]
        if (!this._isCommon(thing)) continue
        this._drawThing(thing, pipeline, drawFlags, state.drawElevationPx, steps, state)
      }
    }

    // 3) OTC: drawCreature(dest, flags, false, drawElevation)
    this.drawCreature(pipeline, drawFlags, false, state, steps)

    // 4) OTC: drawTop(dest, flags, false, drawElevation)
    this.drawTop(pipeline, drawFlags, false, state, steps)

    this.drawAttachedEffect(pipeline, null, true)
    this.drawAttachedParticlesEffect(pipeline)

    for (const step of steps) step()
  }
}

export { DrawFlags, DEFAULT_DRAW_FLAGS } from '../graphics/drawFlags'
