/**
 * StaticText - port of OTClient src/client/statictext.h + statictext.cpp
 * Speech text shown above creatures/positions in the game world.
 */

import { MessageModeEnum } from './Const'
import { Position } from './Position'
import type { Point, Rect } from './types'
import { g_map } from './ClientMap'
import { g_dispatcher, type ScheduledEventHandle } from '../framework/EventDispatcher'
import { g_drawPool } from '../graphics/DrawPoolManager'

const STATIC_DURATION_PER_CHARACTER = 60
const MIN_STATIC_TEXT_DURATION = 3000
const MAX_MESSAGES = 10
const WRAP_WIDTH = 275
const LINE_HEIGHT = 12
const FONT = 'bold 14px sans-serif'

const MESSAGE_COLOR1 = { r: 239, g: 239, b: 0, a: 255 }
const MESSAGE_COLOR2 = { r: 254, g: 101, b: 0, a: 255 }
const MESSAGE_COLOR3 = { r: 95, g: 247, b: 247, a: 255 }

interface StaticMessage {
  text: string
  expiresAt: number
}

const TEXT_MEASURE_CANVAS = typeof document !== 'undefined' ? document.createElement('canvas') : null
const TEXT_MEASURE_CTX = TEXT_MEASURE_CANVAS?.getContext('2d') ?? null

function measureTextWidth(text: string): number {
  if (!text) return 0
  if (!TEXT_MEASURE_CTX) return text.length * 6
  TEXT_MEASURE_CTX.font = FONT
  return TEXT_MEASURE_CTX.measureText(text).width
}

function clampRectToParent(rect: Rect, parentRect: Rect): Rect {
  return {
    x: Math.max(parentRect.x, Math.min(parentRect.x + parentRect.width - rect.width, rect.x)),
    y: Math.max(parentRect.y, Math.min(parentRect.y + parentRect.height - rect.height, rect.y)),
    width: rect.width,
    height: rect.height,
  }
}

export class StaticText {
  private m_messages: StaticMessage[] = []
  private m_name = ''
  private m_mode: number = MessageModeEnum.MessageNone
  private m_color = { r: 255, g: 255, b: 255, a: 255 }
  private m_wrappedText = ''
  private m_lines: string[] = []
  private m_updateEvent: ScheduledEventHandle | null = null
  private m_position: Position = new Position(0, 0, 0)

  drawText(dest: Point, parentRect: Rect): void {
    if (!this.hasText()) return

    const scale = 1
    const textSize = this.getTextSize()
    let rect: Rect = {
      x: dest.x - textSize.width / 2 + (20 / scale),
      y: dest.y - textSize.height + (5 / scale),
      width: textSize.width,
      height: textSize.height,
    }

    if (scale === 1) rect = clampRectToParent(rect, parentRect)
    if (rect.width <= 0 || rect.height <= 0) return

    g_drawPool.beginCreatureInfo({ x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 })
    for (let i = 0; i < this.m_lines.length; i++) {
      const lineRect = {
        x: rect.x,
        y: rect.y + i * LINE_HEIGHT,
        width: rect.width,
        height: LINE_HEIGHT,
      }
      g_drawPool.addCreatureInfoText(this.m_lines[i], lineRect, {
        r: this.clampColorByte(this.m_color.r),
        g: this.clampColorByte(this.m_color.g),
        b: this.clampColorByte(this.m_color.b),
      })
    }
    g_drawPool.endCreatureInfo()
  }

  getName(): string {
    return this.m_name
  }

  getText(): string {
    return this.m_wrappedText
  }

  getTextSize(): { width: number; height: number } {
    if (!this.m_lines.length) return { width: 0, height: 0 }
    let width = 0
    for (const line of this.m_lines) {
      width = Math.max(width, Math.ceil(measureTextWidth(line)))
    }
    return {
      width,
      height: this.m_lines.length * LINE_HEIGHT,
    }
  }

  hasText(): boolean {
    return this.m_lines.some((line) => line.length > 0)
  }

  getMessageMode(): number {
    return this.m_mode
  }

  getFirstMessage(): string {
    return this.m_messages.length > 0 ? this.m_messages[0].text : ''
  }

  isYell(): boolean {
    return this.m_mode === MessageModeEnum.MessageYell ||
      this.m_mode === MessageModeEnum.MessageMonsterYell ||
      this.m_mode === MessageModeEnum.MessageBarkLoud
  }

  setText(text: string): void {
    this.m_wrappedText = text ?? ''
    this.m_lines = this.wrapText(this.m_wrappedText, WRAP_WIDTH)
  }

  setFont(_fontName: string): void {
    // Font manager is not ported here; draw uses a fixed UI font.
  }

