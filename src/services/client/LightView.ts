/**
 * LightView – port of OTClient src/client/lightview.cpp + lightview.h
 * Copyright (c) 2010-2026 OTClient <https://github.com/edubart/otclient>
 *
 * Computes a per-tile light map from global light + light sources (things with Light attr).
 * Drawn with MULTIPLY over the scene so dark areas stay dark and lights brighten.
 */

import type { Light } from './types'
import { g_drawPool } from '../graphics/DrawPoolManager'
import { CompositionMode } from '../graphics/declarations'

const TILE_PIXELS = 32

/** Tibia 8bit color (0–215) to RGB 0–255. OTC Color::from8bit. */
function from8bit(color: number, brightness = 1): { r: number, g: number, b: number } {
  if (color <= 0 || color >= 216) return { r: 255, g: 255, b: 255 }
  const r = Math.min(255, Math.floor(((Math.floor(color / 36) % 6) * 51) * brightness))
  const g = Math.min(255, Math.floor(((Math.floor(color / 6) % 6) * 51) * brightness))
  const b = Math.min(255, Math.floor(((color % 6) * 51) * brightness))
  return { r, g, b }
}

interface TileLight {
  x: number
  y: number
  intensity: number
  color: number
  brightness: number
}

export class LightView {
  private mapW = 0
  private mapH = 0
  private tileSize = TILE_PIXELS
  private globalColor: { r: number, g: number, b: number } = { r: 255, g: 255, b: 255 }
  private isDark = false
  private enabled = true
  private lights: TileLight[] = []
  private tileShade: number[] = []
  private canvas: HTMLCanvasElement | null = null
  private ctx: CanvasRenderingContext2D | null = null
  private imageData: ImageData | null = null

  resize(mapWidth: number, mapHeight: number, tileSizePx = TILE_PIXELS) {
    if (this.mapW === mapWidth && this.mapH === mapHeight && this.tileSize === tileSizePx) return
    this.mapW = mapWidth
    this.mapH = mapHeight
    this.tileSize = tileSizePx
    this.tileShade = Array.from({ length: mapWidth * mapHeight }, () => 0)
    this.lights = []
    this.canvas = document.createElement('canvas')
    this.canvas.width = mapWidth
    this.canvas.height = mapHeight
    this.ctx = this.canvas.getContext('2d')
    this.imageData = this.ctx!.createImageData(mapWidth, mapHeight)
  }

  setGlobalLight(light: Light) {
    const intensity = Math.max(0, Math.min(255, light.intensity ?? 255))
    this.isDark = intensity < 250
    const brightness = intensity <= 0 ? 1 : intensity >= 250 ? 1 : intensity / 255
    const color = light.color ?? 215
    this.globalColor = from8bit(color, brightness)
  }

  addLightSource(px: number, py: number, light: Light, brightness = 1) {
    if (!this.isDark || light.intensity === 0) return
    const last = this.lights[this.lights.length - 1]
    if (last && last.x === px && last.y === py && last.color === light.color) {
      last.intensity = Math.max(last.intensity, light.intensity)
      return
    }
    this.lights.push({
      x: px,
      y: py,
      intensity: light.intensity,
      color: light.color,
      brightness,
    })
  }

  resetShade(tileX: number, tileY: number) {
    const index = tileY * this.mapW + tileX
    if (index >= 0 && index < this.tileShade.length) this.tileShade[index] = this.lights.length
  }

  clear() {
    this.lights = []
    this.tileShade.fill(0)
  }

  /** OTC updatePixels(): for each tile, start with global light, add contributions from lights in range. */
  updatePixels() {
    if (!this.ctx || !this.imageData || this.mapW <= 0 || this.mapH <= 0) return
    const invTileSize = 1 / this.tileSize
    const lightSize = this.lights.length
    const data = this.imageData.data

    for (let y = 0; y < this.mapH; y++) {
      for (let x = 0; x < this.mapW; x++) {
        const centerX = x * this.tileSize + this.tileSize / 2
        const centerY = y * this.tileSize + this.tileSize / 2
        const index = y * this.mapW + x

        let r = this.globalColor.r
        let g = this.globalColor.g
        let b = this.globalColor.b

        for (let i = this.tileShade[index] ?? 0; i < lightSize; i++) {
          const light = this.lights[i]
          const dx = centerX - light.x
          const dy = centerY - light.y
          const distanceSq = dx * dx + dy * dy
          const radius = light.intensity * this.tileSize
          const lightRadiusSq = radius * radius
          if (distanceSq > lightRadiusSq) continue

          const distanceNorm = Math.sqrt(distanceSq) * invTileSize
          let intensity = (-distanceNorm + light.intensity) * 0.2
          if (intensity < 0.01) continue
          intensity = Math.min(intensity * light.brightness, 1)

          const lc = from8bit(light.color, intensity)
          r = Math.max(r, lc.r)
          g = Math.max(g, lc.g)
          b = Math.max(b, lc.b)
        }

        const i4 = index * 4
        data[i4] = r
        data[i4 + 1] = g
        data[i4 + 2] = b
        data[i4 + 3] = 255
      }
    }

    this.ctx.putImageData(this.imageData, 0, 0)
  }

  getCanvas(): HTMLCanvasElement | null {
    return this.canvas
  }

  setEnabled(enable: boolean) {
    this.enabled = !!enable
  }

  draw(destRect: { x: number, y: number, width: number, height: number }, srcRect?: { x?: number, y?: number, width?: number, height?: number }) {
    if (!this.isEnabled()) return
    const canvas = this.getCanvas()
    if (!canvas) return

    const texture = g_drawPool.texForCanvas(canvas) as { needsUpdate?: boolean } | null
    if (!texture) return
    texture.needsUpdate = true

    g_drawPool.setCompositionMode(CompositionMode.LIGHT, true)
    g_drawPool.addTexturedRect(
      {
        x: destRect.x ?? 0,
        y: destRect.y ?? 0,
        width: Math.max(1, destRect.width ?? 1),
        height: Math.max(1, destRect.height ?? 1),
      },
      texture,
      {
        x: srcRect?.x ?? 0,
        y: srcRect?.y ?? 0,
        width: Math.max(1, srcRect?.width ?? canvas.width),
        height: Math.max(1, srcRect?.height ?? canvas.height),
      },
      { r: 255, g: 255, b: 255, a: 255 }
    )
  }

  isEnabled(): boolean {
    return this.enabled && this.isDark
  }
}
