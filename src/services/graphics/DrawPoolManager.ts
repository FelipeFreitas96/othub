/*
 * Copyright (c) 2010-2026 OTClient <https://github.com/edubart/otclient>
 * Port 1:1 from src/framework/graphics/drawpoolmanager.cpp + drawpoolmanager.h
 */

import { g_painter } from './Painter'
import type { Size } from './Painter'
import { g_graphics } from './Graphics'
import { DrawPool, DrawPoolType, DrawOrder, type DrawObject } from './DrawPool'
import { DrawMode } from './declarations'

let CURRENT_POOL: number = DrawPoolType.LAST

function resetSelectedPool(): void {
  CURRENT_POOL = DrawPoolType.LAST
}

export class DrawPoolManager {
  m_pools: (DrawPool | null)[] = []
  m_size: Size = { width: 0, height: 0 }
  m_transformMatrix: unknown = null
  m_spriteSize: number = 32

  private m_initialized = false

  /** OTC: init(uint16_t spriteSize). Idempotent – safe to call multiple times. */
  init(spriteSize?: number): void {
    if (spriteSize != null && spriteSize !== 0) this.m_spriteSize = spriteSize
    if (this.m_initialized) return
    this.m_initialized = true
    // atlas creation skipped (no TextureAtlas in port); create pools only
    for (let i = 0; i < DrawPoolType.LAST; i++) {
      this.m_pools[i] = DrawPool.create(i as DrawPoolType)
    }
  }

  /** OTC: terminate() */
  terminate(): void {
    for (let i = 0; i < DrawPoolType.LAST; i++) {
      this.m_pools[i] = null
    }
  }

  /** OTC: DrawPool* get(const DrawPoolType type) const */
  get(type: DrawPoolType): DrawPool | null {
    return this.m_pools[type] ?? null
  }

  /** OTC: getCurrentType() */
  getCurrentType(): DrawPoolType {
    return CURRENT_POOL as DrawPoolType
  }

  /** OTC: isValid() */
  isValid(): boolean {
    return CURRENT_POOL < DrawPoolType.LAST
  }

  /** Internal: current pool (used only by DrawPoolManager). OTC: getCurrentPool() – do not use in game code; use g_drawPool.xxx() instead. */
  private getCurrentPool(): DrawPool | null {
    return this.m_pools[CURRENT_POOL] ?? null
  }

  /** OTC: select(DrawPoolType type) */
  select(type: DrawPoolType): void {
    CURRENT_POOL = type
  }

  /** OTC: isPreDrawing() */
  isPreDrawing(): boolean {
    return CURRENT_POOL !== DrawPoolType.LAST
  }

  private m_drawFrameCount = 0

  /** OTC: draw() – iterate all pool types and draw each. Viewport size from Graphics (g_graphics.getViewport()), else window. */
  draw(): void {
    let viewportSize = g_graphics.getViewport()
    const usedFallback = viewportSize.width <= 0 || viewportSize.height <= 0
    if (usedFallback) {
      viewportSize = (typeof window !== 'undefined' && window.document?.body)
        ? { width: window.innerWidth, height: window.innerHeight }
        : this.m_size
    }
    
    if (viewportSize.width <= 0 || viewportSize.height <= 0) return
    this.m_size = { ...viewportSize }
    this.m_transformMatrix = g_painter.getTransformMatrixForSize(this.m_size)
    g_painter.setResolution(this.m_size, this.m_transformMatrix)

    // Clear screen before drawing all pools (autoClear is OFF; we manage it here).
    g_painter.setRenderTarget(null)
    g_painter.clear({ r: 0, g: 0, b: 0, a: 1 })

    this.m_drawFrameCount++

    // Draw all pools
    for (let i = 0; i < DrawPoolType.LAST; i++) {
      this.drawPool(i as DrawPoolType)
    }
  }

  /** OTC: drawObject(DrawPool* pool, const DrawPool::DrawObject& obj) */
  drawObject(pool: DrawPool, obj: DrawObject): void {
    if (obj.action) {
      obj.action()
    } else if (obj.coords) {
      if (obj.state) DrawPool.executeState(obj.state, pool)
      g_painter.drawCoordsBuffer(obj.coords, DrawMode.TRIANGLES)
    }
  }

