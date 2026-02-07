/*
 * Copyright (c) 2010-2026 OTClient <https://github.com/edubart/otclient>
 * Port 1:1 from src/framework/graphics/drawpool.cpp + drawpool.h
 */

import * as THREE from 'three'
import { g_painter } from './Painter'
import type { Rect, Color, PainterState } from './Painter'
import { FrameBuffer } from './FrameBuffer'
import { CoordsBuffer } from './CoordsBuffer'
import { DrawMode } from './declarations'
import type { Point, Size } from './declarations'
import { sizeValid } from './declarations'

const DEFAULT_DISPLAY_DENSITY = 1

/** OTC: enum DrawOrder : uint8_t */
export enum DrawOrder {
  FIRST = 0,
  SECOND = 1,
  THIRD = 2,
  FOURTH = 3,
  FIFTH = 4,
  LAST = 5,
}

/** OTC: enum class DrawPoolType */
export enum DrawPoolType {
  MAP = 0,
  CREATURE_INFORMATION = 1,
  LIGHT = 2,
  FOREGROUND_MAP = 3,
  FOREGROUND = 4,
  LAST = 5,
}

/** OTC: DrawHashController */
class DrawHashController {
  m_agroup: boolean
  m_hashs: Set<number>
  m_lastHash: number
  m_currentHash: number
  m_lastObjectHash: number

  constructor(agroup = false) {
    this.m_agroup = !!agroup
    this.m_hashs = new Set()
    this.m_lastHash = 0
    this.m_currentHash = 0
    this.m_lastObjectHash = 0
  }

  put(hash: number): boolean {
    if ((this.m_agroup && this.m_hashs.add(hash).size >= 0) || this.m_lastObjectHash !== hash) {
      this.m_lastObjectHash = hash
      this.m_currentHash = (this.m_currentHash * 31 + hash) | 0
      return true
    }
    return false
  }

  isLast(hash: number): boolean {
    return this.m_lastObjectHash === hash
  }

  forceUpdate(): void {
    this.m_currentHash = 1
  }

  wasModified(): boolean {
    return this.m_currentHash !== this.m_lastHash
  }

  reset(): void {
    if (this.m_currentHash !== 1) this.m_lastHash = this.m_currentHash
    this.m_hashs.clear()
    this.m_currentHash = 0
    this.m_lastObjectHash = 0
  }
}

/** OTC: DrawMethodType */
export enum DrawMethodType {
  RECT = 0,
  TRIANGLE = 1,
  REPEATED_RECT = 2,
  BOUNDING_RECT = 3,
  UPSIDEDOWN_RECT = 4,
}

/** OTC: DrawMethod */
export interface DrawMethod {
  type: DrawMethodType
  dest: Rect
  src: Rect
  a?: Point
  b?: Point
  c?: Point
  intValue?: number
}

/** Legacy rect payload for addTexturedRect(rect) and game code. */
export interface DrawRect {
  tileX?: number
  tileY?: number
  width?: number
  height?: number
  z?: number
  dx?: number
  dy?: number
  pixelX?: number
  pixelY?: number
  pixelWidth?: number
  pixelHeight?: number
  texture?: unknown
  color?: Color
  __compositionMode?: number
  __multiplyColor?: Color
}

const STATE_OPACITY = 1 << 0
const STATE_CLIP_RECT = 1 << 1
const STATE_SHADER_PROGRAM = 1 << 2
const STATE_COMPOSITE_MODE = 1 << 3
const STATE_BLEND_EQUATION = 1 << 4

const DEFAULT_MATRIX3 = null

/** OTC: PoolState */
export interface PoolState {
  transformMatrix: unknown
  opacity: number
  compositionMode: number
  blendEquation: number
  clipRect: Rect
  shaderProgram: unknown
  action: (() => void) | null
  color: Color
  texture: unknown
  textureId: number
  textureMatrixId: number
  hash: number
}

function makePoolState(opts: Partial<PoolState> = {}): PoolState {
  return {
    transformMatrix: opts.transformMatrix ?? DEFAULT_MATRIX3,
    opacity: opts.opacity ?? 1,
    compositionMode: opts.compositionMode ?? 0,
    blendEquation: opts.blendEquation ?? 0,
    clipRect: opts.clipRect ?? {},
    shaderProgram: opts.shaderProgram ?? null,
    action: opts.action ?? null,
    color: opts.color ?? { r: 1, g: 1, b: 1, a: 1 },
    texture: opts.texture ?? null,
    textureId: opts.textureId ?? 0,
    textureMatrixId: opts.textureMatrixId ?? 0,
    hash: opts.hash ?? 0,
  }
}

function poolStateEquals(a: PoolState, b: PoolState): boolean {
  return a !== null && b !== null && a.hash === b.hash
}

/** OTC: DrawObject */
export interface DrawObject {
  action: (() => void) | null
  coords: CoordsBuffer | null
  state: PoolState | null
}

