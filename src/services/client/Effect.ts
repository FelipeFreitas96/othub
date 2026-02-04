/**
 * Effect – 1:1 port of OTClient src/client/effect.h + effect.cpp
 * Copyright (c) 2010-2026 OTClient <https://github.com/edubart/otclient>; ported to JS.
 */

import { Thing } from './Thing'
import { g_drawPool } from '../graphics/DrawPoolManager'
import { DrawPoolType } from '../graphics/DrawPool'
import { ThingType } from '../things/thingType'
import { ThingCategory } from '../things/thingType'
import { g_map } from './ClientMap'
import { g_client } from './Client'
import { g_dispatcher } from '../framework/EventDispatcher'
import { getThings } from '../protocol/things'
import { Position } from './Position'

/** OTC: Timer – ticksElapsed() in ms for port. */
function createTimer() {
  let start = Date.now()
  return {
    restart() { start = Date.now() },
    ticksElapsed() { return Date.now() - start },
  }
}

export class Effect extends Thing {
  /** OTC: Timer m_animationTimer */
  private m_animationTimer = createTimer()
  /** OTC: m_duration (ms in port) */
  private m_duration = 0
  /** OTC: m_timeToStartDrawing – only start drawing when previous effect is about to end */
  private m_timeToStartDrawing = 0
  /** OTC: m_numPatternX, m_numPatternY – set in setPosition */
  m_numPatternX = 0
  m_numPatternY = 0

  override isEffect(): boolean { return true }

  /** OTC: ThingType* Effect::getThingType() const */
  override getThingType(_pipeline?: DrawPool): ThingType | null {
    const types = getThings()?.types
    if (!types?.isValidDatId?.(Number(this.m_clientId), ThingCategory.Effect)) return null
    return types.getEffect(Number(this.m_clientId)) ?? null
  }

  /** OTC: void Effect::setId(uint32_t id) */
  override setId(id: number | string): void {
    const types = getThings()?.types
    if (types && !types.isValidDatId(Number(id), ThingCategory.Effect)) return
    this.m_clientId = id
  }

  /** OTC: void Effect::setPosition(const Position& position, uint8_t stackPos) */
  override setPosition(position: Position, stackPos: number = 0): void {
    if (Number(this.m_clientId) === 0) return
    super.setPosition(position, stackPos)
    const tt = this.getThingType()
    const pattern_x = tt?.patternX ?? tt?.m_numPatternX ?? 1
    const pattern_y = tt?.patternY ?? tt?.m_numPatternY ?? 1
    if (pattern_x === 0 || pattern_y === 0) return
    this.m_numPatternX = ((this.m_position!.x % pattern_x) + pattern_x) % pattern_x
    this.m_numPatternY = ((this.m_position!.y % pattern_y) + pattern_y) % pattern_y
  }

  /** OTC: bool Effect::waitFor(const EffectPtr& effect) – delay this effect start so it follows the other */
  waitFor(other: Effect): boolean {
    const ticksElapsed = other.m_animationTimer.ticksElapsed()
    const tt = this.getThingType()
    const phases = Math.max(1, tt?.getAnimationPhases?.() ?? tt?.m_animationPhases ?? 1)
    const effectTicksPerFrame = 100 // stub: g_gameConfig.getEffectTicksPerFrame()
    const minDuration = (tt?.m_animator ? (tt as any).getIdleAnimator?.()?.getMinDuration?.() : effectTicksPerFrame) ?? effectTicksPerFrame
    const minDurationMs = minDuration * Math.max(Math.floor(phases / 3), 1)
    if (ticksElapsed <= minDurationMs) return false
    const duration = other.m_duration / 3
    this.m_timeToStartDrawing = Math.max(0, duration - other.m_animationTimer.ticksElapsed())
    return true
  }

  /** OTC: void Effect::draw(const Point& dest, bool drawThings, LightView*) */
  override draw(tileX: number, tileY: number, drawElevationPx: number, zOff: number, tileZ: number): void {
    if (!g_drawPool.isValid()) return
    if (!this.canDraw() || this.isHided()) return
    if (this.m_animationTimer.ticksElapsed() < this.m_timeToStartDrawing) return

    let animationPhase = 0
    const tt = this.getThingType()
    if (tt && (tt.getAnimationPhases?.() ?? tt.m_animationPhases ?? 0) > 1) {
      const animator = (tt as any).getIdleAnimator?.()
      if (animator?.getPhaseAt) {
        animationPhase = animator.getPhaseAt(this.m_animationTimer)
      } else {
        const effectTicksPerFrame = 100
        const phases = Math.max(1, tt.getAnimationPhases?.() ?? tt.m_animationPhases ?? 1)
        let ticks = effectTicksPerFrame
        if (Number(this.m_clientId) === 33) ticks *= 4
        animationPhase = Math.min(
          Math.floor(this.m_animationTimer.ticksElapsed() / ticks),
          phases - 1
        )
      }
    }

    const center = g_map.getCentralPosition()
    const pos = this.m_position
    if (!pos) return

    const offsetX = pos.x - center.x
    const offsetY = pos.y - center.y
    const numPatternX = tt?.patternX ?? tt?.m_numPatternX ?? 1
    const numPatternY = tt?.patternY ?? tt?.m_numPatternY ?? 1
    let xPattern = ((offsetX % numPatternX) + numPatternX) % numPatternX
    xPattern = 1 - xPattern - numPatternX
    if (xPattern < 0) xPattern += numPatternX
    let yPattern = ((offsetY % numPatternY) + numPatternY) % numPatternY

    if (!tt || tt.m_null || (tt.getAnimationPhases?.() ?? tt.m_animationPhases ?? 0) === 0) return
    if (g_drawPool.getCurrentType?.() === DrawPoolType.MAP) {
      const effectAlpha = g_client.getEffectAlpha()
      if (effectAlpha < 1) {
        g_drawPool.setOpacity(effectAlpha, true)
      }
    }
    
    if (this.m_shaderId != null) {
      g_drawPool.setShaderProgram(this.g_shaders.getShaderById(this.m_shaderId), true)
    }

    const TILE_PIXELS = 32
    const dest = {
      tileX,
      tileY,
      drawElevationPx,
      zOff,
      tileZ,
    }

    tt.draw(dest, 0, xPattern, yPattern, 0, animationPhase, { r: 255, g: 255, b: 255 }, true, null)
  }

  /** OTC: void Effect::onAppear() */
  override onAppear(): void {
    const tt = this.getThingType()
    const animator = tt ? (tt as any).getIdleAnimator?.() : null
    if (animator?.getTotalDuration) {
      this.m_duration = animator.getTotalDuration()
    } else {
      const effectTicksPerFrame = 100
      let d = effectTicksPerFrame
      if (Number(this.m_clientId) === 33) d *= 4
      this.m_duration = d * Math.max(1, tt?.getAnimationPhases?.() ?? tt?.m_animationPhases ?? 1)
    }
    this.m_animationTimer.restart()
    g_dispatcher.scheduleEvent(() => {;
      g_map.removeThing(this)
      console.log("REMOVA OS EFEITO")
    }, this.m_duration)
  }

  private canDraw(): boolean { return true }
  private isHided(): boolean { return false }
}