  /** OTC: addTexturedCoordsBuffer */
  addTexturedCoordsBuffer(texture: unknown, coords: unknown, color?: unknown): void {
    this.getCurrentPool()?.add(color as any, texture, { type: 0, dest: {}, src: {} }, coords as any)
  }

  /** OTC: addTexturedRect(dest, texture, src?, color?) or project: addTexturedRect(rect) */
  addTexturedRect(destOrRect: { x?: number; y?: number; width?: number; height?: number; texture?: unknown; tileX?: number; tileY?: number; pixelX?: number; pixelY?: number; pixelWidth?: number; pixelHeight?: number; color?: unknown } | unknown, texture?: unknown, src?: { x?: number; y?: number; width?: number; height?: number }, color?: unknown): void {
    if (texture !== undefined && arguments.length >= 2) {
      const d = (destOrRect ?? {}) as { x?: number; y?: number; width?: number; height?: number }
      const s = (src ?? {}) as { x?: number; y?: number; width?: number; height?: number }
      if ((d.width ?? 0) <= 0 || (d.height ?? 0) <= 0 || (s.width ?? 0) <= 0 || (s.height ?? 0) <= 0) {
        this.getCurrentPool()?.resetOnlyOnceParameters()
        return
      }
      this.getCurrentPool()?.add(color as any, texture, { type: 0, dest: d as any, src: s as any }, null)
    } else {
      this.getCurrentPool()?.addTexturedRect(destOrRect as any)
    }
  }

  /** OTC: addUpsideDownTexturedRect */
  addUpsideDownTexturedRect(dest: any, texture: unknown, src: any, color?: unknown): void {
    if (!dest?.width || !dest?.height || !src?.width || !src?.height) {
      this.getCurrentPool()?.resetOnlyOnceParameters()
      return
    }
    this.getCurrentPool()?.add(color as any, texture, { type: 4, dest, src })
  }

  /** OTC: addTexturedRepeatedRect */
  addTexturedRepeatedRect(dest: any, texture: unknown, src: any, color?: unknown): void {
    if (!dest?.width || !dest?.height || !src?.width || !src?.height) {
      this.getCurrentPool()?.resetOnlyOnceParameters()
      return
    }
    this.getCurrentPool()?.add(color as any, texture, { type: 2, dest, src })
  }

  /** OTC: addFilledRect */
  addFilledRect(dest: { x?: number; y?: number; width?: number; height?: number }, color?: unknown): void {
    if (!dest?.width || !dest?.height) {
      this.getCurrentPool()?.resetOnlyOnceParameters()
      return
    }
    this.getCurrentPool()?.add(color as any, null, { type: 0, dest: dest as any, src: {} })
  }

  /** OTC: addFilledTriangle */
  addFilledTriangle(a: { x: number; y: number }, b: { x: number; y: number }, c: { x: number; y: number }, color?: unknown): void {
    if ((a.x === b.x && a.y === b.y) || (a.x === c.x && a.y === c.y) || (b.x === c.x && b.y === c.y)) {
      this.getCurrentPool()?.resetOnlyOnceParameters()
      return
    }
    this.getCurrentPool()?.add(color as any, null, { type: 1, dest: {}, src: {}, a, b, c })
  }

  /** OTC: addBoundingRect */
  addBoundingRect(dest: any, color?: unknown, innerLineWidth = 1): void {
    if (!dest?.width || !dest?.height || innerLineWidth === 0) {
      this.getCurrentPool()?.resetOnlyOnceParameters()
      return
    }
    this.getCurrentPool()?.add(color as any, null, { type: 3, dest, src: {}, intValue: innerLineWidth })
  }

  /** OTC: preDraw(type, f, beforeRelease?, dest, src, colorClear) */
  preDraw(
    type: DrawPoolType,
    f: () => void,
    beforeRelease?: () => void,
    dest?: unknown,
    src?: unknown,
    colorClear?: unknown
  ): void {
    this.select(type)
    const pool = this.getCurrentPool()
    if (!pool) {
      resetSelectedPool()
      return
    }
    pool.resetState()
    if (f) f()
    if (beforeRelease) beforeRelease()
    if (pool.hasFrameBuffer()) {
      this.addAction(() => {
        pool.getFrameBuffer()!.prepare(
          (dest ?? {}) as any,
          (src ?? {}) as any,
          (colorClear ?? {}) as any
        )
      })
    }
    // OTC: after filling the pool we must merge and set shouldRepaint; release() can early-return when
    // hash not modified (drawFloor doesn't put hashes), so force repaint so we don't skip drawing.
    pool.repaint()
    pool.release()
    resetSelectedPool()
  }