  addMessage(name: string, mode: number, text: string): boolean {
    if (this.m_messages.length === 0) {
      this.m_name = name ?? ''
      this.m_mode = mode ?? MessageModeEnum.MessageNone
    } else if (this.m_name !== (name ?? '') || this.m_mode !== (mode ?? MessageModeEnum.MessageNone)) {
      return false
    } else if (this.m_messages.length > MAX_MESSAGES) {
      this.m_messages.shift()
      this.m_updateEvent?.cancel()
      this.m_updateEvent = null
    }

    let delay = Math.max(STATIC_DURATION_PER_CHARACTER * (text?.length ?? 0), MIN_STATIC_TEXT_DURATION)
    if (this.isYell()) delay *= 2
    if ((globalThis as any).g_app?.mustOptimize?.()) delay = Math.floor(delay / 2)

    this.m_messages.push({
      text: text ?? '',
      expiresAt: Date.now() + delay,
    })

    this.compose()
    if (!this.m_updateEvent) this.scheduleUpdate()
    return true
  }

  setColor(color: { r?: number; g?: number; b?: number; a?: number }): void {
    this.m_color = {
      r: this.clampColorByte(color?.r, 255),
      g: this.clampColorByte(color?.g, 255),
      b: this.clampColorByte(color?.b, 255),
      a: this.clampColorByte(color?.a, 255),
    }
  }

  getColor(): { r: number; g: number; b: number; a: number } {
    return { ...this.m_color }
  }

  getPosition(): Position {
    return this.m_position.clone()
  }

  setPosition(position: Position): void {
    this.m_position = position instanceof Position ? position.clone() : Position.from(position)
  }

  asStaticText(): StaticText {
    return this
  }

  private update(): void {
    if (this.m_messages.length > 0) this.m_messages.shift()
    if (this.m_messages.length === 0) {
      g_map.removeStaticText(this)
      return
    }

    this.compose()
    this.scheduleUpdate()
  }

  private scheduleUpdate(): void {
    if (this.m_messages.length === 0) return
    const delay = Math.max(0, this.m_messages[0].expiresAt - Date.now())
    this.m_updateEvent = g_dispatcher.scheduleEvent(() => {
      this.m_updateEvent = null
      this.update()
    }, delay)
  }

  private compose(): void {
    let text = ''
    const mode = this.m_mode

    if (mode === MessageModeEnum.MessageSay) {
      text += `${this.m_name} says:\n`
      this.m_color = { ...MESSAGE_COLOR1 }
    } else if (mode === MessageModeEnum.MessageWhisper) {
      text += `${this.m_name} whispers:\n`
      this.m_color = { ...MESSAGE_COLOR1 }
    } else if (mode === MessageModeEnum.MessageYell) {
      text += `${this.m_name} yells:\n`
      this.m_color = { ...MESSAGE_COLOR1 }
    } else if (mode === MessageModeEnum.MessageMonsterSay ||
      mode === MessageModeEnum.MessageMonsterYell ||
      mode === MessageModeEnum.MessageSpell ||
      mode === MessageModeEnum.MessageBarkLow ||
      mode === MessageModeEnum.MessageBarkLoud) {
      this.m_color = { ...MESSAGE_COLOR2 }
    } else if (mode === MessageModeEnum.MessageNpcFrom || mode === MessageModeEnum.MessageNpcFromStartBlock) {
      text += `${this.m_name} says:\n`
      this.m_color = { ...MESSAGE_COLOR3 }
    }

    for (let i = 0; i < this.m_messages.length; i++) {
      text += this.m_messages[i].text
      if (i < this.m_messages.length - 1) text += '\n'
    }

    this.setText(text)
  }

  private wrapText(text: string, maxWidth: number): string[] {
    if (!text) return ['']
    const out: string[] = []
    const sourceLines = text.replace(/\r\n/g, '\n').split('\n')

    for (const source of sourceLines) {
      if (!source) {
        out.push('')
        continue
      }

      const words = source.split(/\s+/).filter((w) => w.length > 0)
      if (words.length === 0) {
        out.push('')
        continue
      }

      let current = ''
      for (const word of words) {
        const next = current ? `${current} ${word}` : word
        if (!current || measureTextWidth(next) <= maxWidth) {
          current = next
        } else {
          out.push(current)
          current = word
        }
      }
      out.push(current)
    }

    return out.length ? out : ['']
  }

  private clampColorByte(value: number | undefined, fallback = 255): number {
    const n = Number(value)
    if (!Number.isFinite(n)) return fallback
    if (n <= 1) return Math.max(0, Math.min(255, Math.round(n * 255)))
    return Math.max(0, Math.min(255, Math.round(n)))
  }
}

