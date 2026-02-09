// Re-export classes
export { Thing } from './Thing'
export { Position, Direction, ensurePosition } from './Position'
export type { PositionLike, DirectionType } from './Position'

// Import for use in interfaces
import { Thing } from './Thing'
import { Position } from './Position'
import type { PositionLike } from './Position'

export interface Outfit {
    lookType: number
    head?: number
    body?: number
    legs?: number
    feet?: number
    addons?: number
    lookTypeEx?: number
}

export interface Light {
    intensity: number
    color: number
}

/** OTC Size – width/height in pixels or tiles depending on context. */
export interface Size {
  width: number
  height: number
}

/** OTC Color constants used by legacy client modules (packed RGB). */
export const Color = {
  alpha: 0x000000,
  white: 0xFFFFFF,
} as const

/** OTC Timer – minimal utility with restart()/ticksElapsed(). */
export class Timer {
  private m_startTime: number

  constructor() {
    this.m_startTime = Date.now()
  }

  restart(): void {
    this.m_startTime = Date.now()
  }

  ticksElapsed(): number {
    return Date.now() - this.m_startTime
  }
}

export interface MapView {
    onCameraMove(offset: { x: number, y: number }): void
    onTileUpdate(pos: Position, thing: Thing | null, operation: string): void
    requestUpdateVisibleTiles?(): void
}

/** OTC Point – x, y in pixels */
export interface Point { x: number; y: number }

/** OTC Rect – x, y, width, height */
export interface Rect { x: number; y: number; width: number; height: number }

/** OTC MapPosInfo – staticdata.h */
export interface MapPosInfo {
  rect: Rect
  drawOffset: Point
  scaleFactor: number
  horizontalStretchFactor: number
  verticalStretchFactor: number
  isInRange: (pos: PositionLike, ignoreZ?: boolean) => boolean
}