  /** OTC: drawObjects(DrawPool* pool) */
  drawObjects(pool: DrawPool): void {
    const hasFramebuffer = pool.hasFrameBuffer()
    const shouldRepaint = pool.shouldRepaint()
    const earlyReturn = !shouldRepaint && hasFramebuffer
    if (earlyReturn) return

    // DIAGNOSTIC: on first 3 frames for MAP, BYPASS framebuffer – draw tiles directly to screen.
    // This tells us if the tile drawing code works independently of the FB/blit pipeline.
    const bypassFB = hasFramebuffer && pool.getType() === DrawPoolType.MAP && this.m_drawFrameCount <= 3
    if (bypassFB) {
      // Set camera to FB dimensions so tile positions (0-576, 0-448) fit the frustum
      const fb = pool.getFrameBuffer()!
      const fbSize = fb.getSize()
      g_painter.setResolution(fbSize)
      console.log(`[DIAG #${this.m_drawFrameCount}] BYPASS FB: drawing tiles directly to screen with resolution ${fbSize.width}x${fbSize.height}`)
    } else if (hasFramebuffer) {
      pool.getFrameBuffer()!.bind()
    }

    if (shouldRepaint) {
      const tmp = pool.m_objectsDraw[0]
      pool.m_objectsDraw[0] = pool.m_objectsDraw[1]
      pool.m_objectsDraw[1] = tmp
      pool.m_shouldRepaint = false
    }

    const list = pool.m_objectsDraw[1]

    // DIAGNOSTIC: count and log object types on first frames
    if (this.m_drawFrameCount <= 3 && pool.getType() === DrawPoolType.MAP) {
      let coordsCount = 0, actionCount = 0, emptyCount = 0
      for (const obj of list) {
        if (obj.action) actionCount++
        else if (obj.coords && obj.coords.getVertexCount() > 0) coordsCount++
        else emptyCount++
      }
      console.log(`[DIAG #${this.m_drawFrameCount}] MAP objects: ${list.length} total, ${coordsCount} coords(with verts), ${actionCount} actions, ${emptyCount} empty`)
    }

    for (const obj of list) {
      // Skip the prepare() action when bypassing FB (it's only needed for the blit)
      if (bypassFB && obj.action) continue
      this.drawObject(pool, obj)
    }

    // DIAGNOSTIC: after tile draws, read back pixels to verify content
    if (this.m_drawFrameCount <= 3 && pool.getType() === DrawPoolType.MAP) {
      const renderer = g_painter.getRenderer()
      if (renderer) {
        if (!bypassFB) {
          // Read from FB
          const rt = g_painter.getRenderTarget()
          if (rt) {
            const buf = new Uint8Array(4)
            const w = rt.width, h = rt.height
            let foundColor = false
            for (const [sx, sy] of [[w/2, h/2], [100, 100], [150, 150], [200, 200], [250, 250]]) {
              renderer.readRenderTargetPixels(rt, Math.floor(sx), Math.floor(sy), 1, 1, buf)
              if (buf[0] > 0 || buf[1] > 0 || buf[2] > 0) {
                console.log(`[DIAG #${this.m_drawFrameCount}] FB pixel at (${Math.floor(sx)},${Math.floor(sy)}): rgba(${buf[0]},${buf[1]},${buf[2]},${buf[3]}) ← HAS COLOR`)
                foundColor = true
                break
              }
            }
            if (!foundColor) console.log(`[DIAG #${this.m_drawFrameCount}] FB: ALL sampled pixels are BLACK`)
          }
        } else {
          // Read from screen (bypass mode)
          const gl = renderer.getContext() as WebGLRenderingContext
          gl.bindFramebuffer(gl.FRAMEBUFFER, null)
          const buf = new Uint8Array(4)
          const bw = gl.drawingBufferWidth, bh = gl.drawingBufferHeight
          let foundColor = false
          for (const [sx, sy] of [[bw/2, bh/2], [100, 100], [150, bh-150], [200, bh-200], [250, bh-250]]) {
            gl.readPixels(Math.floor(sx), Math.floor(sy), 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, buf)
            if (buf[0] > 0 || buf[1] > 0 || buf[2] > 0) {
              console.log(`[DIAG #${this.m_drawFrameCount}] SCREEN pixel at (${Math.floor(sx)},${Math.floor(sy)}): rgba(${buf[0]},${buf[1]},${buf[2]},${buf[3]}) ← HAS COLOR`)
              foundColor = true
              break
            }
          }
          if (!foundColor) console.log(`[DIAG #${this.m_drawFrameCount}] SCREEN: ALL sampled pixels are BLACK after tile draws`)
        }
      }
    }

    if (bypassFB) {
      // Restore screen resolution
      g_painter.setResolution(this.m_size, this.m_transformMatrix)
    } else if (hasFramebuffer) {
      pool.getFrameBuffer()!.release()
    }
    if ((pool as any).m_atlas) (pool as any).m_atlas?.flush?.()
  }