function makeDrawObjectAction(action: () => void): DrawObject {
  return { action, coords: null, state: null }
}

function makeDrawObjectState(state: PoolState, coords: CoordsBuffer): DrawObject {
  return { action: null, coords, state }
}

/** OTC: hash_combine / hash_union helpers */
function hashCombine(h: number, v: number): number {
  return (h * 31 + v) | 0
}

/** 32-bit safe rect hash to avoid overflow collisions (was: x + y*1e3 + w*1e6 + h*1e9). */
function rectHash(r: Rect): number {
  if (!r || (r.x == null && r.y == null && r.width == null && r.height == null)) return 0
  const x = (r.x ?? 0) | 0
  const y = (r.y ?? 0) | 0
  const w = (r.width ?? 0) | 0
  const h = (r.height ?? 0) | 0
  return ((x * 73856093) ^ (y * 19349663) ^ (w * 83492791) ^ (h * 50331653)) >>> 0
}

/**
 * DrawPool – port 1:1 from OTC drawpool.cpp / drawpool.h
 */
export class DrawPool {
  static FPS1 = 1000 / 1
  static FPS10 = 1000 / 10
  static FPS20 = 1000 / 20
  static FPS60 = 1000 / 60

  m_enabled: boolean = true
  m_alwaysGroupDrawings: boolean = false
  m_bindedFramebuffers: number = -1
  m_refreshDelay: number = 0
  m_shaderRefreshDelay: number = 0
  m_onlyOnceStateFlag: number = 0
  m_lastFramebufferId: number = 0
  m_previousOpacity: number = 1
  m_previousBlendEquation: number = 0
  m_previousCompositionMode: number = 0
  m_previousClipRect: Rect = {}
  m_previousShaderProgram: unknown = null
  m_previousShaderAction: (() => void) | null = null
  m_states: PoolState[] = [makePoolState()]
  m_lastStateIndex: number = 0
  m_type: DrawPoolType = DrawPoolType.LAST
  m_currentDrawOrder: DrawOrder = DrawOrder.FIRST
  m_hashCtrl: DrawHashController
  m_transformMatrixStack: unknown[] = []
  m_temporaryFramebuffers: unknown[] = []
  m_objects: DrawObject[][] = Array.from({ length: DrawOrder.LAST }, () => [])
  m_objectsFlushed: DrawObject[] = []
  m_objectsDraw: [DrawObject[], DrawObject[]] = [[], []]
  m_coordsCache: CoordsBuffer[] = []
  m_coords: Map<number, CoordsBuffer | null> = new Map()
  m_parameters: Map<string, unknown> = new Map()
  m_scaleFactor: number = 1
  m_scale: number = DEFAULT_DISPLAY_DENSITY
  m_framebuffer: FrameBuffer | null = null
  m_beforeDraw: (() => void) | null = null
  m_afterDraw: (() => void) | null = null
  m_atlas: unknown = null
  m_shouldRepaint: boolean = false
  m_threadLock = { lock: () => {}, unlock: () => {} }

  static create(type: DrawPoolType): DrawPool {
    const pool = new DrawPool()
    if (type === DrawPoolType.MAP || type === DrawPoolType.FOREGROUND) {
      pool.setFramebuffer({ width: 0, height: 0 })
      if (type === DrawPoolType.MAP && pool.m_framebuffer) {
        pool.m_framebuffer.m_useAlphaWriting = false
        pool.m_framebuffer.disableBlend()
        pool.m_hashCtrl = new DrawHashController(true)
      } else if (type === DrawPoolType.FOREGROUND) {
        pool.setFPS(10)
        pool.m_temporaryFramebuffers.push(new FrameBuffer())
      }
    } else if (type === DrawPoolType.LIGHT) {
      pool.m_hashCtrl = new DrawHashController(true)
    } else {
      pool.m_alwaysGroupDrawings = true
      pool.setFPS(500)
    }
    pool.m_type = type
    return pool
  }

  constructor() {
    this.m_hashCtrl = new DrawHashController(false)
  }

