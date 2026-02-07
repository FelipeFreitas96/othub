/**
 * Position – 1:1 port of OTClient src/client/position.h
 * Copyright (c) 2010-2026 OTClient <https://github.com/edubart/otclient>; ported to JS.
 */

// OTC Otc::Direction constants
export const Direction = {
  North: 0,
  East: 1,
  South: 2,
  West: 3,
  NorthEast: 4,
  SouthEast: 5,
  SouthWest: 6,
  NorthWest: 7,
  InvalidDirection: -1
} as const

export type DirectionType = typeof Direction[keyof typeof Direction]

const RAD_TO_DEG = 180 / Math.PI

export class Position {
  x: number
  y: number
  z: number

  constructor(x: number = 0xFFFF, y: number = 0xFFFF, z: number = 0xFF) {
    this.x = x
    this.y = y
    this.z = z
  }

  // Create from plain object
  static from(obj: { x: number, y: number, z: number }): Position {
    return new Position(obj.x, obj.y, obj.z)
  }

  // Clone this position
  clone(): Position {
    return new Position(this.x, this.y, this.z)
  }

  // Convert to plain object (for compatibility)
  toObject(): { x: number, y: number, z: number } {
    return { x: this.x, y: this.y, z: this.z }
  }

  // Translate position in a direction
  translatedToDirection(direction: DirectionType): Position {
    const pos = this.clone()
    switch (direction) {
      case Direction.North: pos.y--; break
      case Direction.East: pos.x++; break
      case Direction.South: pos.y++; break
      case Direction.West: pos.x--; break
      case Direction.NorthEast: pos.x++; pos.y--; break
      case Direction.SouthEast: pos.x++; pos.y++; break
      case Direction.SouthWest: pos.x--; pos.y++; break
      case Direction.NorthWest: pos.x--; pos.y--; break
    }
    return pos
  }

  // Translate position in reverse direction
  translatedToReverseDirection(direction: DirectionType): Position {
    const pos = this.clone()
    switch (direction) {
      case Direction.North: pos.y++; break
      case Direction.East: pos.x--; break
      case Direction.South: pos.y--; break
      case Direction.West: pos.x++; break
      case Direction.NorthEast: pos.x--; pos.y++; break
      case Direction.SouthEast: pos.x--; pos.y--; break
      case Direction.SouthWest: pos.x++; pos.y--; break
      case Direction.NorthWest: pos.x++; pos.y++; break
    }
    return pos
  }

  // Check if direction is diagonal
  static isDiagonal(dir: DirectionType): boolean {
    return dir === Direction.NorthWest || 
           dir === Direction.NorthEast || 
           dir === Direction.SouthWest || 
           dir === Direction.SouthEast
  }

  // Get angle between two positions (in radians, 0 to 2*PI, -1 if same)
  static getAngleFromPositions(fromPos: Position, toPos: Position): number {
    const dx = toPos.x - fromPos.x
    const dy = toPos.y - fromPos.y
    if (dx === 0 && dy === 0) return -1
    
    let angle = Math.atan2(-dy, dx)
    if (angle < 0) angle += 2 * Math.PI
    return angle
  }

  getAngleFromPosition(position: Position): number {
    return Position.getAngleFromPositions(this, position)
  }

  // Get direction from one position to another
  static getDirectionFromPositions(fromPos: Position, toPos: Position): DirectionType {
    const angle = Position.getAngleFromPositions(fromPos, toPos) * RAD_TO_DEG
    
    if (angle >= 360 - 22.5 || angle < 0 + 22.5) return Direction.East
    if (angle >= 45 - 22.5 && angle < 45 + 22.5) return Direction.NorthEast
    if (angle >= 90 - 22.5 && angle < 90 + 22.5) return Direction.North
    if (angle >= 135 - 22.5 && angle < 135 + 22.5) return Direction.NorthWest
    if (angle >= 180 - 22.5 && angle < 180 + 22.5) return Direction.West
    if (angle >= 225 - 22.5 && angle < 225 + 22.5) return Direction.SouthWest
    if (angle >= 270 - 22.5 && angle < 270 + 22.5) return Direction.South
    if (angle >= 315 - 22.5 && angle < 315 + 22.5) return Direction.SouthEast
    
    return Direction.InvalidDirection
  }

