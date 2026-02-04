/*
 * Copyright (c) 2010-2026 OTClient <https://github.com/edubart/otclient>
 * Port of src/framework/graphics/painter.h + painter.cpp
 * Single place that talks to Three.js (backend); DrawPool/DrawPoolManager stay backend-agnostic.
 */

import * as THREE from 'three'

/** OTC: CompositionMode */
export const CompositionMode = {
  NORMAL: 0,
  MULTIPLY: 1,
  ADD: 2,
  REPLACE: 3,
  DESTINATION_BLENDING: 4,
  LIGHT: 5,
} as const

/** OTC: BlendEquation */
export const BlendEquation = {
  ADD: 0,
  MAX: 1,
  MIN: 2,
  SUBTRACT: 3,
  REVERSE_SUBTRACT: 4,
} as const

export type Size = { width: number; height: number }
export type Rect = { x?: number; y?: number; width?: number; height?: number }
export type Color = { r?: number; g?: number; b?: number; a?: number }

/** OTC: DEFAULT_MATRIX3 – identity; we use null for "default" in TS */
const DEFAULT_MATRIX3 = null

/** PoolState-like shape passed when drawing (from DrawPool). */
export interface PainterState {
  transformMatrix?: unknown
  opacity?: number
  compositionMode?: number
  blendEquation?: number
  clipRect?: Rect | unknown
  shaderProgram?: unknown
  color?: Color | null | unknown
  texture?: THREE.CanvasTexture | null
  textureId?: number
  textureMatrixId?: number
}

/** Rect payload (tileX, tileY, texture, width, height, z, dx, dy). */
export interface DrawRect {
  tileX?: number
  tileY?: number
  texture?: THREE.CanvasTexture | null
  width?: number
  height?: number
  z?: number
  dx?: number
  dy?: number
  color?: Color
  __compositionMode?: number
  __multiplyColor?: Color
}

/** Draw target: where to add meshes (scene + tile groups). Set before drawing a frame. */
export interface DrawTarget {
  scene: THREE.Scene
  tileGroups: THREE.Group[]
  w: number
  h: number
}

/**
 * Painter – OTC backend; only this class uses Three.js for drawing.
 * Mirrors painter.cpp: state (color, opacity, composition, clip, texture, transform),
 * drawCoords (our rect-based coords), clear, clearRect, drawLine.
 */
export class Painter {
  private m_resolution: Size = { width: 0, height: 0 }
  private m_transformMatrix: unknown = DEFAULT_MATRIX3
  private m_projectionMatrix: unknown = DEFAULT_MATRIX3
  private m_color: Color = { r: 1, g: 1, b: 1, a: 1 }
  private m_opacity = 1
  private m_compositionMode: number = CompositionMode.NORMAL
  private m_blendEquation: number = BlendEquation.ADD
  private m_clipRect: Rect = {}
  private m_alphaWriting = false
  private m_texture: THREE.CanvasTexture | null = null
  private m_textureId = 0
  private m_textureMatrixId = 0
  private m_shaderProgram: unknown = null

  /** Current draw target (scene + tileGroups); set by MapView before drawing. */
  private m_drawTarget: DrawTarget | null = null

  /** Shared geometry for rects (OTC draws quads; we use one plane per rect). */
  private m_plane: THREE.PlaneGeometry

  constructor() {
    this.m_plane = new THREE.PlaneGeometry(1, 1)
  }

  getResolution(): Size {
    return { ...this.m_resolution }
  }

  getTransformMatrix(): unknown {
    return this.m_transformMatrix
  }

  /** OTC: getTransformMatrix(Size) – projection from painter coords to clip space. */
  getTransformMatrixForSize(size: Size): number[] {
    const w = size.width || 1
    const h = size.height || 1
    return [
      2 / w, 0, 0,
      0, -2 / h, 0,
      -1, 1, 1,
    ]
  }

  setResolution(resolution: Size, projectionMatrix?: unknown) {
    if (this.m_resolution.width === resolution.width && this.m_resolution.height === resolution.height)
      return
    this.m_resolution = { ...resolution }
    this.m_projectionMatrix = projectionMatrix ?? this.getTransformMatrixForSize(resolution)
  }