  setEnable(v: boolean): void {
    this.m_enabled = !!v
  }
  getType(): DrawPoolType {
    return this.m_type
  }
  isEnabled(): boolean {
    return this.m_enabled
  }
  isType(type: DrawPoolType): boolean {
    return this.m_type === type
  }
  isValid(): boolean {
    return !this.m_framebuffer || this.m_framebuffer.isValid()
  }
  hasFrameBuffer(): boolean {
    return this.m_framebuffer != null
  }
  getFrameBuffer(): FrameBuffer | null {
    return this.m_framebuffer
  }
  canRepaint(): boolean {
    if (!this.m_enabled || this.shouldRepaint()) return false
    return this.canRefresh()
  }
  repaint(): void {
    this.m_hashCtrl.forceUpdate()
    ;(this as any).m_refreshTimer = -1000
  }
  resetState(): void {
    this.m_coords.clear()
    this.m_parameters.clear()
    this.m_hashCtrl.reset()
    this.m_states[this.m_lastStateIndex] = makePoolState()
    this.m_lastFramebufferId = 0
    this.m_shaderRefreshDelay = 0
    this.m_scale = DEFAULT_DISPLAY_DENSITY
  }
  agroup(v: boolean): void {
    this.m_alwaysGroupDrawings = !!v
  }
  setScaleFactor(scale: number): void {
    this.m_scaleFactor = scale
  }
  getScaleFactor(): number {
    return this.m_scaleFactor
  }
  isScaled(): boolean {
    return this.m_scaleFactor !== DEFAULT_DISPLAY_DENSITY
  }
  onBeforeDraw(f: () => void): void {
    this.m_beforeDraw = f
  }
  onAfterDraw(f: () => void): void {
    this.m_afterDraw = f
  }
  getHashController(): DrawHashController {
    return this.m_hashCtrl
  }
  getAtlas(): unknown {
    return this.m_atlas
  }
  shouldRepaint(): boolean {
    return this.m_shouldRepaint
  }
  getDrawOrder(): DrawOrder {
    return this.m_currentDrawOrder
  }
  setDrawOrder(order: DrawOrder): void {
    this.m_currentDrawOrder = order
  }
  resetDrawOrder(): void {
    this.m_currentDrawOrder = DrawOrder.FIRST
  }
  getCurrentState(): PoolState {
    return this.m_states[this.m_lastStateIndex]
  }
  getOpacity(): number {
    return this.getCurrentState().opacity
  }
  getClipRect(): Rect {
    return this.getCurrentState().clipRect ?? {}
  }
  setFPS(fps: number): void {
    this.m_refreshDelay = Math.floor(1000 / fps)
  }

  setCompositionMode(mode: number, onlyOnce = false): void {
    if (onlyOnce && !(this.m_onlyOnceStateFlag & STATE_COMPOSITE_MODE)) {
      this.m_previousCompositionMode = this.getCurrentState().compositionMode
      this.m_onlyOnceStateFlag |= STATE_COMPOSITE_MODE
    }
    this.getCurrentState().compositionMode = mode
  }
  setBlendEquation(equation: number, onlyOnce = false): void {
    if (onlyOnce && !(this.m_onlyOnceStateFlag & STATE_BLEND_EQUATION)) {
      this.m_previousBlendEquation = this.getCurrentState().blendEquation
      this.m_onlyOnceStateFlag |= STATE_BLEND_EQUATION
    }
    this.getCurrentState().blendEquation = equation
  }
  setClipRect(clipRect: Rect, onlyOnce = false): void {
    if (onlyOnce && !(this.m_onlyOnceStateFlag & STATE_CLIP_RECT)) {
      this.m_previousClipRect = { ...(this.getCurrentState().clipRect ?? {}) }
      this.m_onlyOnceStateFlag |= STATE_CLIP_RECT
    }
    this.getCurrentState().clipRect = clipRect ?? {}
  }
  setOpacity(opacity: number, onlyOnce = false): void {
    if (onlyOnce && !(this.m_onlyOnceStateFlag & STATE_OPACITY)) {
      this.m_previousOpacity = this.getCurrentState().opacity
      this.m_onlyOnceStateFlag |= STATE_OPACITY
    }
    this.getCurrentState().opacity = opacity
  }
  setShaderProgram(shaderProgram: unknown, onlyOnce = false, action?: (() => void) | null): void {
    if (g_painter.isReplaceColorShader(this.getCurrentState().shaderProgram)) return
    if (onlyOnce && !(this.m_onlyOnceStateFlag & STATE_SHADER_PROGRAM)) {
      this.m_previousShaderProgram = this.getCurrentState().shaderProgram
      this.m_previousShaderAction = this.getCurrentState().action
      this.m_onlyOnceStateFlag |= STATE_SHADER_PROGRAM
    }
    if (shaderProgram) {
      if (!g_painter.isReplaceColorShader(shaderProgram as any)) this.m_shaderRefreshDelay = DrawPool.FPS20
      this.getCurrentState().shaderProgram = shaderProgram
      this.getCurrentState().action = action ?? null
    } else {
      this.getCurrentState().shaderProgram = null
      this.getCurrentState().action = null
    }
  }
  resetOpacity(): void {
    this.getCurrentState().opacity = 1
  }
  resetClipRect(): void {
    this.getCurrentState().clipRect = {}
  }
  resetShaderProgram(): void {
    this.getCurrentState().shaderProgram = null
    this.getCurrentState().action = null
  }
  resetCompositionMode(): void {
    this.getCurrentState().compositionMode = 0
  }
  resetBlendEquation(): void {
    this.getCurrentState().blendEquation = 0
  }
  resetTransformMatrix(): void {
    this.getCurrentState().transformMatrix = DEFAULT_MATRIX3
  }
  bindFrameBuffer(_size: unknown, _color?: Color): void {
    this.m_bindedFramebuffers++
    this.m_lastFramebufferId++
    this.nextStateAndReset()
  }
  releaseFrameBuffer(_dest?: Rect, _flipDirection?: number): void {
    this.backState()
    this.m_bindedFramebuffers--
  }
  setFramebuffer(size: Size): void {
    if (!this.m_framebuffer) {
      this.m_framebuffer = new FrameBuffer()
      this.m_framebuffer.setAutoResetState(true)
    }
    if (sizeValid(size) && this.m_framebuffer.resize(size)) {
      this.m_framebuffer.prepare({}, {})
      this.repaint()
    }
  }
  removeFramebuffer(): void {
    this.m_hashCtrl.reset()
    this.m_framebuffer?.reset()
    this.m_framebuffer = null
  }

