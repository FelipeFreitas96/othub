/*
 * TextureAtlas (lazy) – empacota canvases em uma textura sob demanda.
 * LRU eviction: quando cheio, remove entradas menos usadas e reutiliza slots.
 */

import * as THREE from 'three'

const DEFAULT_SIZE = 2048

export interface AtlasEntry {
  texture: THREE.CanvasTexture
  src: { x: number; y: number; width: number; height: number }
}

interface AtlasSlot {
  x: number
  y: number
  w: number
  h: number
}

interface CachedEntry {
  slot: AtlasSlot
  lastUsed: number
}

/**
 * TextureAtlas lazy – adiciona sob demanda, evicta LRU quando cheio.
 */
export class TextureAtlas {
  private m_canvas: HTMLCanvasElement
  private m_ctx: CanvasRenderingContext2D
  private m_texture: THREE.CanvasTexture
  private m_canvasToEntry = new Map<HTMLCanvasElement, CachedEntry>()
  private m_currentX = 0
  private m_currentY = 0
  private m_rowHeight = 0
  private m_size: number
  private m_dirty = false
  private m_freeSlots: AtlasSlot[] = []
  private m_evictOrder: HTMLCanvasElement[] = []

  constructor(size = DEFAULT_SIZE) {
    this.m_size = Math.min(size, 4096)
    this.m_canvas = document.createElement('canvas')
    this.m_canvas.width = this.m_size
    this.m_canvas.height = this.m_size
    const ctx = this.m_canvas.getContext('2d')
    if (!ctx) throw new Error('TextureAtlas: failed to get 2d context')
    this.m_ctx = ctx
    this.m_texture = new THREE.CanvasTexture(this.m_canvas)
    this.m_texture.magFilter = this.m_texture.minFilter = THREE.NearestFilter
    this.m_texture.colorSpace = THREE.SRGBColorSpace
    this.m_texture.needsUpdate = true
  }

  private now(): number {
    return typeof performance !== 'undefined' ? performance.now() : Date.now()
  }

  private findFreeSlot(w: number, h: number): AtlasSlot | null {
    for (let i = 0; i < this.m_freeSlots.length; i++) {
      const s = this.m_freeSlots[i]
      if (s.w >= w && s.h >= h) {
        this.m_freeSlots.splice(i, 1)
        return s
      }
    }
    return null
  }

  private evictLRU(neededW: number, neededH: number): boolean {
    while (this.m_evictOrder.length > 0) {
      const canvas = this.m_evictOrder.shift()!
      const entry = this.m_canvasToEntry.get(canvas)
      if (!entry) continue
      this.m_canvasToEntry.delete(canvas)
      this.m_freeSlots.push(entry.slot)
      if (this.m_freeSlots.some((s) => s.w >= neededW && s.h >= neededH)) return true
    }
    return false
  }

  private allocSlot(w: number, h: number): AtlasSlot | null {
    const free = this.findFreeSlot(w, h)
    if (free) return free

    if (this.m_currentX + w > this.m_size) {
      this.m_currentX = 0
      this.m_currentY += this.m_rowHeight
      this.m_rowHeight = 0
    }
    if (this.m_currentY + h <= this.m_size) {
      const slot: AtlasSlot = {
        x: this.m_currentX,
        y: this.m_currentY,
        w,
        h,
      }
      this.m_currentX += w
      this.m_rowHeight = Math.max(this.m_rowHeight, h)
      return slot
    }

    if (this.evictLRU(w, h)) return this.findFreeSlot(w, h)
    return null
  }

  /**
   * Retorna a entrada do atlas. Se não estiver, adiciona. Evicta LRU quando cheio.
   */
  getOrAdd(canvas: HTMLCanvasElement): AtlasEntry | null {
    if (!canvas || canvas.width <= 0 || canvas.height <= 0) return null

    const cached = this.m_canvasToEntry.get(canvas)
    if (cached) {
      cached.lastUsed = this.now()
      const idx = this.m_evictOrder.indexOf(canvas)
      if (idx >= 0) this.m_evictOrder.splice(idx, 1)
      this.m_evictOrder.push(canvas)
      return {
        texture: this.m_texture,
        src: {
          x: cached.slot.x,
          y: cached.slot.y,
          width: cached.slot.w,
          height: cached.slot.h,
        },
      }
    }

    const w = canvas.width
    const h = canvas.height
    const slot = this.allocSlot(w, h)
    if (!slot) return null

    this.m_ctx.drawImage(canvas, slot.x, slot.y, w, h)
    const entry: CachedEntry = { slot: { ...slot }, lastUsed: this.now() }
    this.m_canvasToEntry.set(canvas, entry)
    this.m_evictOrder.push(canvas)
    this.m_dirty = true

    return {
      texture: this.m_texture,
      src: { x: slot.x, y: slot.y, width: slot.w, height: slot.h },
    }
  }

  flush(): void {
    if (this.m_dirty) {
      this.m_texture.needsUpdate = true
      this.m_dirty = false
    }
  }

  getStats(): string {
    return `atlas ${this.m_canvasToEntry.size} sprites`
  }

  dispose(): void {
    this.m_texture.dispose()
    this.m_canvasToEntry.clear()
    this.m_evictOrder.length = 0
    this.m_freeSlots.length = 0
  }
}
