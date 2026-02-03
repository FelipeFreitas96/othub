/**
 * AnimatedText – 1:1 port of OTClient src/client/animatedtext.h + animatedtext.cpp
 * Copyright (c) 2010-2026 OTClient <https://github.com/edubart/otclient>; ported to JS.
 * Not a Thing; has position, timer, cached text, drawText(dest, visibleRect).
 */

import { Position } from './Position'
import type { Point, Rect } from './types'
import { g_map } from './ClientMap'
import { g_dispatcher } from '../framework/EventDispatcher'

/** OTC: Color::from8bit(int) – 8bit color index to RGB. */
function colorFrom8bit(c: number): { r: number; g: number; b: number; a?: number } {
  const palette: [number, number, number][] = [
    [0, 0, 0], [255, 255, 255], [255, 255, 0], [255, 128, 0], [255, 0, 0], [255, 0, 255],
    [128, 0, 255], [0, 0, 255], [0, 255, 255], [0, 255, 0], [0, 255, 128], [0, 255, 255],
  ]
  const idx = Math.max(0, Math.min(c, 255))
  const entry = palette[idx % palette.length] ?? [255, 255, 255]
  return { r: entry[0], g: entry[1], b: entry[2] }
}

/** OTC: CachedText – text, font, align, getTextSize. Stub: we use canvas measureText. */
function getTextSize(text: string, font: string = '10px sans-serif'): { width: number; height: number } {
  if (typeof document === 'undefined' || !text) return { width: 0, height: 10 }
  const ctx = document.createElement('canvas').getContext('2d')
  if (!ctx) return { width: text.length * 6, height: 10 }
  ctx.font = font
  const m = ctx.measureText(text)
  return { width: m.width, height: 12 }
}

/** OTC: Rect::contains(Point, Size) */
function rectContains(rect: Rect, p: Point, size: { width: number; height: number }): boolean {
  return p.x >= rect.x && p.y >= rect.y &&
    p.x + size.width <= rect.x + rect.width &&
    p.y + size.height <= rect.y + rect.height
}

export class AnimatedText {
  /** OTC: Color m_color */
  private m_color = { r: 255, g: 255, b: 255, a: 255 }
  /** OTC: Timer m_animationTimer */
  private m_animationStart = Date.now()
  /** OTC: CachedText – stub: plain text + getTextSize */
  private m_text = ''
  private m_font = '10px sans-serif'
  private m_align: 'left' | 'center' | 'right' = 'left'
  /** OTC: Point m_offset */
  private m_offset: Point = { x: 0, y: 0 }
  /** OTC: Position m_position */
  private m_position: Position = new Position(0, 0, 0)

  constructor(text?: string, color8bit?: number) {
    if (text != null) this.setText(text)
    if (color8bit != null) this.setColor(color8bit)
  }

  /** OTC: void AnimatedText::drawText(const Point& dest, const Rect& visibleRect) */
  drawText(dest: Point, visibleRect: Rect): void {
    const animatedTextDuration = 1000
    const tf = animatedTextDuration
    const tftf = tf * tf
    const textSize = this.getCachedTextSize()
    const t = this.getTimer().ticksElapsed()
    const scale = 1
    let p: Point = { x: dest.x, y: dest.y }
    p.x += (24 / scale - textSize.width / 2)
    p.x -= (4 * scale * t / tf) + (8 * scale * t * t / tftf)
    p.y += (8 / scale) + ((-48 * scale * t) / tf)
    p.x += this.m_offset.x
    p.y += this.m_offset.y
    if (!rectContains(visibleRect, p, textSize)) return
    p.x *= scale
    p.y *= scale
    const rect: Rect = { x: p.x, y: p.y, width: textSize.width * scale, height: textSize.height * scale }
    const t0 = tf / 1.2
    let color = { ...this.m_color }
    if (t > t0) {
      color.a = Math.max(0, 1 - (t - t0) / (tf - t0))
    }
    // OTC: m_cachedText.draw(rect, color) – stub: draw via pipeline or 2d context if needed later
    ;(this as any).__lastDrawRect = rect
    ;(this as any).__lastDrawColor = color
  }

  /** OTC: void AnimatedText::onAppear() */
  onAppear(): void {
    this.m_animationStart = Date.now()
    let textDuration = 1000
    if ((globalThis as any).g_app?.mustOptimize?.()) textDuration /= 2
    const self = this
    g_dispatcher.scheduleEvent(() => { g_map.removeAnimatedText?.(self) }, textDuration)
  }

  setColor(color8bit: number): void {
    this.m_color = { ...colorFrom8bit(color8bit), a: 255 }
  }
  setText(text: string): void {
    this.m_text = text ?? ''
  }
  setOffset(offset: Point): void {
    this.m_offset = { x: offset.x, y: offset.y }
  }

  getColor(): { r: number; g: number; b: number } {
    return { ...this.m_color }
  }
  getCachedTextSize(): { width: number; height: number } {
    return getTextSize(this.m_text, this.m_font)
  }
  /** OTC: const CachedText& getCachedText() */
  getCachedText(): { getText: () => string; getFont: () => string; getTextSize: () => { width: number; height: number } } {
    return {
      getText: () => this.m_text,
      getFont: () => this.m_font,
      getTextSize: () => this.getCachedTextSize(),
    }
  }
  getOffset(): Point {
    return { ...this.m_offset }
  }
  getTimer(): { ticksElapsed: () => number } {
    return {
      ticksElapsed: () => Date.now() - this.m_animationStart,
    }
  }
  getText(): string {
    return this.m_text
  }

  /** OTC: bool AnimatedText::merge(const AnimatedTextPtr& other) */
  merge(other: AnimatedText): boolean {
    const oc = other.getColor()
    if (oc.r !== this.m_color.r || oc.g !== this.m_color.g || oc.b !== this.m_color.b) return false
    if (other.getCachedText().getFont() !== this.m_font) return false
    if (this.getTimer().ticksElapsed() > 1000 / 2.5) return false
    const a = parseInt(this.m_text, 10)
    const b = parseInt(other.getText(), 10)
    if (Number.isNaN(a) || Number.isNaN(b)) return false
    this.setText(String(a + b))
    return true
  }

  getPosition(): Position {
    return this.m_position.clone()
  }
  setPosition(position: Position): void {
    this.m_position = position instanceof Position ? position.clone() : Position.from(position)
  }

  asAnimatedText(): AnimatedText {
    return this
  }
}