  setParameter<T>(name: string, value: T): void {
    this.m_parameters.set(name, value)
  }
  getParameter<T>(name: string): T {
    return this.m_parameters.get(name) as T
  }
  containsParameter(name: string): boolean {
    return this.m_parameters.has(name)
  }
  removeParameter(name: string): void {
    this.m_parameters.delete(name)
  }

  resetOnlyOnceParameters(): void {
    if (this.m_onlyOnceStateFlag === 0) return
    const s = this.getCurrentState()
    if (this.m_onlyOnceStateFlag & STATE_OPACITY) s.opacity = this.m_previousOpacity
    if (this.m_onlyOnceStateFlag & STATE_BLEND_EQUATION) s.blendEquation = this.m_previousBlendEquation
    if (this.m_onlyOnceStateFlag & STATE_CLIP_RECT) s.clipRect = { ...this.m_previousClipRect }
    if (this.m_onlyOnceStateFlag & STATE_COMPOSITE_MODE) s.compositionMode = this.m_previousCompositionMode
    if (this.m_onlyOnceStateFlag & STATE_SHADER_PROGRAM) {
      s.shaderProgram = this.m_previousShaderProgram
      s.action = this.m_previousShaderAction
    }
    this.m_onlyOnceStateFlag = 0
  }

  nextStateAndReset(): void {
    this.m_lastStateIndex++
    if (!this.m_states[this.m_lastStateIndex]) this.m_states[this.m_lastStateIndex] = makePoolState()
    this.m_states[this.m_lastStateIndex] = makePoolState()
  }
  backState(): void {
    this.m_lastStateIndex--
  }

  private canRefresh(): boolean {
    let refreshDelay = this.m_refreshDelay
    if (this.m_shaderRefreshDelay > 0 && (refreshDelay === 0 || this.m_shaderRefreshDelay < refreshDelay))
      refreshDelay = this.m_shaderRefreshDelay
    return refreshDelay > 0 && ((this as any).m_refreshTimer ?? 0) <= -1000
  }

  add(color: Color, texture: unknown, method: DrawMethod, coordsBuffer?: CoordsBuffer | null): void {
    const hasCoord = coordsBuffer != null
    let textureAtlas: unknown = null

    if (texture && !method.src?.width && !method.src?.height && !coordsBuffer) {
      this.resetOnlyOnceParameters()
      return
    }

    if (!this.updateHash(method, texture as any, color ?? {}, hasCoord)) {
      this.resetOnlyOnceParameters()
      return
    }

    const list = this.m_objects[this.m_currentDrawOrder]
    const state = this.getState(texture, textureAtlas, color ?? {})

    let coords: CoordsBuffer
    if (coordsBuffer != null) {
      coords = coordsBuffer
    } else {
      coords = this.getCoordsBuffer()
      this.addCoords(coords, method)
    }

    if (!list.length || !list[list.length - 1].coords || !poolStateEquals(list[list.length - 1].state!, state)) {
      list.push(makeDrawObjectState(state, coords))
    } else if (this.m_alwaysGroupDrawings) {
      const key = state.hash
      let buf = this.m_coords.get(key)
      if (!buf) {
        buf = this.getCoordsBuffer()
        list.push(makeDrawObjectState(state, buf))
        this.m_coords.set(key, buf)
      }
      buf.append(coords)
      coords.clear()
      this.m_coordsCache.push(coords)
    } else {
      const last = list[list.length - 1]
      if (last.coords) {
        last.coords.append(coords)
        coords.clear()
        this.m_coordsCache.push(coords)
      } else {
        last.coords = coords
      }
    }

    // this.resetOnlyOnceParameters()
  }

  /** OTC: addCoords(CoordsBuffer& buffer, const DrawMethod& method) */
  addCoords(buffer: CoordsBuffer, method: DrawMethod): void {
    const dest = method.dest ?? {}
    const src = method.src ?? {}
    if (method.type === DrawMethodType.BOUNDING_RECT) {
      buffer.addBoudingRect(dest, method.intValue ?? 0)
    } else if (method.type === DrawMethodType.RECT) {
      buffer.addRectWithSrc(dest, src)
    } else if (method.type === DrawMethodType.TRIANGLE) {
      if (method.a && method.b && method.c) buffer.addTriangle(method.a, method.b, method.c)
    } else if (method.type === DrawMethodType.UPSIDEDOWN_RECT) {
      buffer.addUpsideDownRect(dest, src)
    } else if (method.type === DrawMethodType.REPEATED_RECT) {
      buffer.addRepeatedRects(dest, src)
    }
  }

