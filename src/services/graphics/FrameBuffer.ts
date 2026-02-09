/*
 * Copyright (c) 2010-2026 OTClient <https://github.com/edubart/otclient>
 * Port of src/framework/graphics/framebuffer.cpp + framebuffer.h
 */

import * as THREE from 'three'
import { g_painter } from './Painter'
import type { Size, Rect, Color } from './declarations'
import {
  DrawMode,
  ColorAlpha,
  CompositionMode,
  rectValid,
  rectFromSize,
  sizeValid,
} from './declarations'
import { CoordsBuffer } from './CoordsBuffer'

let boundFbo: THREE.WebGLRenderTarget | null = null

/**
 * FrameBuffer – OTC framebuffer port using THREE.WebGLRenderTarget.
 * bind() / release() set Painter's render target; draw() blits the RT texture to screen.
 */
export class FrameBuffer {
  m_colorClear: Color = { ...ColorAlpha }
  m_oldSize: Size = { width: 0, height: 0 }
  m_oldTextureMatrix: unknown = null
  m_textureMatrix: unknown = null
  m_smooth = true
  m_useAlphaWriting = true
  m_disableBlend = false
  m_isScene = false
  m_autoClear = true
  m_compositeMode: number = CompositionMode.NORMAL

  private m_renderTarget: THREE.WebGLRenderTarget | null = null
  private m_prevBoundFbo: THREE.WebGLRenderTarget | null = null
  private m_coordsBuffer = new CoordsBuffer(4)
  private m_screenCoordsBuffer = new CoordsBuffer(4)

  resize(size: Size): boolean {
    if (!sizeValid(size)) return false
    const w = size.width
    const h = size.height
    if (this.m_renderTarget && this.m_renderTarget.width === w && this.m_renderTarget.height === h)
      return false

    this.m_renderTarget = new THREE.WebGLRenderTarget(w, h, {
      minFilter: this.m_smooth ? THREE.LinearFilter : THREE.NearestFilter,
      magFilter: this.m_smooth ? THREE.LinearFilter : THREE.NearestFilter,
      format: THREE.RGBAFormat,
      type: THREE.UnsignedByteType,
      stencilBuffer: false,
      depthBuffer: false,
    })
    // RenderTarget textures must NOT flip; data is already in VRAM with correct orientation.
    // drawCoordsBuffer handles the Y-flip via (1 - texY/h) UV normalization.
    this.m_renderTarget.texture.flipY = false
    this.m_textureMatrix = g_painter.getTransformMatrixForSize(size)
    this.m_screenCoordsBuffer.clear()
    this.m_screenCoordsBuffer.addRect(rectFromSize(size))
    return true
  }

  bind(): void {
    if (!this.m_renderTarget) return
    this.m_prevBoundFbo = boundFbo
    boundFbo = this.m_renderTarget

    if (this.m_isScene) {
      g_painter.resetState()
    }

    this.m_oldSize = g_painter.getResolution()
    this.m_oldTextureMatrix = g_painter.getProjectionMatrix()

    g_painter.setRenderTarget(this.m_renderTarget)
    g_painter.setResolution(this.getSize(), this.m_textureMatrix)
    g_painter.setAlphaWriting(this.m_useAlphaWriting)
    
    if (this.m_autoClear) {
      if (
        this.m_colorClear.a !== undefined && this.m_colorClear.a > 0 &&
        (this.m_colorClear.r !== 0 || this.m_colorClear.g !== 0 || this.m_colorClear.b !== 0)
      ) {
        g_painter.resetTexture()
        g_painter.setColor(this.m_colorClear)
        g_painter.drawCoordsBuffer(this.m_screenCoordsBuffer, DrawMode.TRIANGLES)
      } else {
        g_painter.clear(this.m_colorClear)
      }
    }
  }

  release(): void {
    g_painter.setRenderTarget(this.m_prevBoundFbo)
    boundFbo = this.m_prevBoundFbo
    g_painter.setResolution(this.m_oldSize, this.m_oldTextureMatrix)
  }

  draw(): void {
    if (!this.m_renderTarget) return
    g_painter.setRenderTarget(null)
    g_painter.ensureViewport()
    // OTC: if m_disableBlend → glBlendFunc(GL_ONE, GL_ZERO) → no alpha blending (direct copy).
    // MAP pool sets m_disableBlend=true so FB content is copied directly to screen.
    g_painter.setCompositionMode(
      this.m_disableBlend ? CompositionMode.REPLACE : this.m_compositeMode
    )
    g_painter.setTexture(this.m_renderTarget.texture)
    g_painter.drawCoordsBuffer(this.m_coordsBuffer, DrawMode.TRIANGLES)
    g_painter.resetCompositionMode()
  }

  prepare(dest: Rect, src: Rect, colorClear: Color = ColorAlpha, flipDirection = 0): void {
    const size = this.getSize()
    const _dest = rectValid(dest) ? dest : rectFromSize(size)
    const _src = rectValid(src) ? src : rectFromSize(size)

    this.m_colorClear = { ...colorClear }
    this.m_coordsBuffer.clear()
    if (flipDirection === 1) {
      this.m_coordsBuffer.addHorizontallyFlippedQuad(_dest, _src)
    } else if (flipDirection === 2) {
      this.m_coordsBuffer.addVerticallyFlippedQuad(_dest, _src)
    } else {
      this.m_coordsBuffer.addQuad(_dest, _src)
    }
  }

  getSize(): Size {
    if (!this.m_renderTarget) return { width: 0, height: 0 }
    return { width: this.m_renderTarget.width, height: this.m_renderTarget.height }
  }

  isValid(): boolean {
    return this.m_renderTarget != null
  }

  canDraw(): boolean {
    return this.m_renderTarget != null && this.m_coordsBuffer.getVertexCount() > 0
  }

  getTexture(): THREE.Texture | null {
    return this.m_renderTarget?.texture ?? null
  }

  setSmooth(enabled: boolean): void {
    this.m_smooth = enabled
    this.m_renderTarget = null
  }

  setAutoClear(v: boolean): void {
    this.m_autoClear = v
  }

  setAlphaWriting(v: boolean): void {
    this.m_useAlphaWriting = v
  }

  setAutoResetState(v: boolean): void {
    this.m_isScene = v
  }

  setCompositionMode(mode: number): void {
    this.m_compositeMode = mode
  }

  disableBlend(): void {
    this.m_disableBlend = true
  }

  reset(): void {
    this.m_renderTarget?.dispose()
    this.m_renderTarget = null
  }
}
