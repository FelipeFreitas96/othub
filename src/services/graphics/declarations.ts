/*
 * Copyright (c) 2010-2026 OTClient <https://github.com/edubart/otclient>
 * Port of src/framework/graphics/declarations.h – types and constants for graphics.
 */

/** OTC: CompositionMode */
export const CompositionMode = {
  NORMAL: 0,
  MULTIPLY: 1,
  ADD: 2,
  REPLACE: 3,
  DESTINATION_BLENDING: 4,
  LIGHT: 5,
} as const

/** OTC: DrawMode (GL enum) */
export enum DrawMode {
  NONE = 0,
  TRIANGLES = 4,
  TRIANGLE_STRIP = 5,
}

/** OTC: BlendEquation */
export const BlendEquation = {
  ADD: 0,
  MAX: 1,
  MIN: 2,
  SUBTRACT: 3,
  REVERSE_SUBTRACT: 4,
} as const

export type Size = { width: number; height: number }
export type Point = { x: number; y: number }
export type Rect = { x?: number; y?: number; width?: number; height?: number }
export type RectF = { x: number; y: number; width: number; height: number }
export type Color = { r?: number; g?: number; b?: number; a?: number }

/** OTC Color::alpha – transparent */
export const ColorAlpha: Color = { r: 0, g: 0, b: 0, a: 0 }
/** OTC Color::white */
export const ColorWhite: Color = { r: 1, g: 1, b: 1, a: 1 }

/** Safe number for vertex/rect math – avoids NaN from undefined or invalid values. */
function safeNum(v: unknown): number {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

/** Rect helpers – OTC semantics: left=x, top=y, right=x+width, bottom=y+height (exclusive end). */
export function rectLeft(r: Rect): number {
  return safeNum(r.x)
}
export function rectTop(r: Rect): number {
  return safeNum(r.y)
}
export function rectRight(r: Rect): number {
  return safeNum(r.x) + safeNum(r.width)
}
export function rectBottom(r: Rect): number {
  return safeNum(r.y) + safeNum(r.height)
}

export function rectValid(r: Rect): boolean {
  return (r.width ?? 0) > 0 && (r.height ?? 0) > 0
}

export function sizeValid(s: Size): boolean {
  return (s.width ?? 0) > 0 && (s.height ?? 0) > 0
}

/** Build Rect from origin and size (OTC Rect(0, 0, size)). */
export function rectFromSize(size: Size): Rect {
  return { x: 0, y: 0, width: size.width, height: size.height }
}