  updateHash(method: DrawMethod, texture: { hash?: () => number; id?: number } | null, color: Color, hasCoord: boolean): boolean {
    const state = this.getCurrentState()
    let h = 0
    if (this.m_bindedFramebuffers > -1) h = hashCombine(h, this.m_lastFramebufferId)
    if (state.blendEquation !== 0) h = hashCombine(h, state.blendEquation)
    if (state.compositionMode !== 0) h = hashCombine(h, state.compositionMode)
    if (state.opacity < 1) h = hashCombine(h, (state.opacity * 1000) | 0)
    if (state.clipRect && (state.clipRect.x != null || state.clipRect.width != null)) h = hashCombine(h, rectHash(state.clipRect))
    if (state.shaderProgram) h = hashCombine(h, 1)
    if (state.transformMatrix != null) h = hashCombine(h, 2)
    if (color && ((color as any).r !== 1 || (color as any).g !== 1 || (color as any).b !== 1)) h = hashCombine(h, ((color as any).r ?? 0) + ((color as any).g ?? 0) * 2 + ((color as any).b ?? 0) * 3)
    if (texture) h = hashCombine(h, typeof texture.hash === 'function' ? texture.hash() : (texture.id ?? 0))
    state.hash = h

    if (this.hasFrameBuffer()) {
      let poolHash = state.hash
      if (method.type === DrawMethodType.TRIANGLE) {
        if (method.a) poolHash = hashCombine(poolHash, (method.a.x ?? 0) + (method.a.y ?? 0) * 1000)
        if (method.b) poolHash = hashCombine(poolHash, (method.b.x ?? 0) + (method.b.y ?? 0) * 1000)
        if (method.c) poolHash = hashCombine(poolHash, (method.c!.x ?? 0) + (method.c!.y ?? 0) * 1000)
      } else if (method.type === DrawMethodType.BOUNDING_RECT) {
        if (method.intValue) poolHash = hashCombine(poolHash, method.intValue)
      } else {
        if (method.dest && (method.dest as any).width != null) poolHash = hashCombine(poolHash, rectHash(method.dest))
        if (method.src && (method.src as any).width != null) poolHash = hashCombine(poolHash, rectHash(method.src))
      }
      // MAP pool: every tile is a distinct draw; skip deduplication so all tiles are added (OTC isLast was dropping tiles).
      if (!hasCoord && this.m_type !== DrawPoolType.MAP && this.m_hashCtrl.isLast(poolHash)) return false
      this.m_hashCtrl.put(poolHash)
    }
    return true
  }

  getState(texture: unknown, textureAtlas: unknown, color: Color): PoolState {
    const copy = makePoolState({ ...this.getCurrentState() })
    if ((copy.color as any)?.r !== (color as any)?.r || (copy.color as any)?.g !== (color as any)?.g || (copy.color as any)?.b !== (color as any)?.b)
      copy.color = color as any
    if (textureAtlas) {
      copy.textureId = (textureAtlas as any)?.id ?? 0
      copy.textureMatrixId = (textureAtlas as any)?.matrixId ?? 0
    } else if (texture) {
      copy.texture = texture
      copy.textureId = (texture as any)?.id ?? 0
      copy.textureMatrixId = 0
    }
    return copy
  }

  addAction(action: () => void, hash = 0): void {
    const order = this.m_type === DrawPoolType.MAP ? DrawOrder.THIRD : DrawOrder.FIRST
    this.m_objects[order].push(makeDrawObjectAction(action))
    if (this.hasFrameBuffer() && hash > 0 && !this.m_hashCtrl.isLast(hash)) this.m_hashCtrl.put(hash)
  }

  getCoordsBuffer(): CoordsBuffer {
    let buf = this.m_coordsCache.pop()
    if (!buf) buf = new CoordsBuffer(64)
    buf.clear()
    return buf
  }

  release(): void {
    const hasContent = this.m_objects.some((objs) => objs.length > 0) || this.m_objectsFlushed.length > 0
    const skipEarlyReturn = this.m_type === DrawPoolType.MAP || hasContent
    if (this.hasFrameBuffer() && !skipEarlyReturn && !this.m_hashCtrl.wasModified() && !this.canRefresh()) {
      for (const objs of this.m_objects) objs.length = 0
      this.m_objectsFlushed.length = 0
      return
    }
    ;(this as any).m_refreshTimer = (typeof performance !== 'undefined' ? performance.now() : Date.now()) - 1000

    this.m_objectsDraw[0].length = 0
    if (this.m_objectsFlushed.length) {
      this.m_objectsDraw[0].push(...this.m_objectsFlushed)
      this.m_objectsFlushed.length = 0
    }
    for (const objs of this.m_objects) {
      let addFirst = true
      if (this.m_objectsDraw[0].length && objs.length) {
        const last = this.m_objectsDraw[0][this.m_objectsDraw[0].length - 1]
        const first = objs[0]
        if (poolStateEquals(last.state!, first.state!) && last.coords && first.coords) {
          last.coords.append(first.coords)
          first.coords.clear()
          this.m_coordsCache.push(first.coords)
          addFirst = false
        }
      }
      if (objs.length) {
        const start = addFirst ? 0 : 1
        for (let i = start; i < objs.length; i++) this.m_objectsDraw[0].push(objs[i])
        objs.length = 0
      }
    }
    this.m_shouldRepaint = true
  }

