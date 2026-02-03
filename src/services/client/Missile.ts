/**
 * Missile – 1:1 port of OTClient src/client/missile.h + missile.cpp
 * Copyright (c) 2010-2026 OTClient <https://github.com/edubart/otclient>; ported to JS.
 */

import { Thing } from './Thing'
import { DrawPool, DrawPoolType, DrawOrder } from '../graphics/DrawPool'
import { ThingType } from '../things/thingType'
import { ThingCategory } from '../things/thingType'
import { g_map } from './ClientMap'
import { g_dispatcher } from '../framework/EventDispatcher'
import { getThings } from '../protocol/things'
import { Position } from './Position'
import { Direction, type DirectionType } from './Position'

/** OTC: Timer – ticksElapsed() in ms for port. */
function createTimer() {
  let start = Date.now()
  return {
    restart() { start = Date.now() },
    ticksElapsed() { return Date.now() - start },
  }
}

export class Missile extends Thing {
  private m_animationTimer = createTimer()
  /** OTC: Point m_delta (pixels) */
  m_delta: { x: number; y: number } = { x: 0, y: 0 }
  /** OTC: m_duration (ms in port) */
  private m_duration = 0
  /** OTC: Otc::Direction m_direction */
  m_direction: DirectionType = Direction.InvalidDirection
  /** OTC: m_distance (tiles) */
  m_distance = 0
  /** OTC: m_numPatternX, m_numPatternY – set by setDirection */
  m_numPatternX = 1
  m_numPatternY = 1

  override isMissile(): boolean { return true }

  /** OTC: ThingType* Missile::getThingType() const */
  override getThingType(_pipeline?: DrawPool): ThingType | null {
    const types = getThings()?.types
    if (!types) return null
    const id = Number(this.m_clientId)
    if (!types.isValidDatId(id, ThingCategory.Missile)) return null
    return types.getMissile(id) ?? null
  }

  /** OTC: void Missile::setId(uint32_t id) */
  override setId(id: number | string): void {
    const types = getThings()?.types
    const numId = Number(id)
    if (types && !types.isValidDatId(numId, ThingCategory.Missile)) {
      this.m_clientId = 0
      return
    }
    this.m_clientId = id
  }

  /** OTC: void Missile::setPath(const Position& fromPosition, const Position& toPosition) */
  setPath(fromPosition: Position, toPosition: Position): void {
    this.setPosition(fromPosition.clone(), 0)
    const dx = toPosition.x - fromPosition.x
    const dy = toPosition.y - fromPosition.y
    this.m_delta = { x: dx, y: dy }
    const deltaLength = Math.sqrt(this.m_delta.x * this.m_delta.x + this.m_delta.y * this.m_delta.y)
    if (deltaLength === 0) {
      g_dispatcher.addEvent(() => { g_map.removeThing(this) })
      return
    }
    const from = fromPosition instanceof Position ? fromPosition : Position.from(fromPosition)
    const to = toPosition instanceof Position ? toPosition : Position.from(toPosition)
    this.setDirection(from.getDirectionFromPosition(to))
    const missileTicksPerFrame = 50
    this.m_duration = (missileTicksPerFrame * 2) * Math.sqrt(deltaLength)
    const spriteSize = 32
    this.m_delta.x *= spriteSize
    this.m_delta.y *= spriteSize
    this.m_animationTimer.restart()
    this.m_distance = fromPosition.distance?.(toPosition) ?? Math.max(Math.abs(dx), Math.abs(dy))
    g_dispatcher.scheduleEvent(() => { g_map.removeThing(this) }, this.m_duration)
  }

  /** OTC: void Missile::setDirection(Otc::Direction dir) */
  setDirection(dir: DirectionType): void {
    this.m_direction = dir
    if (dir === Direction.NorthWest) {
      this.m_numPatternX = 0
      this.m_numPatternY = 0
    } else if (dir === Direction.North) {
      this.m_numPatternX = 1
      this.m_numPatternY = 0
    } else if (dir === Direction.NorthEast) {
      this.m_numPatternX = 2
      this.m_numPatternY = 0
    } else if (dir === Direction.East) {
      this.m_numPatternX = 2
      this.m_numPatternY = 1
    } else if (dir === Direction.SouthEast) {
      this.m_numPatternX = 2
      this.m_numPatternY = 2
    } else if (dir === Direction.South) {
      this.m_numPatternX = 1
      this.m_numPatternY = 2
    } else if (dir === Direction.SouthWest) {
      this.m_numPatternX = 0
      this.m_numPatternY = 2
    } else if (dir === Direction.West) {
      this.m_numPatternX = 0
      this.m_numPatternY = 1
    } else {
      this.m_numPatternX = 1
      this.m_numPatternY = 1
    }
  }

  getDirection(): DirectionType { return this.m_direction }

  /** OTC: void Missile::draw(const Point& dest, bool drawThings, LightView*) */
  override draw(
    pipeline: DrawPool,
    tileX: number,
    tileY: number,
    drawElevationPx: number,
    zOff: number,
    tileZ: number
  ): void {
    if (!this.canDraw() || this.isHided()) return
    const tt = this.getThingType(pipeline)
    if (!tt || tt.m_null || (tt.getAnimationPhases?.() ?? tt.m_animationPhases ?? 0) === 0) return

    const fraction = this.m_duration > 0 ? this.m_animationTimer.ticksElapsed() / this.m_duration : 1
    const scaleFactor = pipeline.getScaleFactor?.() ?? 1
    const TILE_PIXELS = 32
    const offsetX = (this.m_delta.x * fraction * scaleFactor) / TILE_PIXELS
    const offsetY = (this.m_delta.y * fraction * scaleFactor) / TILE_PIXELS

    if (pipeline.getCurrentType?.() === DrawPoolType.MAP) {
      pipeline.setDrawOrder?.(DrawOrder.FOURTH)
      const missileAlpha = (pipeline as any).getMissileAlpha?.() ?? 1
      if (missileAlpha < 1) pipeline.setOpacity?.(missileAlpha, true)
    }
    if ((this as any).m_shaderId != null) {
      (pipeline as any).setShaderProgram?.((globalThis as any).g_shaders?.getShaderById?.(this.m_shaderId), true)
    }

    const dest = {
      tileX: tileX + offsetX,
      tileY: tileY + offsetY,
      drawElevationPx,
      zOff,
      tileZ,
    }
    tt.draw(pipeline, dest, 0, this.m_numPatternX, this.m_numPatternY, 0, 0, { r: 255, g: 255, b: 255 }, true, null)
    pipeline.resetDrawOrder?.()
  }

  private canDraw(): boolean { return true }
  private isHided(): boolean { return false }
}
