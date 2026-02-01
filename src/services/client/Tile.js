/**
 * Tile – 1:1 port of OTClient src/client/tile.h + tile.cpp
 * OTC: Tile::draw() chama thing->draw(dest, scaleFactor, ...) para cada Thing.
 * OTC drawThing: setDrawOrder(FIRST/SECOND/FOURTH/THIRD) → thing->draw() → resetDrawOrder().
 * OTC drawCreature: skip walking in m_things; setDrawOrder(THIRD) → m_walkingCreatures at cDest → resetDrawOrder().
 */

import { DrawFlags } from '../graphics/drawFlags.js'
import { DrawOrder } from '../graphics/DrawPool.js'
import { Item } from './Item.js'
import { Creature } from './Creature.js'
import { g_map } from './ClientMap.js'

const MAX_THINGS = 10
const TILE_PIXELS = 32
const MAX_ELEVATION = 255
const MAP_MAX_Z = 15

export class Tile {
  constructor(x, y, z) {
    this.m_position = { x, y, z }
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
  }

  getPosition() { return this.m_position }
  get x() { return this.m_position.x }
  get y() { return this.m_position.y }
  get z() { return this.m_position.z }
  get stack() { return this.m_things }
  get meta() { return this.m_meta }

  getDrawElevation() { return this.m_drawElevation }
  getThingCount() { return this.m_things.length + this.m_effects.length }
  getThings() { return this.m_things }
  isEmpty() { return this.m_things.length === 0 }
  isDrawable() { return this.m_things.length > 0 || this.m_effects.length > 0 }

  /** OTC Tile::isFullyOpaque() – tile is opaque se qualquer thing na stack for full ground. */
  isFullyOpaque() {
    return this.m_things.some((thing) => thing != null && !!thing.isFullGround?.())
  }

  /** OTC Tile::hasTopGround() – tile has solid top (full ground); usamos mesmo critério que isFullyOpaque. */
  hasTopGround() {
    return this.isFullyOpaque()
  }

  /** OTC Tile::isSingleDimension() – no thing with width or height != 1. */
  isSingleDimension(types) {
    const stack = this.getThings?.() ?? this.m_things ?? []
    for (const thing of stack) {
      const w = thing.getWidth?.() ?? (thing.isItem?.() ? types?.getItem?.(thing.m_entry?.id)?.getWidth?.() : types?.getCreature?.(thing.m_entry?.outfit?.lookType ?? thing.m_entry?.lookType)?.getWidth?.()) ?? 1
      const h = thing.getHeight?.() ?? (thing.isItem?.() ? types?.getItem?.(thing.m_entry?.id)?.getHeight?.() : types?.getCreature?.(thing.m_entry?.outfit?.lookType ?? thing.m_entry?.lookType)?.getHeight?.()) ?? 1
      if (w !== 1 || h !== 1) return false
    }
    return true
  }

  setStack(stack, meta, types) {
    const raw = (stack || []).slice(0, MAX_THINGS)
    this.m_things = raw.map((e) => {
      if (e.kind === 'creature') {
        const id = e.creatureId ?? e.id
        const known = g_map?.getCreatureById?.(id)
        if (known) {
          // Atualiza os dados da criatura conhecida com os novos dados da rede
          known.m_entry = { ...known.m_entry, ...e }
          return known
        }
        return new Creature(e)
      }
      return new Item(e, types)
    })
    this.m_meta = meta
    this.m_isCompletelyCovered = 0
    this.m_isCovered = 0
  }

  /** OTC: Tile::addWalkingCreature(creature) – opera em qualquer objeto tile com walkingCreatures (map tile ou instância). */
  static addWalkingCreature(tile, creature) {
    if (!tile || !creature) return
    if (!tile.walkingCreatures) tile.walkingCreatures = []
    if (!tile.walkingCreatures.includes(creature)) tile.walkingCreatures.push(creature)
  }

  /** OTC: Tile::removeWalkingCreature(creature) – remove criatura da lista de walking do tile. */
  static removeWalkingCreature(tile, creature) {
    if (!tile?.walkingCreatures?.length || !creature) return
    const id = creature.getId?.() ?? creature.m_entry?.creatureId ?? creature.m_entry?.id
    if (id == null) return
    
    tile.walkingCreatures = tile.walkingCreatures.filter(c => {
      const cid = c.getId?.() ?? c.m_entry?.creatureId ?? c.m_entry?.id
      return cid == null || (Number(cid) !== Number(id) && String(cid) !== String(id))
    })
  }