  flush(): void {
    this.m_coords.clear()
    for (const objs of this.m_objects) {
      let addFirst = true
      if (objs.length && this.m_objectsFlushed.length) {
        const last = this.m_objectsFlushed[this.m_objectsFlushed.length - 1]
        const first = objs[0]
        if (poolStateEquals(last.state!, first.state!) && last.coords && first.coords) {
          last.coords.append(first.coords)
          first.coords.clear()
          this.m_coordsCache.push(first.coords)
          addFirst = false
        }
      }
      const start = addFirst ? 0 : 1
      for (let i = start; i < objs.length; i++) this.m_objectsFlushed.push(objs[i])
      objs.length = 0
    }
  }

  scale(factor: number): void {
    if (this.m_scale === factor) return
    this.m_scale = factor
    this.getCurrentState().transformMatrix = { scale: factor }
  }

  translate(x: number, y: number): void {
    const s = this.getCurrentState()
    const t = (s.transformMatrix as any) || {}
    const tr = t.translate || { x: 0, y: 0 }
    this.getCurrentState().transformMatrix = { ...t, translate: { x: tr.x + x, y: tr.y + y } }
  }

  rotate(angle: number): void {
    const s = this.getCurrentState()
    this.getCurrentState().transformMatrix = { ...(s.transformMatrix as any), rotate: angle }
  }

  rotateXY(x: number, y: number, angle: number): void {
    this.translate(-x, -y)
    this.rotate(angle)
    this.translate(x, y)
  }

  pushTransformMatrix(): void {
    this.m_transformMatrixStack.push(this.getCurrentState().transformMatrix)
  }

  popTransformMatrix(): void {
    if (this.m_transformMatrixStack.length)
      this.getCurrentState().transformMatrix = this.m_transformMatrixStack.pop()!
  }

  /** PoolState::execute(DrawPool*) – apply state to painter then draw coords. */
  static executeState(state: PoolState, pool: DrawPool): void {
    g_painter.setColor(state.color as any)
    g_painter.setOpacity(state.opacity)
    g_painter.setCompositionMode(state.compositionMode)
    g_painter.setBlendEquation(state.blendEquation)
    g_painter.setClipRect(state.clipRect ?? {})
    g_painter.setShaderProgram(state.shaderProgram)
    g_painter.setTransformMatrix(state.transformMatrix)
    if (state.action) state.action()
    if (state.texture) {
      g_painter.setTexture(state.texture as any)
    } else {
      g_painter.setTexture(state.textureId, state.textureMatrixId)
    }
  }

  // —— Project: optional refs for game logic (calcFirstVisibleFloor, etc.); no draw target. ——
  w: number = 0
  h: number = 0
  map: unknown = null
  m_drawingEffectsOnTop: boolean = true
  m_creatureInfoOrigin: { x: number; y: number } | null = null
  m_creatureInfoDraws: Array<
    | { type: 'filled'; rect: { x: number; y: number; width: number; height: number }; color: { r: number; g: number; b: number } }
    | { type: 'textured'; texture: unknown; x: number; y: number }
    | { type: 'text'; text: string; rect: { x: number; y: number; width: number; height: number }; color: { r: number; g: number; b: number } }
  > | null = null

  setMap(map: unknown): void {
    this.map = map
  }

  /** Project: delegate to Painter for texture cache (ThingType.draw). */
  texForCanvas(canvas: HTMLCanvasElement | null): unknown {
    return (g_painter as any).texForCanvas?.(canvas) ?? null
  }

  /** Project: ThingType uses this for framebuffer path. */
  shaderNeedFramebuffer(): boolean {
    return false
  }
  drawWithFrameBuffer(_tex?: unknown, _rect?: any, _srcRect?: any, _color?: unknown): void {
    // Stub: framebuffer path not used in this port
  }

  /** Project: start frame (clear state and object arrays). No tile groups. */
  beginFrame(): void {
    this.resetState()
    for (const objs of this.m_objects) objs.length = 0
    this.m_objectsFlushed.length = 0
    this.m_states[0] = makePoolState()
    this.m_lastStateIndex = 0
    this.m_currentDrawOrder = DrawOrder.FIRST
  }

