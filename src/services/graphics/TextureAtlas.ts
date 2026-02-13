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
  private m_dirtyRegions: Array<{ x: number; y: number; w: number; h: number; source?: HTMLCanvasElement }> = []
  private m_initialUploadDone = false
  private m_freeSlots: AtlasSlot[] = []
  private m_evictOrder: HTMLCanvasElement[] = []
  private m_evictionCount = 0

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
      this.m_evictionCount++
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
      // Não reordenar evictOrder em cache hit – indexOf+splice é O(n) e com milhares de
      // hits/frame causava spikes de 500–800ms. Evictamos por ordem de inserção (FIFO).
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

    // Não faz drawImage aqui – evita travadinha no hot path. Flush usa texSubImage2D direto do
    // r.source quando possível. Se precisar de full upload, flush desenha as regiões antes.
    const entry: CachedEntry = { slot: { ...slot }, lastUsed: this.now() }
    this.m_canvasToEntry.set(canvas, entry)
    this.m_evictOrder.push(canvas)
    this.m_dirty = true
    this.m_dirtyRegions.push({ x: slot.x, y: slot.y, w, h, source: canvas })

    return {
      texture: this.m_texture,
      src: { x: slot.x, y: slot.y, width: slot.w, height: slot.h },
    }
  }

  /**
   * Flush: upload ao GPU. Se renderer fornecido e há regiões sujas, usa texSubImage2D
   * (parcial, ~100x mais rápido que full upload). Senão faz full upload via needsUpdate.
   */
  flush(renderer?: THREE.WebGLRenderer | null): void {
    if (!this.m_dirty) return
    const usePartial =
      renderer &&
      this.m_dirtyRegions.length > 0 &&
      this.m_dirtyRegions.length < 50 &&
      (this.m_initialUploadDone || this.m_canvasToEntry.size > 0)
    const gl = renderer?.getContext()
    const webglTexture = (this.m_texture as any).__webglTexture as WebGLTexture | undefined

    if (usePartial && webglTexture && gl) {
      gl.bindTexture(gl.TEXTURE_2D, webglTexture)
      for (const r of this.m_dirtyRegions) {
        try {
          if (r.source && r.source.width === r.w && r.source.height === r.h) {
            gl.texSubImage2D(gl.TEXTURE_2D, 0, r.x, r.y, gl.RGBA, gl.UNSIGNED_BYTE, r.source)
          } else if (r.source) {
            this.m_ctx.drawImage(r.source, r.x, r.y, r.w, r.h)
            const id = this.m_ctx.getImageData(r.x, r.y, r.w, r.h)
            gl.texSubImage2D(gl.TEXTURE_2D, 0, r.x, r.y, r.w, r.h, gl.RGBA, gl.UNSIGNED_BYTE, id.data)
          }
        } catch (_) {}
      }
      gl.bindTexture(gl.TEXTURE_2D, null)
      this.m_initialUploadDone = true
    } else {
      for (const r of this.m_dirtyRegions) {
        if (r.source) this.m_ctx.drawImage(r.source, r.x, r.y, r.w, r.h)
      }
      this.m_texture.needsUpdate = true
      this.m_initialUploadDone = true
    }
    this.m_dirty = false
    this.m_dirtyRegions.length = 0
  }

  getStats(): string {
    return `${this.m_canvasToEntry.size} sprites, ${this.m_evictionCount} evict`
  }

  getEvictionCount(): number {
    return this.m_evictionCount
  }

  dispose(): void {
    this.m_texture.dispose()
    this.m_canvasToEntry.clear()
    this.m_evictOrder.length = 0
    this.m_freeSlots.length = 0
  }
}