  setColor(color: Color) {
    this.m_color = color ? { ...color } : { r: 1, g: 1, b: 1, a: 1 }
  }

  setOpacity(opacity: number) {
    this.m_opacity = opacity
  }

  setCompositionMode(mode: number) {
    this.m_compositionMode = mode
  }

  setBlendEquation(equation: number) {
    this.m_blendEquation = equation
  }

  setClipRect(clipRect: Rect) {
    this.m_clipRect = clipRect ? { ...clipRect } : {}
  }

  setTexture(texture: THREE.CanvasTexture | null): void
  setTexture(textureId: number, textureMatrixId?: number): void
  setTexture(textureOrId: THREE.CanvasTexture | null | number, textureMatrixId?: number) {
    if (typeof textureOrId === 'number') {
      this.m_textureId = textureOrId
      this.m_textureMatrixId = textureMatrixId ?? 0
      this.m_texture = null
    } else {
      this.m_texture = textureOrId
      this.m_textureId = (textureOrId as THREE.CanvasTexture)?.id ?? 0
      this.m_textureMatrixId = 0
    }
  }

  setTransformMatrix(matrix: unknown) {
    this.m_transformMatrix = matrix
  }

  setShaderProgram(program: unknown) {
    this.m_shaderProgram = program
  }

  setAlphaWriting(enable: boolean) {
    this.m_alphaWriting = enable
  }

  /** Set where to draw (scene + tileGroups). Call before drawing a frame. */
  setDrawTarget(target: DrawTarget | null) {
    this.m_drawTarget = target
  }

  getDrawTarget(): DrawTarget | null {
    return this.m_drawTarget
  }

  /** OTC: refreshState – update GL state. We use Three.js materials; no explicit refresh. */
  refreshState(): void {
    // No-op for Three.js backend
  }

  resetState() {
    this.setColor({ r: 1, g: 1, b: 1, a: 1 })
    this.setOpacity(1)
    this.setCompositionMode(CompositionMode.NORMAL)
    this.setBlendEquation(BlendEquation.ADD)
    this.setClipRect({})
    this.setShaderProgram(null)
    this.setAlphaWriting(false)
    this.m_transformMatrix = DEFAULT_MATRIX3
  }

  resetTexture() {
    this.setTexture(0, 0)
  }

  /** Clear tile groups (remove all children). Call at start of frame before drawing. */
  clearTileGroups(): void {
    const target = this.m_drawTarget
    if (!target?.tileGroups) return
    for (const g of target.tileGroups) {
      while (g.children.length) {
        const c = g.children.pop()
        if (c && typeof (c as THREE.Mesh).material !== 'undefined') {
          const mesh = c as THREE.Mesh
          if (mesh.material) {
            if (Array.isArray(mesh.material)) mesh.material.forEach((m) => m.dispose())
            else (mesh.material as THREE.Material).dispose()
          }
        }
      }
    }
  }

  /**
   * OTC: drawCoords(CoordsBuffer, DrawMode) – we use rect/rect[] as coords.
   * Applies current painter state and draws each rect as a mesh into the draw target.
   */
  drawCoords(coords: DrawRect | DrawRect[] | null, state?: PainterState | null): void {
    if (coords == null) return
    const rects = Array.isArray(coords) ? coords : [coords]
    for (const rect of rects) {
      if (rect && (rect.texture || rect.tileX != null)) this.drawRect(rect, state ?? null)
    }
  }