  /** Project: end frame (flush, release). Drawing is done by DrawPoolManager.drawObjects/drawPool. */
  endFrame(): void {
    this.flush()
    this.release()
  }

  isDrawingEffectsOnTop(): boolean {
    return this.m_drawingEffectsOnTop
  }
  setDrawingEffectsOnTop(v: boolean): void {
    this.m_drawingEffectsOnTop = !!v
  }

  /** OTC addTexturedRect – enqueue rect; dest/src in pixels (1 unit = 1 pixel). */
  addTexturedRect(rect: DrawRect & { texture?: unknown; color?: Color }): void {
    if (!rect?.texture) return
    const TILE_PIXELS = 32
    const px = rect.pixelX ?? (rect.tileX ?? 0) * TILE_PIXELS
    const py = rect.pixelY ?? (rect.tileY ?? 0) * TILE_PIXELS
    const pw = rect.pixelWidth ?? (rect.width ?? 1) * TILE_PIXELS
    const ph = rect.pixelHeight ?? (rect.height ?? 1) * TILE_PIXELS
    // add() returns early when texture is set but method.src has no width/height. Use actual texture size for src so UVs normalize to 0-1 (Painter divides by texture image size).
    const texImg = (rect.texture as { image?: { width?: number; height?: number } })?.image
    const srcW = texImg?.width ?? pw
    const srcH = texImg?.height ?? ph
    const method: DrawMethod = {
      type: DrawMethodType.RECT,
      dest: { x: px, y: py, width: pw, height: ph },
      src: { x: 0, y: 0, width: srcW, height: srcH },
      intValue: rect.z ?? 0,
    }
    this.add(rect.color ?? {}, rect.texture, method, null)
  }

  addFilledRect(rect: { x: number; y: number; width: number; height: number }, color: { r: number; g: number; b: number }): void {
    if (this.m_creatureInfoOrigin && this.m_creatureInfoDraws) {
      this.m_creatureInfoDraws.push({ type: 'filled', rect: { ...rect }, color: { ...color } })
    }
  }
  addTexturedPos(texture: unknown, x: number, y: number): void {
    if (texture && this.m_creatureInfoOrigin && this.m_creatureInfoDraws) {
      this.m_creatureInfoDraws.push({ type: 'textured', texture, x, y })
    }
  }
  addCreatureInfoText(text: string, rect: { x: number; y: number; width: number; height: number }, color: { r: number; g: number; b: number }): void {
    if (this.m_creatureInfoOrigin && this.m_creatureInfoDraws) {
      this.m_creatureInfoDraws.push({ type: 'text', text, rect: { ...rect }, color: { ...color } })
    }
  }
  beginCreatureInfo(p: { x: number; y: number }): void {
    this.m_creatureInfoOrigin = { x: p.x, y: p.y }
    this.m_creatureInfoDraws = []
  }
  /** Project: first visible floor (OTC MapView logic). */
  calcFirstVisibleFloor(types: unknown): number {
    const SEA_FLOOR = 7
    const AWARE_UNDERGROUND_FLOOR_RANGE = 2
    const UNDERGROUND_FLOOR = 8
    const MAX_Z = 15
    const map = this.map as any
    if (!map) return 7
    const cameraZ = map.cameraZ ?? SEA_FLOOR
    const cameraX = map.cameraX ?? 0
    const cameraY = map.cameraY ?? 0
    const rangeLeft = map.range?.left ?? 8
    const rangeTop = map.range?.top ?? 6
    const getTileAt = (wx: number, wy: number, z: number) => {
      let t = map.getTileWorld?.(wx, wy, z)
      if (t) return t
      const sx = wx - cameraX + rangeLeft - z + cameraZ
      const sy = wy - cameraY + rangeTop - z + cameraZ
      return (sx >= 0 && sy >= 0) ? map.getTile?.(sx, sy, z) ?? null : null
    }
    const isLookPossibleAt = (x: number, y: number, z: number) => {
      const t = map.getTileWorld?.(x, y, z)
      if (!t) return true
      for (const it of (t.m_things ?? [])) {
        if (!(it as any).isItem?.()) continue
        const tt = types && (types as any).getItem?.(Number((it as any).getId?.()))
        if (tt?.blockProjectile) return false
      }
      return true
    }
    const tileLimitsFloorsView = (tile: any, isFreeView: boolean) => {
      const stack = tile?.m_things ?? []
      const firstItem = stack.find((s: any) => (s as any).isItem?.()) || null
      if (!firstItem) return false
      const tt = types && (types as any).getItem?.(Number(firstItem.getId?.()))
      if (!tt || tt.dontHide) return false
      if (isFreeView) return !!(tt.ground || tt.onBottom)
      return !!(tt.ground || (tt.onBottom && tt.blockProjectile))
    }
    let firstFloor = 0
    for (let ix = -1; ix <= 1 && firstFloor < cameraZ; ix++) {
      for (let iy = -1; iy <= 1 && firstFloor < cameraZ; iy++) {
        const isOrthogonal = Math.abs(ix) !== Math.abs(iy)
        const canCheck = (ix === 0 && iy === 0) || (isOrthogonal && isLookPossibleAt(cameraX + ix, cameraY + iy, cameraZ))
        if (!canCheck) continue
        const pos = { x: cameraX + ix, y: cameraY + iy, z: cameraZ }
        const freeView = isLookPossibleAt(pos.x, pos.y, pos.z)
        let upperPos = { ...pos }
        let coveredPos = { x: pos.x + 1, y: pos.y + 1, z: pos.z - 1 }
        while (coveredPos.z > firstFloor) {
          upperPos = { x: upperPos.x, y: upperPos.y, z: upperPos.z - 1 }
          coveredPos = { x: coveredPos.x + 1, y: coveredPos.y + 1, z: coveredPos.z - 1 }
          if (upperPos.z < firstFloor) break
          const tilePhys = getTileAt(upperPos.x, upperPos.y, upperPos.z)
          if (tilePhys && tileLimitsFloorsView(tilePhys, !freeView)) {
            firstFloor = upperPos.z + 1
            break
          }
          const tileGeom = getTileAt(coveredPos.x, coveredPos.y, coveredPos.z)
          if (tileGeom && tileLimitsFloorsView(tileGeom, freeView)) {
            firstFloor = coveredPos.z + 1
            break
          }
        }
      }
    }
    if (cameraZ <= SEA_FLOOR) firstFloor = Math.min(firstFloor, cameraZ)
    return Math.max(0, Math.min(MAX_Z, firstFloor))
  }

