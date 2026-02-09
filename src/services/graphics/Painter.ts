/*
 * Copyright (c) 2010-2026 OTClient <https://github.com/edubart/otclient>
 * Port of src/framework/graphics/painter.h + painter.cpp
 * Single place that talks to Three.js (backend); DrawPool/DrawPoolManager stay backend-agnostic.
 */

import * as THREE from 'three'
import {
  CompositionMode,
  BlendEquation,
  DrawMode,
  ColorAlpha,
  type Size,
  type Rect,
  type Color,
} from './declarations'
import type { CoordsBuffer } from './CoordsBuffer'

export { CompositionMode, BlendEquation }
export type { Size, Rect, Color }

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

/** Rect payload. OTC-aligned: use pixelX, pixelY, pixelWidth, pixelHeight for 1 unit = 1 pixel. */
export interface DrawRect {
  tileX?: number
  tileY?: number
  texture?: THREE.CanvasTexture | null
  width?: number
  height?: number
  z?: number
  dx?: number
  dy?: number
  pixelX?: number
  pixelY?: number
  pixelWidth?: number
  pixelHeight?: number
  color?: Color
  __compositionMode?: number
  __multiplyColor?: Color
}

const TILE_PIXELS = 32

/** Draw target: where to add meshes (legacy path; framebuffer path uses setRenderTarget). */
export interface DrawTarget {
  scene: THREE.Scene
  drawContainer: THREE.Group
  w: number
  h: number
  scaleFactor?: number
}