  getDirectionFromPosition(position: Position): DirectionType {
    return Position.getDirectionFromPositions(this, position)
  }

  // Check if position is valid
  isValid(): boolean {
    return !(this.x === 0xFFFF && this.y === 0xFFFF && this.z === 0xFF)
  }

  // Calculate distance to another position
  distance(pos: Position): number {
    return Math.sqrt(Math.pow(pos.x - this.x, 2) + Math.pow(pos.y - this.y, 2))
  }

  // Calculate Manhattan distance
  manhattanDistance(pos: Position): number {
    return Math.abs(pos.x - this.x) + Math.abs(pos.y - this.y)
  }

  // Translate in place
  translate(dx: number, dy: number, dz: number = 0): void {
    this.x += dx
    this.y += dy
    this.z += dz
  }

  // Get translated copy
  translated(dx: number, dy: number, dz: number = 0): Position {
    return new Position(this.x + dx, this.y + dy, this.z + dz)
  }

  // Get all 8 positions around this one
  getPositionsAround(): Position[] {
    const positions: Position[] = []
    for (let xi = -1; xi <= 1; xi++) {
      for (let yi = -1; yi <= 1; yi++) {
        if (xi === 0 && yi === 0) continue
        positions.push(this.translated(xi, yi))
      }
    }
    return positions
  }

  // Arithmetic operations
  add(other: Position): Position {
    return new Position(this.x + other.x, this.y + other.y, this.z + other.z)
  }

  subtract(other: Position): Position {
    return new Position(this.x - other.x, this.y - other.y, this.z - other.z)
  }

  /** OTC Position::isValid() – not the invalid sentinel (0xFFFF, 0xFFFF, 0xFF). */
  isValid(): boolean {
    return !(this.x === 0xFFFF && this.y === 0xFFFF && this.z === 0xFF)
  }

  // Equality check
  equals(other: Position | { x: number, y: number, z: number } | null | undefined): boolean {
    if (!other) return false
    return this.x === other.x && this.y === other.y && this.z === other.z
  }

  // Check if in range
  isInRange(pos: Position, xRange: number, yRange: number, ignoreZ: boolean = false): boolean {
    if (pos.z !== this.z && !ignoreZ) return false
    return Math.abs(this.x - pos.x) <= xRange && Math.abs(this.y - pos.y) <= yRange
  }

  // Move up/down floors
  up(n: number = 1): boolean {
    const newZ = this.z - n
    if (newZ < 0) return false
    this.z = newZ
    return true
  }

  down(n: number = 1): boolean {
    const newZ = this.z + n
    if (newZ > 15) return false
    this.z = newZ
    return true
  }

  // Covered up/down (with x,y adjustment)
  coveredUp(n: number = 1): boolean {
    const newZ = this.z - n
    if (newZ < 0) return false
    this.x += n
    this.y += n
    this.z = newZ
    return true
  }

  coveredDown(n: number = 1): boolean {
    const newZ = this.z + n
    if (newZ > 15) return false
    this.x -= n
    this.y -= n
    this.z = newZ
    return true
  }

  // Hash for use as map key
  hash(): number {
    return ((this.x * 8192) + this.y) * 16 + this.z
  }

  // String representation
  toString(): string {
    return `${this.x},${this.y},${this.z}`
  }

  // Create hash key string for Map usage
  toKey(): string {
    return `${this.x}:${this.y}:${this.z}`
  }
}

// Type alias for compatibility with old interface
export type PositionLike = Position | { x: number, y: number, z: number }

// Helper to ensure we have a Position instance
export function ensurePosition(pos: PositionLike): Position {
  if (pos instanceof Position) return pos
  return Position.from(pos)
}
