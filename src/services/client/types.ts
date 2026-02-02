// Re-export classes
export { Thing } from './Thing'
export { Position, Direction, ensurePosition } from './Position'
export type { PositionLike, DirectionType } from './Position'

// Import for use in interfaces
import { Thing } from './Thing'
import { Position } from './Position'

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
    requestVisibleTilesCacheUpdate?(): void
    setMapState?(state: any): void
}
