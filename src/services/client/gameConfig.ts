/**
 * Stub for OTC g_gameConfig – tile/map drawing constants.
 */

export const TILE_SPRITE_SIZE = 32
export const TILE_MAX_ELEVATION = 24
export const TILE_MAX_THINGS = 10
export const MAP_MAX_Z = 15

/** OTC: effect ticks per frame (for AttachedEffect getCurrentAnimationPhase). */
export const EFFECT_TICKS_PER_FRAME = 75

export const g_gameConfig = {
  getSpriteSize: () => TILE_SPRITE_SIZE,
  getTileMaxElevation: () => TILE_MAX_ELEVATION,
  getTileMaxThings: () => TILE_MAX_THINGS,
  getMapMaxZ: () => MAP_MAX_Z,
  getEffectTicksPerFrame: () => EFFECT_TICKS_PER_FRAME,
}
