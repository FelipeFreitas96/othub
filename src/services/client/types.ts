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

export interface MapView {
    onCameraMove(offset: { x: number, y: number }): void
    onTileUpdate(pos: Position, thing: Thing, operation: string): void
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
