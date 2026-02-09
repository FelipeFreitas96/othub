/**
 * Stub for OTC g_gameConfig – tile/map drawing constants.
 */

export const TILE_SPRITE_SIZE = 32
export const TILE_MAX_ELEVATION = 24
export const TILE_MAX_THINGS = 10
export const MAP_MAX_Z = 15
/** OTC: getMapSeaFloor() – default 7. */
export const MAP_SEA_FLOOR = 7
/** OTC: getMapUndergroundFloorRange() – default 2. */
export const MAP_UNDERGROUND_FLOOR_RANGE = 2
/** OTC: getMapAwareUndergroundFloorRange() – default 2. */
export const MAP_AWARE_UNDERGROUND_FLOOR_RANGE = 2

/** OTC: effect ticks per frame (for AttachedEffect getCurrentAnimationPhase). */
export const EFFECT_TICKS_PER_FRAME = 75

/** OTC: getTileTransparentFloorViewRange() – range for transparent floor view. */
export const TILE_TRANSPARENT_FLOOR_VIEW_RANGE = 1
export const FORCE_NEW_WALKING_FORMULA = true
export const CREATURE_DIAGONAL_WALK_SPEED = 3
export const PLAYER_DIAGONAL_WALK_SPEED = 3

export const g_gameConfig = {
  getSpriteSize: () => TILE_SPRITE_SIZE,
  getTileMaxElevation: () => TILE_MAX_ELEVATION,
  getTileMaxThings: () => TILE_MAX_THINGS,
  getMapMaxZ: () => MAP_MAX_Z,
  getMapSeaFloor: () => MAP_SEA_FLOOR,
  getMapUndergroundFloorRange: () => MAP_UNDERGROUND_FLOOR_RANGE,
  getMapAwareUndergroundFloorRange: () => MAP_AWARE_UNDERGROUND_FLOOR_RANGE,
  getEffectTicksPerFrame: () => EFFECT_TICKS_PER_FRAME,
  getTileTransparentFloorViewRange: () => TILE_TRANSPARENT_FLOOR_VIEW_RANGE,
  isForcingNewWalkingFormula: () => FORCE_NEW_WALKING_FORMULA,
  getCreatureDiagonalWalkSpeed: () => CREATURE_DIAGONAL_WALK_SPEED,
  getPlayerDiagonalWalkSpeed: () => PLAYER_DIAGONAL_WALK_SPEED,
}