  /** OTC: drawPool(DrawPoolType type) */
  drawPool(type: DrawPoolType): void {
    const pool = this.get(type)
    if (!pool || !pool.isEnabled()) return
    this.drawObjects(pool)

    // Skip FB blit when bypassing (first 3 frames for MAP)
    const bypassFB = pool.hasFrameBuffer() && type === DrawPoolType.MAP && this.m_drawFrameCount <= 3
    if (pool.hasFrameBuffer() && !bypassFB) {
      g_painter.resetState()
      if (pool.m_beforeDraw) pool.m_beforeDraw()
      pool.getFrameBuffer()!.draw()
      if (pool.m_afterDraw) pool.m_afterDraw()
    }
  }

  /** OTC: repaint(DrawPoolType) */
  repaint(drawPoolType: DrawPoolType): void {
    const pool = this.get(drawPoolType)
    if (pool) pool.repaint()
  }

  /** OTC: removeTextureFromAtlas */
  removeTextureFromAtlas(_id: number, _smooth?: boolean): void {
    for (const pool of this.m_pools) {
      if (pool && (pool as any).m_atlas) (pool as any).m_atlas.removeTexture?.(_id, _smooth)
    }
  }

  /** OTC: getAtlasStats */
  getAtlasStats(): string {
    const mapAtlas = this.get(DrawPoolType.MAP)?.getAtlas()
    const fgAtlas = this.get(DrawPoolType.FOREGROUND)?.getAtlas()
    return `map=${mapAtlas ? (mapAtlas as any).getStats?.() ?? 'disabled' : 'disabled'} | fg=${fgAtlas ? (fgAtlas as any).getStats?.() ?? 'disabled' : 'disabled'}`
  }

  /** Delegates to getCurrentPool() – OTC header inline methods */
  addAction(action: () => void, hash = 0): void {
    this.getCurrentPool()?.addAction(action, hash)
  }
  bindFrameBuffer(size: Size, color?: unknown): void {
    this.getCurrentPool()?.bindFrameBuffer(size, color as any)
  }
  releaseFrameBuffer(dest?: unknown): void {
    this.getCurrentPool()?.releaseFrameBuffer(dest as any)
  }
  setOpacity(opacity: number, onlyOnce?: boolean): void {
    this.getCurrentPool()?.setOpacity(opacity, onlyOnce ?? false)
  }
  setClipRect(clipRect: unknown, onlyOnce?: boolean): void {
    this.getCurrentPool()?.setClipRect(clipRect as any, onlyOnce ?? false)
  }
  setBlendEquation(equation: number, onlyOnce?: boolean): void {
    this.getCurrentPool()?.setBlendEquation(equation, onlyOnce ?? false)
  }
  setCompositionMode(mode: number, onlyOnce?: boolean): void {
    this.getCurrentPool()?.setCompositionMode(mode, onlyOnce ?? false)
  }
  setDrawOrder(order: DrawOrder): void {
    this.getCurrentPool()?.setDrawOrder(order)
  }
  setShaderProgram(program: unknown, onlyOnce?: boolean, action?: () => void): void {
    this.getCurrentPool()?.setShaderProgram(program, onlyOnce ?? false, action ?? null)
  }
  getOpacity(): number {
    return this.getCurrentPool()?.getOpacity() ?? 1
  }
  getClipRect(): unknown {
    return this.getCurrentPool()?.getClipRect() ?? {}
  }
  resetState(): void {
    this.getCurrentPool()?.resetState()
  }
  resetOpacity(): void {
    this.getCurrentPool()?.resetOpacity()
  }
  resetClipRect(): void {
    this.getCurrentPool()?.resetClipRect()
  }
  resetShaderProgram(): void {
    this.getCurrentPool()?.resetShaderProgram()
  }
  resetCompositionMode(): void {
    this.getCurrentPool()?.resetCompositionMode()
  }
  resetDrawOrder(): void {
    this.getCurrentPool()?.resetDrawOrder()
  }
  resetOnlyOnceParameters(): void {
    this.getCurrentPool()?.resetOnlyOnceParameters()
  }
  pushTransformMatrix(): void {
    this.getCurrentPool()?.pushTransformMatrix()
  }
  popTransformMatrix(): void {
    this.getCurrentPool()?.popTransformMatrix()
  }
  scale(factor: number): void {
    this.getCurrentPool()?.scale(factor)
  }
  translate(x: number, y: number): void {
    this.getCurrentPool()?.translate(x, y)
  }
  rotate(angle: number): void {
    this.getCurrentPool()?.rotate(angle)
  }
  setScaleFactor(scale: number): void {
    this.getCurrentPool()?.setScaleFactor(scale)
  }
  getScaleFactor(): number {
    return this.getCurrentPool()?.getScaleFactor() ?? 1
  }
  getDrawOrder(): number {
    return this.getCurrentPool()?.getDrawOrder() ?? 0
  }
  getScaledSpriteSize(): number {
    return this.m_spriteSize * this.getScaleFactor()
  }
  flush(): void {
    this.getCurrentPool()?.flush()
  }

