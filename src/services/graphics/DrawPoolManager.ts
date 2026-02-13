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
    g_painter.flushTextureAtlas()

    // Clear screen before drawing all pools (autoClear is OFF; we manage it here).
    g_painter.setRenderTarget(null)
    g_painter.clear({ r: 0, g: 0, b: 0, a: 1 })

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
      let s = (src ?? {}) as { x?: number; y?: number; width?: number; height?: number }
      const atlasEntry = texture as { texture?: unknown; src?: { x?: number; y?: number; width?: number; height?: number } }
      const actualTex = atlasEntry?.texture != null ? atlasEntry.texture : texture
      if (atlasEntry?.src) {
        s = (s.width != null && s.height != null)
          ? { x: (atlasEntry.src.x ?? 0) + (s.x ?? 0), y: (atlasEntry.src.y ?? 0) + (s.y ?? 0), width: s.width, height: s.height }
          : { ...atlasEntry.src }
      }
      if ((d.width ?? 0) <= 0 || (d.height ?? 0) <= 0 || (s.width ?? 0) <= 0 || (s.height ?? 0) <= 0) {
        this.getCurrentPool()?.resetOnlyOnceParameters()
        return
      }
      this.getCurrentPool()?.add(color as any, actualTex, { type: 0, dest: d as any, src: s as any }, null)
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

    if (hasFramebuffer) {
      pool.getFrameBuffer()!.bind()
    }

    if (shouldRepaint) {
      const tmp = pool.m_objectsDraw[0]
      pool.m_objectsDraw[0] = pool.m_objectsDraw[1]
      pool.m_objectsDraw[1] = tmp
      pool.m_shouldRepaint = false
    }

    const list = pool.m_objectsDraw[1]
    for (const obj of list) {
      this.drawObject(pool, obj)
    }

    if (hasFramebuffer) {
      pool.getFrameBuffer()!.release()
    }
    if ((pool as any).m_atlas) (pool as any).m_atlas?.flush?.()
  }

  /** OTC: drawPool(DrawPoolType type) */
  drawPool(type: DrawPoolType): void {
    const pool = this.get(type)
    if (!pool || !pool.isEnabled()) return
    this.drawObjects(pool)

    if (pool.hasFrameBuffer()) {
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

  /** Project: total draw objects across all pools (for performance overlay). */
  getTotalDrawObjectCount(): number {
    let total = 0
    for (let i = 0; i < DrawPoolType.LAST; i++) {
      const pool = this.m_pools[i]
      if (pool?.isEnabled?.()) {
        const list = pool.m_objectsDraw?.[1]
        if (Array.isArray(list)) total += list.length
      }
    }
    return total
  }

  /** Project: draw object count per pool type (for performance overlay details). */
  getDrawObjectCountByPool(): Record<string, number> {
    const names: Record<number, string> = {
      [DrawPoolType.MAP]: 'Map',
      [DrawPoolType.CREATURE_INFORMATION]: 'CreatureInfo',
      [DrawPoolType.LIGHT]: 'Light',
      [DrawPoolType.FOREGROUND_MAP]: 'FgMap',
      [DrawPoolType.FOREGROUND]: 'Foreground',
    }
    const out: Record<string, number> = {}
    for (let i = 0; i < DrawPoolType.LAST; i++) {
      const pool = this.m_pools[i]
      const list = pool?.isEnabled?.() ? pool.m_objectsDraw?.[1] : null
      const count = Array.isArray(list) ? list.length : 0
      if (count > 0) out[names[i] ?? `Pool${i}`] = count
    }
    return out
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
  texForCanvas(canvas: HTMLCanvasElement | null, opts?: { skipAtlas?: boolean }): unknown {
    return this.getCurrentPool()?.texForCanvas(canvas, opts) ?? null
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