  static addWalkingCreatureToTile(creature, fromPos) {
    if (!creature || !fromPos) return
    const tiles = g_map.m_tiles?.values?.()
    if (tiles) {
      for (const tile of tiles) {
        Tile.removeWalkingCreature(tile, creature)
      }
    }
    const creatureId = creature.getId?.() ?? creature.m_entry?.creatureId ?? creature.m_entry?.id
    if (creatureId != null && g_map.findCreaturePosition && g_map.removeThingByPos) {
      const found = g_map.findCreaturePosition(creatureId)
      if (found?.pos != null && found.stackPos != null) g_map.removeThingByPos(found.pos, found.stackPos)
    }
    const tile = g_map.getOrCreateTile?.(fromPos)
    if (tile) Tile.addWalkingCreature(tile, creature)
  }

  getThing(stackPos) {
    if (stackPos >= 0 && stackPos < this.m_things.length) return this.m_things[stackPos]
    return null
  }

  /** OTC: isCommon() – item that is not ground, groundBorder, onBottom, onTop. */
  _isCommon(thing) {
    return !thing?.isGround?.() && !thing?.isGroundBorder?.() && !thing?.isOnBottom?.() && !thing?.isOnTop?.();
  }

  hasCommonItem() {
    return this.m_things.some((t) => this._isCommon(t))
  }

  hasCreatures() {
    return this.m_things.some((t) => t?.isCreature?.())
  }

  hasTopItem() {
    return this.m_things.some((t) => t?.isOnTop?.())
  }

  /** OTC Tile::hasLight() – thing with light. */
  hasLight() {
    return this.m_things.some((t) => t?.hasLight?.())
  }