  /** Draw a single rect (mesh) into the current draw target. */
  drawRect(rect: DrawRect, state?: PainterState | null) {
    const target = this.m_drawTarget
    if (!target) return

    const tileX = rect.tileX ?? 0
    const tileY = rect.tileY ?? 0
    const texture = rect.texture ?? state?.texture ?? this.m_texture
    const width = rect.width ?? 1
    const height = rect.height ?? 1
    const z = rect.z ?? 0
    const dx = rect.dx ?? 0
    const dy = rect.dy ?? 0

    const w = target.w
    const h = target.h
    const tx = Math.max(0, Math.min(w - 1, Math.floor(tileX)))
    const ty = Math.max(0, Math.min(h - 1, Math.floor(tileY)))

    if (!texture || !target.tileGroups.length) return

    const compositionMode = rect.__compositionMode ?? state?.compositionMode ?? this.m_compositionMode
    const useMultiply = Number(compositionMode) === CompositionMode.MULTIPLY
    const multiplyColorSrc = useMultiply
      ? (rect.__multiplyColor ?? rect.color ?? state?.color ?? this.m_color)
      : null
    const multiplyColor =
      multiplyColorSrc &&
      typeof multiplyColorSrc === 'object' &&
      (multiplyColorSrc.r != null || multiplyColorSrc.g != null || multiplyColorSrc.b != null)
        ? (multiplyColorSrc as Color)
        : null

    const mat = new THREE.MeshBasicMaterial({
      map: texture,
      transparent: true,
      depthTest: false,
      depthWrite: false,
      blending: useMultiply ? THREE.CustomBlending : THREE.NormalBlending,
      ...(useMultiply
        ? {
            blendSrc: THREE.DstColorFactor,
            blendDst: THREE.OneMinusSrcAlphaFactor,
            blendSrcAlpha: THREE.OneFactor,
            blendDstAlpha: THREE.OneMinusSrcAlphaFactor,
          }
        : {}),
      color:
        useMultiply && multiplyColor
          ? new THREE.Color(
              (multiplyColor.r ?? 255) / 255,
              (multiplyColor.g ?? 255) / 255,
              (multiplyColor.b ?? 255) / 255
            )
          : new THREE.Color(1, 1, 1),
    })

    const mesh = new THREE.Mesh(this.m_plane, mat)
    mesh.visible = true
    mesh.scale.set(width, height, 1)

    const ox = (width - 1) / 2
    const oy = (height - 1) / 2
    const threeZ = -z
    const offsetX = dx
    const offsetY = dy

    mesh.position.set(
      ox + offsetX + (tileX - tx),
      oy + offsetY - (tileY - ty),
      threeZ
    )
    mesh.renderOrder = 15 - z

    const group = target.tileGroups[ty * w + tx]
    if (group) {
      group.add(mesh)
    }
  }

  /** OTC: clear(color) */
  clear(color: Color) {
    // No-op when using Three.js scene; framebuffer clear would go here.
  }

  /** OTC: clearRect(color, rect) */
  clearRect(_color: Color, _rect: Rect) {
    // No-op when using Three.js scene.
  }

  /** OTC: drawLine(vertex, size, width) */
  drawLine(_vertex: number[], _size: number, _width: number) {
    // Stub; implement with LineSegments if needed.
  }

  /** OTC: isReplaceColorShader – used by DrawPool::setShaderProgram */
  isReplaceColorShader(_shader: unknown): boolean {
    return false
  }

  /** Texture cache for sprites (avoids duplicate CanvasTextures). Used by ThingType. */
  private m_texCache = new Map<number, THREE.CanvasTexture | null>()
  private m_canvasTexCache = new Map<HTMLCanvasElement, THREE.CanvasTexture>()

  texForSprite(spriteId: number, sprites: { getCanvas: (id: number) => HTMLCanvasElement | null } | null): THREE.CanvasTexture | null {
    if (!spriteId || !sprites) return null
    if (this.m_texCache.has(spriteId)) return this.m_texCache.get(spriteId) ?? null
    const canvas = sprites.getCanvas(spriteId)
    if (!canvas) {
      this.m_texCache.set(spriteId, null)
      return null
    }
    const tex = new THREE.CanvasTexture(canvas)
    tex.magFilter = tex.minFilter = THREE.NearestFilter
    tex.colorSpace = THREE.SRGBColorSpace
    this.m_texCache.set(spriteId, tex)
    return tex
  }

  texForCanvas(canvas: HTMLCanvasElement | null): THREE.CanvasTexture | null {
    if (!canvas) return null
    if (this.m_canvasTexCache.has(canvas)) return this.m_canvasTexCache.get(canvas)!
    const tex = new THREE.CanvasTexture(canvas)
    tex.magFilter = tex.minFilter = THREE.NearestFilter
    tex.colorSpace = THREE.SRGBColorSpace
    this.m_canvasTexCache.set(canvas, tex)
    return tex
  }
}

/** OTC: extern std::unique_ptr<Painter> g_painter */
export const g_painter = new Painter()
