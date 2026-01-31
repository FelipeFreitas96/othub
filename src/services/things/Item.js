/**
 * Item – 1:1 com OTClient: Thing que desenha a si mesmo via draw().
 * OTC: Item::draw(dest, scaleFactor, animate, lightView) → getThingType()->draw(dest, 0, xPattern, yPattern, zPattern, animationPhase, color, drawThings, lightView).
 */

export class Item {
  constructor(entry, types) {
    this.m_entry = entry
    this.m_types = types
    this.m_thingType = types?.getItem?.(entry?.id) ?? null
  }

  getThingType() { return this.m_thingType }
  getElevation() { return (this.m_thingType?.elevation ?? this.m_thingType?.getElevation?.() ?? 0) }
  hasElevation() { return !!this.m_thingType?.hasElevation?.() }
  isGround() { return !!(this.m_thingType?.ground ?? this.m_thingType?.isGround?.()) }
  isGroundBorder() { return !!(this.m_thingType?.groundBorder ?? this.m_thingType?.isGroundBorder?.()) }
  isOnBottom() { return !!(this.m_thingType?.onBottom ?? this.m_thingType?.isOnBottom?.()) }
  isOnTop() { return !!(this.m_thingType?.onTop ?? this.m_thingType?.isOnTop?.()) }
  isFullGround() { return !!(this.m_thingType?.fullGround ?? this.m_thingType?.isFullGround?.()) }
  isItem() { return true }
  isCreature() { return false }
  getWidth() { return this.m_thingType?.getWidth?.() ?? this.m_thingType?.width ?? 1 }
  getHeight() { return this.m_thingType?.getHeight?.() ?? this.m_thingType?.height ?? 1 }

  /**
   * OTC: Item::calculatePatterns(xPattern, yPattern, zPattern)
   */
  calculatePatterns(pipeline, tileX, tileY, tileZ) {
    const tt = this.m_thingType
    if (!tt || tt.m_null) return { xPattern: 0, yPattern: 0, zPattern: 0 }
    const z = tileZ ?? pipeline?.map?.z ?? 0
    const tileAt = (tx, ty) => pipeline.map?.getTile?.(tx, ty, z)
    const hasItem = (tx, ty, id) => {
      const t = tileAt(tx, ty)
      if (!t) return false
      const stack = t.getThings?.() ?? t.stack ?? t.m_things ?? []
      return stack.some((s) => (s?.m_entry?.id ?? s?.id) === id && (s?.isItem?.() ?? s?.kind === 'item'))
    }
    const itemId = this.m_entry?.id
    const px = tt.patternX ?? tt.m_numPatternX ?? 1
    const py = tt.patternY ?? tt.m_numPatternY ?? 1
    const pz = tt.patternZ ?? tt.m_numPatternZ ?? 1
    if (tt.isStackable?.() && px === 4 && py === 2) {
      const c = this.m_entry?.count ?? this.m_entry?.countOrSubType ?? 1
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
  calculateAnimationPhase(animate) {
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
  draw(pipeline, tileX, tileY, drawElevationPx, zOff, tileZ) {
    const tt = this.getThingType()
    if (!tt) return
    const dest = { tileX, tileY, drawElevationPx, zOff, tileZ }
    const { xPattern, yPattern, zPattern } = this.calculatePatterns(pipeline, tileX, tileY, tileZ)
    const animationPhase = this.calculateAnimationPhase(true)
    tt.draw(pipeline, dest, 0, xPattern, yPattern, zPattern, animationPhase, null, true, null)
  }
}