  /** Allow registering a custom pool (e.g. MapView's pipeline for MAP/FOREGROUND_MAP/CREATURE_INFORMATION). */
  setPool(type: DrawPoolType, pool: DrawPool | null): void {
    if (type >= 0 && type < DrawPoolType.LAST) this.m_pools[type] = pool
  }

  /** Project: delegate to current pool – use these instead of getCurrentPool(). */
  get w(): number {
    return this.getCurrentPool()?.w ?? 0
  }
  get h(): number {
    return this.getCurrentPool()?.h ?? 0
  }
  beginFrame(): void {
    this.getCurrentPool()?.beginFrame()
  }
  endFrame(): void {
    this.getCurrentPool()?.endFrame()
  }
  addTexturedPos(texture: unknown, x: number, y: number): void {
    this.getCurrentPool()?.addTexturedPos(texture, x, y)
  }
  addCreatureInfoText(text: string, rect: { x: number; y: number; width: number; height: number }, color: { r: number; g: number; b: number }): void {
    this.getCurrentPool()?.addCreatureInfoText(text, rect, color)
  }
  beginCreatureInfo(p: { x: number; y: number }, _mapRect?: any): void {
    this.getCurrentPool()?.beginCreatureInfo(p)
  }
  endCreatureInfo(): void {
    this.getCurrentPool()?.endCreatureInfo()
  }
  texForCanvas(canvas: HTMLCanvasElement | null): unknown {
    return this.getCurrentPool()?.texForCanvas(canvas) ?? null
  }
  isDrawingEffectsOnTop(): boolean {
    return this.getCurrentPool()?.isDrawingEffectsOnTop() ?? true
  }
  setDrawingEffectsOnTop(v: boolean): void {
    this.getCurrentPool()?.setDrawingEffectsOnTop(v)
  }
  isEnabled(): boolean {
    return this.getCurrentPool()?.isEnabled() ?? false
  }
  /** OTC: shaderNeedFramebuffer() */
  shaderNeedFramebuffer(): boolean {
    const pool = this.getCurrentPool()
    return !!(pool?.getCurrentState().shaderProgram && (pool.getCurrentState().shaderProgram as any)?.useFramebuffer?.())
  }
  drawWithFrameBuffer(tex?: unknown, rect?: any, srcRect?: any, color?: unknown): void {
    this.getCurrentPool()?.drawWithFrameBuffer(tex, rect, srcRect, color)
  }
}

export const g_drawPool = new DrawPoolManager()

// Eagerly initialize pools so they exist before any component mounts.
// g_drawPool.init() is idempotent – calling it again from App.jsx is safe.
g_drawPool.init(32)
