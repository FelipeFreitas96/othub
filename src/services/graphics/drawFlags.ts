/**
 * Draw flags for tile rendering (OTC Otc::DrawFlags).
 * In a separate module to avoid circular deps and ensure DEFAULT_DRAW_FLAGS is always defined.
 */

/**
 * OTC Otc::DrawFlags – match client/const.h
 * CRITICAL FIX: DrawThings must be a COMBINATION of all thing-rendering flags (like OTC),
 * not a single bit. Otherwise drawCreature/drawTop checks like (flags & DrawCreatures)
 * always fail and creatures/effects/onTop items are never rendered.
 */
export enum DrawFlags {
  DrawGround = 1 << 0,
  DrawGroundBorders = 1 << 1,
  DrawOnBottom = 1 << 2,
  DrawOnTop = 1 << 3,
  DrawItems = 1 << 4,
  DrawCreatures = 1 << 5,
  DrawEffects = 1 << 6,
  DrawMissiles = 1 << 7,
  DrawCreatureInfo = 1 << 8,
  DrawStaticTexts = 1 << 9,
  DrawAnimatedTexts = 1 << 10,
  DrawAnimations = 1 << 11,
  DrawBars = 1 << 12,
  DrawNames = 1 << 13,
  DrawLights = 1 << 14,
  DrawManaBar = 1 << 15,
  DrawHarmony = 1 << 16,
  /** OTC: DrawThings is a COMBINATION flag – includes all thing-rendering sub-flags. */
  DrawThings = DrawGround | DrawGroundBorders | DrawOnBottom | DrawOnTop | DrawItems | DrawCreatures | DrawEffects | DrawMissiles | DrawAnimations,
}

/** OTC: Otc::DrawThings – combination flag used in MapView::drawFloor. */
export const DRAW_THINGS_FLAGS = DrawFlags.DrawThings

/** OTC: DrawEverything – all flags combined. */
export const DEFAULT_DRAW_FLAGS =
  DrawFlags.DrawThings |
  DrawFlags.DrawCreatureInfo |
  DrawFlags.DrawStaticTexts |
  DrawFlags.DrawAnimatedTexts |
  DrawFlags.DrawBars |
  DrawFlags.DrawNames |
  DrawFlags.DrawLights |
  DrawFlags.DrawManaBar |
  DrawFlags.DrawHarmony