  /**
   * OTC Tile::isCompletelyCovered(firstFloor, resetCache) — cache por firstFloor (idChecked = 1<<firstFloor, idState = 1<<(firstFloor+MAP_MAX_Z)).
   * Early outs (z==0, z==firstFloor, hasCreatures, hasLight); depois delega para map.isCompletelyCovered e cacheia o resultado.
   */
  isCompletelyCovered(firstFloor, resetCache, map, types) {
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
  updateElevation(thing, state) {
    if (!thing?.hasElevation?.()) return
    const elevPx = thing.getElevation?.() ?? 0
    state.drawElevationPx = Math.min(MAX_ELEVATION, state.drawElevationPx + elevPx)
  }

  /**
   * OTC: drawThing(thing, dest, flags, drawElevation, lightView) – free function in tile.cpp
   * newDest = dest - drawElevation * scaleFactor; if (flags == DrawLights) thing->drawLight(newDest, lightView); else setDrawOrder(isSingleGround→FIRST, isSingleGroundBorder→SECOND, isEffect&&isDrawingEffectsOnTop→FOURTH, else THIRD); thing->draw(newDest, flags&DrawThings, lightView); updateElevation; resetDrawOrder().
   */
  _drawThing(thing, pipeline, drawFlags, drawElevationPx, steps, state) {
    const elev = drawElevationPx
    const self = this
    const { DrawLights, DrawThings } = DrawFlags
    steps.push(() => {
      if (drawFlags & DrawLights) {
        thing.drawLight?.(pipeline, self.x, self.y, elev, 0, self.z, null)
        return
      }
      if (thing?.isSingleGround?.()) pipeline.setDrawOrder(DrawOrder.FIRST)
      else if (thing?.isSingleGroundBorder?.()) pipeline.setDrawOrder(DrawOrder.SECOND)
      else if (thing?.isEffect?.() && pipeline.isDrawingEffectsOnTop?.()) pipeline.setDrawOrder(DrawOrder.FOURTH)
      else pipeline.setDrawOrder(DrawOrder.THIRD)
      thing.draw(pipeline, self.x, self.y, elev, 0, self.z)
      if (state) self.updateElevation(thing, state)
      pipeline.resetDrawOrder()
    })
  }

  /**
   * OTC: Tile::drawCreature(dest, flags, forceDraw, drawElevation, lightView)
   * 1) Non-walking creatures from m_things (skip if isWalking()).
   * 2) setDrawOrder(THIRD); for (creature : m_walkingCreatures) draw at cDest = dest + (creature->getPosition() - m_position)*tileSize - getDrawElevation(); resetDrawOrder().
   * 3) Local player on virtual tile fallback (stub).
   */
  drawCreature(pipeline, drawFlags, forceDraw, state, steps) {
    if (!forceDraw && !this.m_drawTopAndCreature) return
    const { DrawCreatures } = DrawFlags
    if (!(drawFlags & DrawCreatures)) return

    const walking = this.m_meta?.walkingCreatures ?? []
    const walkingIds = new Set(
      walking.map(wc => wc.entry?.creatureId ?? wc.entry?.id).filter(id => id != null).map(id => String(id))
    )

    for (const thing of this.m_things) {
      if (!thing.isCreature?.()) continue
      
      // Obtém o ID único da criatura. 
      const creatureId = thing.getId?.() ?? thing.m_entry?.creatureId ?? thing.m_entry?.id
      const known = g_map?.getCreatureById?.(creatureId)
      
      // Se a criatura é conhecida e está andando (em qualquer lugar do mapa), 
      // NÃO desenha a versão estática dela neste tile.
      if (known?.isWalking?.()) continue
      
      // Se ela está na lista de walking deste tile específico, também pula
      if (creatureId != null && walkingIds.has(String(creatureId))) continue
      
      const creatureToDraw = known ?? thing
      this._drawThing(creatureToDraw, pipeline, drawFlags, state.drawElevationPx, steps, state)
    }

    // Desenha criaturas que estão "atravessando" este tile (walking)
    if (walking.length) {
      steps.push(() => pipeline.setDrawOrder(DrawOrder.THIRD))
      for (const wc of walking) {
        const creatureId = wc.entry?.creatureId ?? wc.entry?.id
        const known = g_map?.getCreatureById?.(creatureId)
        
        // Se a criatura conhecida não está mais andando, ela deve ser desenhada
        // apenas como um objeto estático no seu tile de destino (m_things).
        if (known && !known.isWalking()) continue

        // Usa a instância real para manter a animação fluida (passos, offsets)
        const creatureToDraw = known ?? new Creature(wc.entry)
        
        const z = this.z
        const drawX = state.drawX
        const drawY = state.drawY
        
        // No OTClient, criaturas em movimento são desenhadas com seu offset real
        // O offsetX/Y do snapshot serve como fallback caso a instância conhecida suma.
        const off = (known && known.isWalking()) ? known.getWalkOffset() : { x: wc.offsetX, y: wc.offsetY }

        steps.push(() => {
          if (typeof creatureToDraw.draw === 'function') {
            creatureToDraw.draw(pipeline, drawX, drawY, 0, 0, z, off.x, off.y)
          }
        })
      }
      steps.push(() => pipeline.resetDrawOrder())
    }
  }

  /**
   * OTC: Tile::drawTop(dest, flags, forceDraw, drawElevation)
   * drawElevation = 0; effects (drawThing → setDrawOrder); onTop items (drawThing).
   */
  drawTop(pipeline, drawFlags, forceDraw, state, steps) {
    if (!forceDraw && !this.m_drawTopAndCreature) return
    const { DrawEffects, DrawOnTop } = DrawFlags

    state.drawElevationPx = 0

    if (drawFlags & DrawEffects && this.m_effects.length > 0) {
      for (const effect of this.m_effects) {
        const self = this
        steps.push(() => {
          pipeline.setDrawOrder(DrawOrder.FOURTH)
          effect.draw?.(pipeline, self.x, self.y, 0, 0, self.z)
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
  drawAttachedEffect(pipeline, lightView, onTop) {
    // No attached effects in this port; stub for 1:1 API.
  }

  /**
   * OTC: Tile::drawAttachedParticlesEffect(dest)
   */
  drawAttachedParticlesEffect(pipeline) {
    // No particles in this port; stub for 1:1 API.
  }

  /**
   * OTC: Tile::draw(dest, flags, lightView)
   * Order: bottom → drawAttachedEffect(false) → common items → [m_tilesRedraw] → drawCreature → drawTop → drawAttachedEffect(true) → drawAttachedParticlesEffect.
   */
  /**
   * OTC: Tile::draw(dest, flags, lightView) – m_lastDrawDest = dest; depois ground, common, drawCreature, drawTop.
   */
  draw(pipeline, drawFlags = 0, viewX, viewY) {
    const things = pipeline.thingsRef?.current
    if (!things) return

    const { DrawGround, DrawGroundBorders, DrawOnBottom, DrawItems, DrawCreatures, DrawEffects, DrawOnTop } = DrawFlags

    this.m_lastDrawDest = { x: viewX, y: viewY }
    const state = { drawElevationPx: 0, drawX: viewX, drawY: viewY }
    const steps = []

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

export { DrawFlags, DEFAULT_DRAW_FLAGS } from '../graphics/drawFlags.js'
export { MAX_THINGS, TILE_PIXELS, MAX_ELEVATION }
