/**
 * Draw flags for tile rendering (OTC Otc::DrawFlags).
 * In a separate module to avoid circular deps and ensure DEFAULT_DRAW_FLAGS is always defined.
 */

/** OTC Otc::DrawFlags – match client/const.h */
export enum DrawFlags {
  DrawGround = 1 << 0,
  DrawGroundBorders = 1 << 1,
  DrawOnBottom = 1 << 2,
  DrawItems = 1 << 3,
  DrawCreatures = 1 << 4,
  DrawEffects = 1 << 5,
  DrawOnTop = 1 << 6,
  DrawAnimations = 1 << 7,
  DrawLights = 1 << 8,
  /** OTC: DrawCreatureInfo – name, health bar, skull, shield above creature */
  DrawCreatureInfo = 1 << 9,
  DrawNames = 1 << 10,
  DrawBars = 1 << 11,
  DrawManaBar = 1 << 12,
  DrawHarmony = 1 << 13,
  DrawThings = 1 << 14,
}

export const DEFAULT_DRAW_FLAGS =
  DrawFlags.DrawGround |
  DrawFlags.DrawGroundBorders |
  DrawFlags.DrawOnBottom |
  DrawFlags.DrawItems |
  DrawFlags.DrawCreatures |
  DrawFlags.DrawEffects |
  DrawFlags.DrawOnTop |
  DrawFlags.DrawCreatureInfo |
  DrawFlags.DrawThings |
  DrawFlags.DrawNames |
  DrawFlags.DrawBars
