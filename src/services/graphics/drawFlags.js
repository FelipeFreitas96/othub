/**
 * Draw flags for tile rendering (OTC Otc::DrawFlags).
 * In a separate module to avoid circular deps and ensure DEFAULT_DRAW_FLAGS is always defined.
 */

export const DrawFlags = {
  DrawGround: 1 << 0,
  DrawGroundBorders: 1 << 1,
  DrawOnBottom: 1 << 2,
  DrawItems: 1 << 3,
  DrawCreatures: 1 << 4,
  DrawEffects: 1 << 5,
  DrawOnTop: 1 << 6,
  DrawAnimations: 1 << 7,
  DrawLights: 1 << 8,
}

export const DEFAULT_DRAW_FLAGS =
  DrawFlags.DrawGround |
  DrawFlags.DrawGroundBorders |
  DrawFlags.DrawOnBottom |
  DrawFlags.DrawItems |
  DrawFlags.DrawCreatures |
  DrawFlags.DrawEffects |
  DrawFlags.DrawOnTop
