/**
 * Item – 1:1 com OTClient: Thing que desenha a si mesmo via draw().
 * OTC: Item::draw(dest, scaleFactor, animate, lightView) → getThingType()->draw(dest, 0, xPattern, yPattern, zPattern, animationPhase, color, drawThings, lightView).
 */

import { Thing } from './Thing'
import { DrawPool } from '../graphics/DrawPool'
import { ThingType } from '../things/thingType'
import { ThingTypeManager } from '../things/thingTypeManager'

export interface ItemData {
  id: number
  count?: number
  subtype?: number
  countOrSubType?: number
  groundSpeed?: number
}

export class Item extends Thing {
  m_id: number
  m_count: number
  m_countOrSubType: number
  m_types: ThingTypeManager
  m_thingType: ThingType | null

  constructor(data: ItemData, types: ThingTypeManager) {
    super()
    this.m_id = data.id
    this.m_count = data.count ?? 1
    this.m_countOrSubType = data.countOrSubType ?? data.subtype ?? 1
    this.m_types = types
    this.m_thingType = types?.getItem?.(this.m_id) ?? null
  }

  get id() { return this.m_id }
  get count() { return this.m_count }

  // Override Thing methods
  override getThingType() { return this.m_thingType }
  override isItem() { return true }
  override getId(): number { return this.m_id }

  /**
   * OTC: Item::calculatePatterns(xPattern, yPattern, zPattern)
   */
  calculatePatterns(pipeline: DrawPool, tileX: number, tileY: number, tileZ: number) {
    const tt = this.m_thingType
    if (!tt || tt.m_null) return { xPattern: 0, yPattern: 0, zPattern: 0 }
    const z = tileZ ?? pipeline?.map?.z ?? 0
    const tileAt = (tx: number, ty: number) => pipeline.map?.getTile?.(tx, ty, z)
    const hasItem = (tx: number, ty: number, id: number) => {
      const t = tileAt(tx, ty)
      if (!t) return false
      const stack = t.getThings?.() ?? t.stack ?? t.m_things ?? []
      return stack.some((s: any) => (s?.m_id ?? s?.id) === id && s?.isItem?.())
    }
    const itemId = this.m_id
    const px = tt.patternX ?? tt.m_numPatternX ?? 1
    const py = tt.patternY ?? tt.m_numPatternY ?? 1
    const pz = tt.patternZ ?? tt.m_numPatternZ ?? 1
    if (tt.isStackable?.() && px === 4 && py === 2) {
      const c = this.m_countOrSubType
      if (c <= 0) return { xPattern: 0, yPattern: 0, zPattern: 0 }
      if (c < 5) return { xPattern: c - 1, yPattern: 0, zPattern: 0 }
      if (c < 10) return { xPattern: 0, yPattern: 1, zPattern: 0 }
      if (c < 25) return { xPattern: 1, yPattern: 1, zPattern: 0 }
      if (c < 50) return { xPattern: 2, yPattern: 1, zPattern: 0 }
      return { xPattern: 3, yPattern: 1, zPattern: 0 }
    }
    if (px >= 4 && py >= 4 && pipeline.map) {
      const n = tt.groundBorder ? !!(tileAt(tileX, tileY - 1)?.meta?.groundId) : hasItem(tileX, tileY - 1, itemId)
      const e = tt.groundBorder ? !!(tileAt(tileX + 1, tileY)?.meta?.groundId) : hasItem(tileX + 1, tileY, itemId)
      const s = tt.groundBorder ? !!(tileAt(tileX, tileY + 1)?.meta?.groundId) : hasItem(tileX, tileY + 1, itemId)
      const w = tt.groundBorder ? !!(tileAt(tileX - 1, tileY)?.meta?.groundId) : hasItem(tileX - 1, tileY, itemId)
      const mask = (n ? 1 : 0) | (e ? 2 : 0) | (s ? 4 : 0) | (w ? 8 : 0)
      return { xPattern: mask % 4, yPattern: Math.floor(mask / 4), zPattern: 0 }
    }
    return { xPattern: tileX % px, yPattern: tileY % py, zPattern: z % pz }
  }

  /**
   * OTC: Item::calculateAnimationPhase(animate). OTC creature (item/effect) uses ticksPerFrame = ITEM_TICKS_PER_FRAME; creature idle uses 1000/phases. We use cycle 1000ms like OTC idle.
   */
  calculateAnimationPhase(animate: boolean) {
    const tt = this.m_thingType
    const phases = tt?.getAnimationPhases?.() ?? tt?.phases ?? 1
    if (phases <= 1) return 0
    if (!animate) return phases - 1
    const ms = typeof performance !== 'undefined' ? performance.now() : Date.now()
    const cycleMs = 1000
    const ticksPerPhase = cycleMs / phases
    return Math.floor((ms % cycleMs) / ticksPerPhase) % phases
  }

  /**
   * OTC: Item::draw(dest, scaleFactor, animate, lightView) → getThingType()->draw(dest, 0, xPattern, yPattern, zPattern, animationPhase, color, drawThings, lightView).
   */
  override draw(pipeline: DrawPool, tileX: number, tileY: number, drawElevationPx: number, zOff: number, tileZ: number) {
    const tt = this.getThingType()
    if (!tt) return
    const dest = { tileX, tileY, drawElevationPx, zOff, tileZ }
    const { xPattern, yPattern, zPattern } = this.calculatePatterns(pipeline, tileX, tileY, tileZ)
    const animationPhase = this.calculateAnimationPhase(true)
    tt.draw(pipeline, dest, 0, xPattern, yPattern, zPattern, animationPhase, null, true, null)
  }
}