/**
 * Painter – OTC backend; only this class uses Three.js for drawing.
 * Mirrors painter.cpp: state (color, opacity, composition, clip, texture, transform),
 * drawCoords(CoordsBuffer, DrawMode), clear, clearRect, drawLine.
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
  private m_texture: THREE.Texture | THREE.CanvasTexture | null = null
  private m_textureId = 0
  private m_textureMatrixId = 0
  private m_shaderProgram: unknown = null

  private m_drawTarget: DrawTarget | null = null
  private m_renderTarget: THREE.WebGLRenderTarget | null = null
  private m_renderer: THREE.WebGLRenderer | null = null

  private m_plane: THREE.PlaneGeometry
  private m_screenScene: THREE.Scene
  private m_screenCamera: THREE.OrthographicCamera

  constructor() {
    this.m_plane = new THREE.PlaneGeometry(1, 1)
    this.m_screenScene = new THREE.Scene()
    this.m_screenCamera = new THREE.OrthographicCamera(0, 1, 0, -1, 0.1, 100)
    this.m_screenCamera.position.set(0, 0, 10)
  }

  /** Set WebGLRenderer (called by MapView or app). Required for setRenderTarget/clear/drawCoords(CoordsBuffer). */
  setRenderer(renderer: THREE.WebGLRenderer | null): void {
    this.m_renderer = renderer
    if (renderer) {
      // CRITICAL: disable autoClear so each render() call doesn't erase previous draws.
      // We manage clearing manually in FrameBuffer.bind() and DrawPoolManager.draw().
      renderer.autoClear = false
      renderer.autoClearColor = false
      renderer.autoClearDepth = false
      renderer.autoClearStencil = false
    }
  }

  getResolution(): Size {
    return { ...this.m_resolution }
  }

  getTransformMatrix(): unknown {
    return this.m_transformMatrix
  }

  getProjectionMatrix(): unknown {
    return this.m_projectionMatrix
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

  /** OTC: setResolution(resolution, projectionMatrix) – then updateGlViewport(). */
  setResolution(resolution: Size, projectionMatrix?: unknown): void {
    // Always update camera – resolution alone is not sufficient to detect changes
    // (e.g., switching between screen and FB with different projectionMatrices but same or different sizes).
    this.m_projectionMatrix = projectionMatrix === DEFAULT_MATRIX3 || projectionMatrix == null
      ? this.getTransformMatrixForSize(resolution)
      : projectionMatrix
    this.m_resolution = { ...resolution }
    const w = this.m_resolution.width || 1
    const h = this.m_resolution.height || 1
    // OTC projection: Y-down (y=0 at top, y=h at bottom).
    // top=0, bottom=h makes THREE.js map y=0→NDC +1 (top) and y=h→NDC -1 (bottom).
    this.m_screenCamera.left = 0
    this.m_screenCamera.right = w
    this.m_screenCamera.top = 0
    this.m_screenCamera.bottom = h
    this.m_screenCamera.updateProjectionMatrix()
    this.updateGlViewport()
  }

  setColor(color: Color): void {
    this.m_color = color ? { ...color } : { r: 1, g: 1, b: 1, a: 1 }
  }

  setOpacity(opacity: number): void {
    this.m_opacity = opacity
  }

  /** OTC: setCompositionMode – if same return; set and updateGlCompositionMode(). Port: we apply at draw time. */
  setCompositionMode(mode: number): void {
    if (this.m_compositionMode === mode) return
    this.m_compositionMode = mode
  }

  /** OTC: setBlendEquation – if same return; set and updateGlBlendEquation(). Port: we apply at draw time. */
  setBlendEquation(equation: number): void {
    if (this.m_blendEquation === equation) return
    this.m_blendEquation = equation
  }

  /** OTC: setClipRect – if same return; set and updateGlClipRect(). */
  setClipRect(clipRect: Rect): void {
    const r = clipRect ?? {}
    if (
      (this.m_clipRect.x ?? 0) === (r.x ?? 0) &&
      (this.m_clipRect.y ?? 0) === (r.y ?? 0) &&
      (this.m_clipRect.width ?? 0) === (r.width ?? 0) &&
      (this.m_clipRect.height ?? 0) === (r.height ?? 0)
    ) return
    this.m_clipRect = { ...r }
    this.updateGlClipRect()
  }

  /** OTC: setTexture(TexturePtr) or setTexture(id, matrixId) – if same id return; updateGlTexture(). */
  setTexture(texture: THREE.CanvasTexture | THREE.Texture | null): void
  setTexture(textureId: number, textureMatrixId?: number): void
  setTexture(textureOrId: THREE.CanvasTexture | THREE.Texture | null | number, textureMatrixId?: number): void {
    if (typeof textureOrId === 'number') {
      if (this.m_textureId === textureOrId) return
      this.m_textureId = textureOrId
      this.m_textureMatrixId = textureMatrixId ?? 0
      this.m_texture = null
      if (textureOrId === 0) return
      this.updateGlTexture()
    } else {
      this.m_texture = textureOrId
      const id = (textureOrId as THREE.Texture)?.id ?? 0
      if (this.m_textureId === id) return
      this.m_textureId = id
      this.m_textureMatrixId = 0
      this.updateGlTexture()
    }
  }

  setTransformMatrix(matrix: unknown): void {
    this.m_transformMatrix = matrix
  }

  setShaderProgram(program: unknown): void {
    this.m_shaderProgram = program
  }

  /** OTC: setAlphaWriting – if same return; set and updateGlAlphaWriting(). */
  setAlphaWriting(enable: boolean): void {
    if (this.m_alphaWriting === enable) return
    this.m_alphaWriting = enable
    this.updateGlAlphaWriting()
  }

  /** OTC: set render target for subsequent draw/clear (used by FrameBuffer bind/release). Apply immediately to avoid feedback loop when drawing RT texture. */
  setRenderTarget(rt: THREE.WebGLRenderTarget | null): void {
    this.m_renderTarget = rt
    if (this.m_renderer) this.m_renderer.setRenderTarget(rt)
  }

  getRenderTarget(): THREE.WebGLRenderTarget | null {
    return this.m_renderTarget
  }

  getRenderer(): THREE.WebGLRenderer | null {
    return this.m_renderer
  }

  setDrawTarget(target: DrawTarget | null): void {
    this.m_drawTarget = target
  }

  getDrawTarget(): DrawTarget | null {
    return this.m_drawTarget
  }

  /** OTC: refreshState() – updateGlViewport, updateGlCompositionMode, updateGlBlendEquation, updateGlClipRect, updateGlTexture, updateGlAlphaWriting. */
  refreshState(): void {
    if (!this.m_renderer) return
    this.m_renderer.setRenderTarget(this.m_renderTarget)
    this.updateGlViewport()
    this.updateGlClipRect()
    this.updateGlTexture()
    this.updateGlAlphaWriting()
  }

  /** OTC: resetState() – resetColor, resetOpacity, resetCompositionMode, resetBlendEquation, resetClipRect, resetShaderProgram, resetAlphaWriting, resetTransformMatrix. */
  resetState(): void {
    this.resetColor()
    this.resetOpacity()
    this.resetCompositionMode()
    this.resetBlendEquation()
    this.resetClipRect()
    this.resetShaderProgram()
    this.resetAlphaWriting()
    this.resetTransformMatrix()
  }

  resetColor(): void {
    this.setColor({ r: 1, g: 1, b: 1, a: 1 })
  }
  resetOpacity(): void {
    this.setOpacity(1)
  }
  resetBlendEquation(): void {
    this.setBlendEquation(BlendEquation.ADD)
  }
  resetClipRect(): void {
    this.setClipRect({})
  }
  resetShaderProgram(): void {
    this.setShaderProgram(null)
  }
  resetAlphaWriting(): void {
    this.setAlphaWriting(false)
  }
  resetTransformMatrix(): void {
    this.m_transformMatrix = DEFAULT_MATRIX3
  }

  resetTexture(): void {
    this.setTexture(0, 0)
  }

  resetCompositionMode(): void {
    this.setCompositionMode(CompositionMode.NORMAL)
  }

  /** OTC: updateGlViewport() – glViewport(0, 0, width, height). */
  private updateGlViewport(): void {
    if (!this.m_renderer) return
    if (this.m_renderTarget) {
      // RenderTarget buffers are not pixel-ratio-scaled.
      // Three.js multiplies viewport by DPR internally, so compensate here.
      const dpr = this.m_renderer.getPixelRatio() || 1
      const w = this.m_renderTarget.width
      const h = this.m_renderTarget.height
      this.m_renderer.setViewport(0, 0, w / dpr, h / dpr)
    } else {
      // Screen: resolution is logical; setViewport scales to physical via pixelRatio.
      const w = Math.max(0, this.m_resolution.width ?? 0)
      const h = Math.max(0, this.m_resolution.height ?? 0)
      this.m_renderer.setViewport(0, 0, w, h)
    }
  }

  /** Force viewport to match current resolution (e.g. after setRenderTarget(null) when Three.js may have changed it). */
  ensureViewport(): void {
    this.updateGlViewport()
  }

  /** OTC: updateGlClipRect() – scissor test; y flip: resolution.height - rect.bottom - 1. */
  private updateGlClipRect(): void {
    if (!this.m_renderer) return
    const r = this.m_clipRect
    const rw = r.width ?? 0
    const rh = r.height ?? 0
    const dpr = this.m_renderer.getPixelRatio() || 1
    const scale = this.m_renderTarget ? (1 / dpr) : 1
    const valid = rw > 0 && rh > 0
    if (valid) {
      const x = r.x ?? 0
      const y = r.y ?? 0
      const resH = this.m_resolution.height ?? 0
      this.m_renderer.setScissor(x * scale, (resH - y - rh) * scale, rw * scale, rh * scale)
      this.m_renderer.setScissorTest(true)
    } else {
      const w = this.m_resolution.width ?? 0
      const h = this.m_resolution.height ?? 0
      this.m_renderer.setScissor(0, 0, w * scale, h * scale)
      this.m_renderer.setScissorTest(false)
    }
  }

  /** OTC: updateGlTexture() – bind texture if id != 0. Port: no global bind; applied at draw. */
  private updateGlTexture(): void {
    if (!this.m_renderer) return
    // Three.js: texture is set per material at drawCoordsBuffer; no global glBindTexture
  }

  /** OTC: updateGlAlphaWriting() – glColorMask(1,1,1, m_alphaWriting). Port: no direct GL; we use material. */
  private updateGlAlphaWriting(): void {
    if (!this.m_renderer) return
    // Three.js: alpha write is per render; we don't expose color mask globally
  }

  clearTileGroups(): void {
    const target = this.m_drawTarget
    const container = target?.drawContainer
    if (!container) return
    while (container.children.length) {
      const c = container.children.pop()
      if (c && typeof (c as THREE.Mesh).material !== 'undefined') {
        const mesh = c as THREE.Mesh
        if (mesh.material) {
          if (Array.isArray(mesh.material)) mesh.material.forEach((m) => m.dispose())
          else (mesh.material as THREE.Material).dispose()
        }
      }
    }
  }

  // Reusable draw objects – created once, updated per draw.
  // Key fixes vs previous attempt:
  // - material.needsUpdate ONLY when map define toggles (null↔texture), NOT every draw
  // - Buffer attributes grow on demand; data written in-place (no Float32Array views)
  // - Mesh stays permanently in scene; frustumCulled=false (no bounding sphere needed)
  private m_drawGeo: THREE.BufferGeometry | null = null
  private m_drawMat: THREE.MeshBasicMaterial | null = null
  private m_drawMesh: THREE.Mesh | null = null
  private m_drawMaxVerts = 0
  private m_lastMapWasNull = true

  /**
   * OTC: drawCoords(CoordsBuffer, DrawMode) – draw vertex/texcoord buffer with current state.
   * Renders to m_renderTarget if set, else to default framebuffer (screen).
   *
   * Reusable per-draw: geometry/material/mesh created once, attributes updated in place.
   * autoClear is OFF; we draw additively to the current render target.
   * Camera uses Y-down (top=0, bottom=h) matching OTC projection.
   */
  drawCoordsBuffer(coords: CoordsBuffer, _drawMode: DrawMode): void {
    const vertexCount = coords.getVertexCount()
    if (vertexCount === 0) return
    if (!this.m_renderer) return

    const hasTexCoords = coords.getTextureCoordCount() > 0
    if (hasTexCoords && !this.m_texture && this.m_textureId === 0) return

    const positions = coords.getVertexArray()
    const texCoords = hasTexCoords ? coords.getTextureCoordArray() : null

    // Lazy-create reusable geometry/material/mesh (once)
    if (!this.m_drawGeo) {
      this.m_drawGeo = new THREE.BufferGeometry()
      this.m_drawMat = new THREE.MeshBasicMaterial({
        transparent: true,
        depthTest: false,
        depthWrite: false,
        side: THREE.DoubleSide,
      })
      this.m_drawMesh = new THREE.Mesh(this.m_drawGeo, this.m_drawMat)
      this.m_drawMesh.frustumCulled = false
      // NOTE: mesh is NOT permanently added to scene; add/remove per draw to avoid
      // conflicts with drawLine/debugDrawTestRect which also use m_screenScene.
    }

    // Grow buffers if needed (double to amortize reallocations)
    if (this.m_drawMaxVerts < vertexCount) {
      this.m_drawMaxVerts = Math.max(vertexCount, (this.m_drawMaxVerts || 6) * 2)
      const posAttr = new THREE.BufferAttribute(new Float32Array(this.m_drawMaxVerts * 3), 3)
      posAttr.setUsage(THREE.DynamicDrawUsage)
      this.m_drawGeo.setAttribute('position', posAttr)
      const uvAttr = new THREE.BufferAttribute(new Float32Array(this.m_drawMaxVerts * 2), 2)
      uvAttr.setUsage(THREE.DynamicDrawUsage)
      this.m_drawGeo.setAttribute('uv', uvAttr)
    }

    // Write position data in place (x, y → x, y, 0)
    const posAttr = this.m_drawGeo.getAttribute('position') as THREE.BufferAttribute
    const posArr = posAttr.array as Float32Array
    for (let i = 0; i < vertexCount; i++) {
      posArr[i * 3] = positions[i * 2]
      posArr[i * 3 + 1] = positions[i * 2 + 1]
      posArr[i * 3 + 2] = 0
    }
    posAttr.needsUpdate = true
    this.m_drawGeo.setDrawRange(0, vertexCount)

    // Write UV data in place (normalize: u = texX/texW, v = 1 - texY/texH)
    const uvAttr = this.m_drawGeo.getAttribute('uv') as THREE.BufferAttribute
    const uvArr = uvAttr.array as Float32Array
    if (hasTexCoords && texCoords && texCoords.length >= vertexCount * 2) {
      const tex = this.m_texture as THREE.Texture | null
      const img = tex?.image as { width?: number; height?: number } | undefined
      const tw = img?.width ?? 1
      const th = img?.height ?? 1
      for (let i = 0; i < vertexCount; i++) {
        uvArr[i * 2] = texCoords[i * 2] / tw
        uvArr[i * 2 + 1] = 1 - texCoords[i * 2 + 1] / th
      }
      uvAttr.needsUpdate = true
    }

    // Update material – only set needsUpdate when map define changes (null↔texture)
    const mat = this.m_drawMat!
    const newMap = (hasTexCoords && texCoords) ? (this.m_texture as THREE.Texture | null) : null
    const mapIsNull = newMap == null
    if (mapIsNull !== this.m_lastMapWasNull) {
      mat.needsUpdate = true
      this.m_lastMapWasNull = mapIsNull
    }
    mat.map = newMap
    mat.color.setRGB(
      this.normalizeColorChannel(this.m_color.r, 1),
      this.normalizeColorChannel(this.m_color.g, 1),
      this.normalizeColorChannel(this.m_color.b, 1)
    )
    const colorAlpha = this.normalizeColorChannel(this.m_color.a, 1)
    mat.opacity = Math.max(0, Math.min(1, this.m_opacity * colorAlpha))

    this.applyCompositionMode(mat, this.m_compositionMode)

    // Render – add mesh to scene, draw, remove.
    // (add/remove is cheap; the expensive part is geometry/material creation which we skip.)
    this.m_screenScene.add(this.m_drawMesh!)
    this.refreshState()
    this.m_renderer.render(this.m_screenScene, this.m_screenCamera)
    this.m_screenScene.remove(this.m_drawMesh!)
  }

  /**
   * drawCoords(rects) – legacy path: draw rect list as meshes into drawContainer.
   * Also supports drawCoords(CoordsBuffer, DrawMode) via overload in callers (DrawPool calls drawCoordsBuffer).
   */
  drawCoords(coords: DrawRect | DrawRect[] | null, state?: PainterState | null): void {
    if (coords == null) return
    const rects = Array.isArray(coords) ? coords : [coords]
    for (const rect of rects) {
      if (rect && (rect.texture || rect.tileX != null)) this.drawRect(rect, state ?? null)
    }
  }

  drawRect(rect: DrawRect, state?: PainterState | null): void {
    const target = this.m_drawTarget
    if (!target?.drawContainer) return

    const texture = rect.texture ?? state?.texture ?? this.m_texture
    if (!texture) return

    const z = rect.z ?? 0
    const w = target.w
    const h = target.h
    const usePixels = rect.pixelWidth != null && rect.pixelWidth > 0

    let meshX: number, meshY: number, meshW: number, meshH: number

    if (usePixels) {
      const scale = target.scaleFactor ?? 1
      const pixelX = rect.pixelX ?? 0
      const pixelY = rect.pixelY ?? 0
      const pixelW = rect.pixelWidth ?? TILE_PIXELS
      const pixelH = rect.pixelHeight ?? TILE_PIXELS
      meshW = pixelW / scale
      meshH = pixelH / scale
      meshX = pixelX / scale
      meshY = -pixelY / scale
    } else {
      const tileX = rect.tileX ?? 0
      const tileY = rect.tileY ?? 0
      const width = rect.width ?? 1
      const height = rect.height ?? 1
      const dx = rect.dx ?? 0
      const dy = rect.dy ?? 0
      meshW = width * TILE_PIXELS
      meshH = height * TILE_PIXELS
      meshX = tileX * TILE_PIXELS + dx * TILE_PIXELS
      meshY = -(tileY * TILE_PIXELS + dy * TILE_PIXELS)
    }

    const compositionMode = rect.__compositionMode ?? state?.compositionMode ?? this.m_compositionMode
    const useMultiply = Number(compositionMode) === CompositionMode.MULTIPLY
    const multiplyColorSrc = useMultiply
      ? (rect.__multiplyColor ?? rect.color ?? state?.color ?? this.m_color)
      : null
    const multiplyColor =
      multiplyColorSrc &&
        typeof multiplyColorSrc === 'object' &&
        ((multiplyColorSrc as Color).r != null || (multiplyColorSrc as Color).g != null)
        ? (multiplyColorSrc as Color)
        : null

    const mat = new THREE.MeshBasicMaterial({
      map: texture as THREE.Texture,
      transparent: true,
      depthTest: false,
      depthWrite: false,
      side: THREE.DoubleSide,
      color:
        useMultiply && multiplyColor
          ? new THREE.Color(
            this.normalizeColorChannel(multiplyColor.r, 1),
            this.normalizeColorChannel(multiplyColor.g, 1),
            this.normalizeColorChannel(multiplyColor.b, 1)
          )
          : new THREE.Color(1, 1, 1),
    })
    this.applyCompositionMode(mat, Number(compositionMode))

    const mesh = new THREE.Mesh(this.m_plane, mat)
    mesh.visible = true
    mesh.scale.set(meshW, meshH, 1)
    mesh.position.set(meshX, meshY, -z)
    mesh.renderOrder = 15 - z
    target.drawContainer.add(mesh)
  }

  /** OTC: clear(color) – glClearColor(rF(), gF(), bF(), aF()); glClear(GL_COLOR_BUFFER_BIT). */
  clear(color: Color): void {
    if (!this.m_renderer) return
    this.m_renderer.setRenderTarget(this.m_renderTarget)
    const r = this.normalizeColorChannel(color.r, 0)
    const g = this.normalizeColorChannel(color.g, 0)
    const b = this.normalizeColorChannel(color.b, 0)
    const a = this.normalizeColorChannel(color.a, 0)
    this.m_renderer.setClearColor(new THREE.Color(r, g, b), a)
    this.m_renderer.clear(true, true, false)
  }

  /** OTC: clearRect(color, rect) – save clipRect, setClipRect(rect), glClear, restore clipRect. */
  clearRect(color: Color, rect: Rect): void {
    if (!this.m_renderer) return
    const rw = rect.width ?? 0
    const rh = rect.height ?? 0
    if (rw <= 0 || rh <= 0) return
    const oldClipRect = { ...this.m_clipRect }
    this.setClipRect(rect)
    this.m_renderer.setRenderTarget(this.m_renderTarget)
    const r = this.normalizeColorChannel(color.r, 0)
    const g = this.normalizeColorChannel(color.g, 0)
    const b = this.normalizeColorChannel(color.b, 0)
    const a = this.normalizeColorChannel(color.a, 0)
    this.m_renderer.setClearColor(new THREE.Color(r, g, b), a)
    this.m_renderer.clear(true, true, false)
    this.setClipRect(oldClipRect)
  }

  /** OTC: drawLine(vertex, size, width) – glLineWidth; glDrawArrays(GL_LINE_STRIP, 0, size). */
  drawLine(vertex: number[], size: number, width: number): void {
    if (!this.m_renderer || !vertex.length || size <= 0) return
    const positions = new Float32Array(size * 2)
    for (let i = 0; i < size * 2 && i < vertex.length; i++) {
      positions[i] = Number.isFinite(vertex[i]) ? vertex[i] : 0
    }
    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 2))
    const mat = new THREE.LineBasicMaterial({
      color: new THREE.Color(
        this.normalizeColorChannel(this.m_color.r, 1),
        this.normalizeColorChannel(this.m_color.g, 1),
        this.normalizeColorChannel(this.m_color.b, 1)
      ),
      linewidth: Math.max(1, width),
    })
    const line = new THREE.Line(geometry, mat)
    this.m_screenScene.add(line)
    this.refreshState()
    this.m_renderer.render(this.m_screenScene, this.m_screenCamera)
    this.m_screenScene.remove(line)
    geometry.dispose()
    mat.dispose()
  }

  isReplaceColorShader(_shader: unknown): boolean {
    return false
  }

  /**
   * Diagnostic: draw a simple colored rectangle to verify the rendering pipeline works.
   * Call this after clear() to see if the canvas can show anything at all.
   */
  debugDrawTestRect(x: number, y: number, w: number, h: number, r: number, g: number, b: number): void {
    if (!this.m_renderer) return
    const pos = new Float32Array([
      x, y, 0,
      x + w, y, 0,
      x, y + h, 0,
      x, y + h, 0,
      x + w, y, 0,
      x + w, h + y, 0,
    ])
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3))
    const mat = new THREE.MeshBasicMaterial({
      color: new THREE.Color(r, g, b),
      transparent: false,
      depthTest: false,
      depthWrite: false,
      side: THREE.DoubleSide,
    })
    const mesh = new THREE.Mesh(geo, mat)
    mesh.frustumCulled = false
    while (this.m_screenScene.children.length > 0) this.m_screenScene.remove(this.m_screenScene.children[0])
    this.m_screenScene.add(mesh)
    this.refreshState()
    this.m_renderer.render(this.m_screenScene, this.m_screenCamera)
    this.m_screenScene.remove(mesh)
    geo.dispose()
    mat.dispose()
  }

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

  private applyCompositionMode(mat: THREE.MeshBasicMaterial, mode: number): void {
    switch (mode) {
      case CompositionMode.REPLACE:
        // OTC: glBlendFunc(GL_ONE, GL_ZERO)
        mat.blending = THREE.NoBlending
        break
      case CompositionMode.MULTIPLY:
        // OTC: glBlendFunc(GL_DST_COLOR, GL_ONE_MINUS_SRC_ALPHA)
        mat.blending = THREE.CustomBlending
        mat.blendSrc = THREE.DstColorFactor
        mat.blendDst = THREE.OneMinusSrcAlphaFactor
        mat.blendSrcAlpha = THREE.DstColorFactor
        mat.blendDstAlpha = THREE.OneMinusSrcAlphaFactor
        break
      case CompositionMode.ADD:
        // OTC: glBlendFunc(GL_ONE_MINUS_SRC_COLOR, GL_ONE_MINUS_SRC_COLOR)
        mat.blending = THREE.CustomBlending
        mat.blendSrc = THREE.OneMinusSrcColorFactor
        mat.blendDst = THREE.OneMinusSrcColorFactor
        mat.blendSrcAlpha = THREE.OneMinusSrcColorFactor
        mat.blendDstAlpha = THREE.OneMinusSrcColorFactor
        break
      case CompositionMode.DESTINATION_BLENDING:
        // OTC: glBlendFunc(GL_ONE_MINUS_DST_ALPHA, GL_DST_ALPHA)
        mat.blending = THREE.CustomBlending
        mat.blendSrc = THREE.OneMinusDstAlphaFactor
        mat.blendDst = THREE.DstAlphaFactor
        mat.blendSrcAlpha = THREE.OneMinusDstAlphaFactor
        mat.blendDstAlpha = THREE.DstAlphaFactor
        break
      case CompositionMode.LIGHT:
        // OTC: glBlendFunc(GL_ZERO, GL_SRC_COLOR)
        mat.blending = THREE.CustomBlending
        mat.blendSrc = THREE.ZeroFactor
        mat.blendDst = THREE.SrcColorFactor
        mat.blendSrcAlpha = THREE.ZeroFactor
        mat.blendDstAlpha = THREE.SrcColorFactor
        break
      default:
        // OTC NORMAL: glBlendFuncSeparate(GL_SRC_ALPHA, GL_ONE_MINUS_SRC_ALPHA, GL_ONE, GL_ONE)
        mat.blending = THREE.CustomBlending
        mat.blendSrc = THREE.SrcAlphaFactor
        mat.blendDst = THREE.OneMinusSrcAlphaFactor
        mat.blendSrcAlpha = THREE.OneFactor
        mat.blendDstAlpha = THREE.OneFactor
        break
    }
  }

  private normalizeColorChannel(value: number | undefined, fallback: number): number {
    const n = Number(value)
    if (!Number.isFinite(n)) return fallback
    if (n <= 1) return Math.max(0, Math.min(1, n))
    return Math.max(0, Math.min(1, n / 255))
  }
}

export const g_painter = new Painter()
