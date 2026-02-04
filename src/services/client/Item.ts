/**
 * Item – 1:1 com OTClient: Thing que desenha a si mesmo via draw().
 * OTC: Item::draw() usa m_numPatternX/Y/Z (setados por updatePatterns()); onPositionChange() chama updatePatterns().
 * OTC: Item::updatePatterns() – variação baseada na POSIÇÃO do item (m_position = mundo), não na view.
 */

import { Thing } from './Thing'
import { ThingType } from '../things/thingType'
import { ThingTypeManager } from '../things/thingTypeManager'
import { g_map } from './ClientMap'

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
  /** OTC: m_numPatternX, m_numPatternY, m_numPatternZ – setados por updatePatterns(), usados no draw(). */
  m_numPatternX: number = 0
  m_numPatternY: number = 0
  m_numPatternZ: number = 0

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

  override setPosition(pos: import('./Position').Position, stackPos: number = 0) {
    super.setPosition(pos, stackPos)
    this.updatePatterns()
  }

  /**
   * OTC: Item::updatePatterns() – item.cpp L127–246.
   * Variação baseada na posição MUNDO do item (m_position), não na posição do jogador/view.
   */
  updatePatterns() {
    this.m_numPatternX = 0
    this.m_numPatternY = 0
    this.m_numPatternZ = 0

    const tt = this.m_thingType
    if (!tt || tt.m_null) return

    const numPatternX = tt.patternX ?? tt.m_numPatternX ?? 1
    const numPatternY = tt.patternY ?? tt.m_numPatternY ?? 1
    const numPatternZ = tt.patternZ ?? tt.m_numPatternZ ?? 1

    if (tt.isStackable?.() && numPatternX === 4 && numPatternY === 2) {
      const c = this.m_countOrSubType
      if (c <= 0) { this.m_numPatternX = 0; this.m_numPatternY = 0; return }
      if (c < 5) { this.m_numPatternX = c - 1; this.m_numPatternY = 0; return }
      if (c < 10) { this.m_numPatternX = 0; this.m_numPatternY = 1; return }
      if (c < 25) { this.m_numPatternX = 1; this.m_numPatternY = 1; return }
      if (c < 50) { this.m_numPatternX = 2; this.m_numPatternY = 1; return }
      this.m_numPatternX = 3; this.m_numPatternY = 1
      return
    }

    const ttAny = tt as { isHangable?: () => boolean }
    if (ttAny.isHangable?.()) {
      const tile = g_map?.getTile?.(this.m_position!)
      if (tile) {
        const mustHookSouth = (tile as any).mustHookSouth?.()
        const mustHookEast = (tile as any).mustHookEast?.()
        if (mustHookSouth) this.m_numPatternX = numPatternX >= 2 ? 1 : 0
        else if (mustHookEast) this.m_numPatternX = numPatternX >= 3 ? 2 : 0
      }
      return
    }

    if (tt.isSplash?.() || tt.isFluidContainer?.()) {
      const color = this.m_countOrSubType
      this.m_numPatternX = (color % 4) % numPatternX
      this.m_numPatternY = Math.floor(color / 4) % numPatternY
      return
    }

    // Default: variação pela posição MUNDO do item (OTC: m_position.x % numPatternX, etc.)
    const pos = this.m_position
    if (!pos) return
    this.m_numPatternX = pos.x % Math.max(1, numPatternX)
    this.m_numPatternY = pos.y % Math.max(1, numPatternY)
    this.m_numPatternZ = pos.z % Math.max(1, numPatternZ)
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
   * OTC: Item::draw(dest, …) → getThingType()->draw(dest, 0, m_numPatternX, m_numPatternY, m_numPatternZ, …).
   * Uses g_drawPool (DrawPoolManager); no pipeline param, like OTClient.
   */
  override draw(tileX: number, tileY: number, drawElevationPx: number, zOff: number, tileZ: number) {
    const tt = this.getThingType()
    if (!tt) return
    const dest = { tileX, tileY, drawElevationPx, zOff, tileZ }
    const animationPhase = this.calculateAnimationPhase(true)
    tt.draw(dest, 0, this.m_numPatternX, this.m_numPatternY, this.m_numPatternZ, animationPhase, null, true, null)
  }
}