  calcLastVisibleFloor(firstFloor: number): number {
    const SEA_FLOOR = 7
    const AWARE_UNDERGROUND_FLOOR_RANGE = 2
    const MAX_Z = 15
    const map = this.map as any
    if (!map || !map.multifloor) return firstFloor
    const cameraZ = map.cameraZ ?? SEA_FLOOR
    const z = cameraZ > SEA_FLOOR ? cameraZ + AWARE_UNDERGROUND_FLOOR_RANGE : SEA_FLOOR
    return Math.max(0, Math.min(MAX_Z, z))
  }

  endCreatureInfo(): void {
    const origin = this.m_creatureInfoOrigin
    const draws = this.m_creatureInfoDraws
    this.m_creatureInfoOrigin = null
    this.m_creatureInfoDraws = null
    if (!origin || !draws?.length) return
    let minX = origin.x
    let minY = origin.y
    let maxX = origin.x
    let maxY = origin.y
    const PAD = 3
    for (const d of draws) {
      if (d.type === 'filled' || d.type === 'text') {
        const r = d.type === 'filled' ? d.rect : (d as any).rect
        const pad = d.type === 'text' ? PAD : 0
        minX = Math.min(minX, r.x - pad)
        minY = Math.min(minY, r.y - pad)
        maxX = Math.max(maxX, r.x + r.width + pad)
        maxY = Math.max(maxY, r.y + r.height + pad)
      } else {
        minX = Math.min(minX, d.x)
        minY = Math.min(minY, d.y)
        maxX = Math.max(maxX, d.x + 12)
        maxY = Math.max(maxY, d.y + 12)
      }
    }
    const w = Math.ceil(maxX - minX)
    const h = Math.ceil(maxY - minY)
    if (w <= 0 || h <= 0) return
    const canvas = typeof document !== 'undefined' ? document.createElement('canvas') : null
    if (!canvas) return
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    for (const d of draws) {
      if (d.type === 'filled') {
        ctx.fillStyle = `rgb(${d.color.r},${d.color.g},${d.color.b})`
        ctx.fillRect(d.rect.x - minX, d.rect.y - minY, d.rect.width, d.rect.height)
      } else if (d.type === 'textured') {
        const img = d.texture && (d.texture as HTMLCanvasElement).getContext ? d.texture as HTMLCanvasElement : null
        if (img) ctx.drawImage(img, d.x - minX, d.y - minY, 12, 12)
      } else if (d.type === 'text') {
        ctx.font = '10px sans-serif'
        ctx.textAlign = 'center'
        ctx.textBaseline = 'alphabetic'
        const cx = d.rect.x - minX + d.rect.width / 2
        const cy = d.rect.y - minY + d.rect.height - 2
        ctx.strokeStyle = '#000'
        ctx.lineWidth = 2.5
        ctx.strokeText(d.text, cx, cy)
        ctx.fillStyle = `rgb(${d.color.r},${d.color.g},${d.color.b})`
        ctx.fillText(d.text, cx, cy)
      }
    }
    const tex = (g_painter as any).texForCanvas?.(canvas)
    if (!tex) return
    const TILE = 32
    this.addTexturedRect({
      tileX: minX / TILE,
      tileY: minY / TILE,
      texture: tex,
      width: w / TILE,
      height: h / TILE,
      z: 0,
      dx: (minX % TILE) / TILE,
      dy: (minY % TILE) / TILE,
    } as any)
  }
}
