import { FileStream } from './fileStream'

export class SpriteManager {
  signature: number
  spriteCount: number
  offsets: Uint32Array | null
  buf: Uint8Array | null
  cache: Map<number, HTMLCanvasElement>

  constructor() {
    this.signature = 0
    this.spriteCount = 0
    this.offsets = null
    this.buf = null
    this.cache = new Map() // spriteId -> HTMLCanvasElement
  }

  loadSpr(arrayBuffer: ArrayBuffer) {
    const fin = new FileStream(arrayBuffer)
    this.signature = fin.u32()
    this.spriteCount = fin.u16()
    this.offsets = new Uint32Array(this.spriteCount + 1)
    for (let i = 1; i <= this.spriteCount; i++) this.offsets[i] = fin.u32()
    this.buf = new Uint8Array(arrayBuffer)
    this.cache.clear()
  }

  getCanvas(spriteId: number): HTMLCanvasElement | null {
    if (!this.buf || !this.offsets || spriteId <= 0 || spriteId > this.spriteCount) return null
    if (this.cache.has(spriteId)) return this.cache.get(spriteId)!
    const off = this.offsets[spriteId]
    if (!off) return null
    const view = this.buf
    let p = off
    // OTC regular SPR: [3 bytes RGB key][u16 pixelDataSize][RLE payload...]
    p += 3
    if (p + 2 > view.length) return null
    const size = view[p] | (view[p + 1] << 8); p += 2
    const end = p + size
    if (end > view.length) return null
    const out = new Uint8ClampedArray(32 * 32 * 4)
    let idx = 0
    while (p + 4 <= end && idx < 32 * 32) {
      const transparent = view[p] | (view[p + 1] << 8); p += 2
      idx += transparent
      const colored = view[p] | (view[p + 1] << 8); p += 2
      for (let i = 0; i < colored && p + 3 <= end && idx < 32 * 32; i++) {
        const o = idx * 4
        out[o] = view[p]; out[o + 1] = view[p + 1]; out[o + 2] = view[p + 2]; out[o + 3] = 255
        p += 3; idx++
      }
    }
    const canvas = document.createElement('canvas')
    canvas.width = 32; canvas.height = 32
    const ctx = canvas.getContext('2d')
    if (!ctx) return null
    ctx.putImageData(new ImageData(out, 32, 32), 0, 0)
    this.cache.set(spriteId, canvas)
    return canvas
  }
}
