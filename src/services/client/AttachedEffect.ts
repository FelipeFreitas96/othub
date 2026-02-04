/*
 * Copyright (c) 2010-2026 OTClient <https://github.com/edubart/otclient>
 * Port 1:1 from attachedeffect.h + attachedeffect.cpp.
 */

import type { Point } from './types'
import type { LightView } from './declarations'
import type { IAttachedEffectLike } from './AttachableObject'
import type { Light } from './StaticData'
import { Size, Color, Timer } from './types'
import { Otc } from './Const'
import { ThingCategory } from './Const'
import { Bounce } from './StaticData'
import { g_gameConfig } from './gameConfig'
import { g_drawPool } from '../graphics/DrawPoolManager'
import { DrawOrder, DrawPoolType } from '../graphics/DrawPool'
import { getThings } from '../protocol/things'
import type { ThingType } from '../things/thingType'
import type { Position } from './Position'

const NORTHWEST_DIR = Otc.Direction.NorthWest as number

function getBounceValue(bounce: Bounce, scaleFactor: number): number {
  const minHeight = bounce.minHeight * scaleFactor
  const height = bounce.height * scaleFactor
  const t = bounce.timer.ticksElapsed() / (bounce.speed / 100)
  const period = height * 2
  const pos = Math.abs(height - (t % period))
  return minHeight + (height - pos)
}

/** DirControl (attachedeffect.h) */
interface DirControl {
  onTop: boolean
  offset: Point
}

function makeDirControl(onTop: boolean = false, offset: Point = { x: 0, y: 0 }): DirControl {
  return { onTop, offset }
}

export class AttachedEffect implements IAttachedEffectLike {
  m_loop: number = -1
  m_speed: number = 100
  m_opacity: number = 100
  m_lastAnimation: number = 0
  m_drawOrder: DrawOrder = DrawOrder.THIRD
  m_id: number = 0
  m_duration: number = 0
  m_frame: number = 0
  m_hideOwner: boolean = false
  m_transform: boolean = false
  m_canDrawOnUI: boolean = true
  m_disableWalkAnimation: boolean = false
  m_permanent: boolean = false
  m_smooth: boolean = true
  m_followOwner: boolean = false
  m_thingId: number = 0
  m_thingCategory: ThingCategory = ThingCategory.ThingInvalidCategory
  m_size: Size = { width: 0, height: 0 }
  m_name: string = ''
  m_texturePath: string = ''
  m_light: Light = { intensity: 0, color: 0 }
  m_animationTimer: Timer = new Timer()
  m_direction: Otc.Direction = Otc.Direction.North
  m_offsetDirections: DirControl[] = []
  m_bounce: Bounce = { minHeight: 0, height: 0, speed: 0, timer: new Timer() }
  m_pulse: Bounce = { minHeight: 0, height: 0, speed: 0, timer: new Timer() }
  m_fade: Bounce = { minHeight: 0, height: 0, speed: 0, timer: new Timer() }
  m_effects: IAttachedEffectLike[] = []
  m_toPoint: Point = { x: 0, y: 0 }
  m_shader: unknown = null
  m_texture: unknown = null

  constructor() {
    for (let d = 0; d <= NORTHWEST_DIR; d++) {
      this.m_offsetDirections.push(makeDirControl(false, { x: 0, y: 0 }))
    }
  }

  static create(thingId: number, category: ThingCategory): AttachedEffect | null {
    const things = getThings()
    if (!things.types.isValidDatId(thingId, category as number)) {
      if (typeof console !== 'undefined') console.error('AttachedEffect::create: invalid thing with id or category.', thingId, category)
      return null
    }
    const obj = new AttachedEffect()
    obj.m_thingId = thingId
    obj.m_thingCategory = category
    return obj
  }

  getId(): number {
    return this.m_id
  }

  getSpeed(): number {
    return this.m_speed / 100
  }

  setSpeed(speed: number): void {
    this.m_speed = Math.round(speed * 100)
  }

  getOpacity(): number {
    return this.m_opacity / 100
  }

  setOpacity(opacity: number): void {
    this.m_opacity = Math.round(opacity * 100)
  }

  getSize(): Size {
    return this.m_size
  }

  setSize(s: Size): void {
    this.m_size = s
  }

  isHidedOwner(): boolean {
    return this.m_hideOwner
  }

  setHideOwner(v: boolean): void {
    this.m_hideOwner = v
  }

  isTransform(): boolean {
    return this.m_transform
  }

  setTransform(v: boolean): void {
    this.m_transform = v
  }

  isDisabledWalkAnimation(): boolean {
    return this.m_disableWalkAnimation
  }

  setDisableWalkAnimation(v: boolean): void {
    this.m_disableWalkAnimation = v
  }

  isPermanent(): boolean {
    return this.m_permanent
  }

  setPermanent(permanent: boolean): void {
    this.m_permanent = permanent
  }

  isFollowingOwner(): boolean {
    return this.m_followOwner
  }

  setFollowOwner(v: boolean): void {
    this.m_followOwner = v
  }

  getDuration(): number {
    return this.m_duration
  }

  setDuration(v: number): void {
    this.m_duration = v
  }

  getLoop(): number {
    return this.m_loop
  }

  setLoop(v: number): void {
    this.m_loop = v
  }

  setName(n: string): void {
    this.m_name = n
  }

  getName(): string {
    return this.m_name
  }

  getDirection(): Otc.Direction {
    return this.m_direction
  }

  setDirection(dir: Otc.Direction): void {
    this.m_direction = Math.min(dir as number, NORTHWEST_DIR) as Otc.Direction
  }

  setBounce(minHeight: number, height: number, speed: number): void {
    this.m_bounce = { minHeight, height, speed, timer: new Timer() }
  }

  setPulse(minHeight: number, height: number, speed: number): void {
    this.m_pulse = { minHeight, height, speed, timer: new Timer() }
  }

  setFade(start: number, end: number, speed: number): void {
    this.m_fade = { minHeight: start, height: end, speed, timer: new Timer() }
  }

  setOnTop(onTop: boolean): void {
    for (const control of this.m_offsetDirections) control.onTop = onTop
  }

  setOffset(x: number, y: number): void {
    for (const control of this.m_offsetDirections) control.offset = { x, y }
  }

  setOnTopByDir(direction: Otc.Direction, onTop: boolean): void {
    this.m_offsetDirections[direction as number] = makeDirControl(onTop, this.m_offsetDirections[direction as number]?.offset ?? { x: 0, y: 0 })
  }

  setDirOffset(direction: Otc.Direction, x: number, y: number, onTop: boolean = false): void {
    this.m_offsetDirections[direction as number] = makeDirControl(onTop, { x, y })
  }

  setShader(_name: string): void {
    // g_shaders not ported; no-op
  }

  setCanDrawOnUI(canDraw: boolean): void {
    this.m_canDrawOnUI = canDraw
  }

  canDrawOnUI(): boolean {
    return this.m_canDrawOnUI
  }

  move(fromPosition: Position, toPosition: Position): void {
    const spriteSize = g_gameConfig.getSpriteSize()
    this.m_toPoint = {
      x: (toPosition.x - fromPosition.x) * spriteSize,
      y: (toPosition.y - fromPosition.y) * spriteSize,
    }
    this.m_animationTimer.restart()
  }

  attachEffect(e: IAttachedEffectLike): void {
    this.m_effects.push(e)
  }

  getDrawOrder(): DrawOrder {
    return this.m_drawOrder
  }

  setDrawOrder(drawOrder: DrawOrder): void {
    this.m_drawOrder = drawOrder
  }

  getLight(): Light {
    return this.m_light
  }

  setLight(light: Light): void {
    this.m_light = light
  }

  getThingType(): ThingType | null {
    if (this.m_thingId <= 0) return null
    return getThings().types.getThingType(this.m_thingId, this.m_thingCategory as number)
  }

  clone(): AttachedEffect {
    const obj = new AttachedEffect()
    obj.m_loop = this.m_loop
    obj.m_speed = this.m_speed
    obj.m_opacity = this.m_opacity
    obj.m_lastAnimation = this.m_lastAnimation
    obj.m_drawOrder = this.m_drawOrder
    obj.m_id = this.m_id
    obj.m_duration = this.m_duration
    obj.m_frame = 0
    obj.m_hideOwner = this.m_hideOwner
    obj.m_transform = this.m_transform
    obj.m_canDrawOnUI = this.m_canDrawOnUI
    obj.m_disableWalkAnimation = this.m_disableWalkAnimation
    obj.m_permanent = this.m_permanent
    obj.m_smooth = this.m_smooth
    obj.m_followOwner = this.m_followOwner
    obj.m_thingId = this.m_thingId
    obj.m_thingCategory = this.m_thingCategory
    obj.m_size = { ...this.m_size }
    obj.m_name = this.m_name
    obj.m_texturePath = this.m_texturePath
    obj.m_light = { ...this.m_light }
    obj.m_direction = this.m_direction
    obj.m_bounce = { ...this.m_bounce, timer: new Timer() }
    obj.m_pulse = { ...this.m_pulse, timer: new Timer() }
    obj.m_fade = { ...this.m_fade, timer: new Timer() }
    obj.m_animationTimer.restart()
    obj.m_bounce.timer.restart()
    obj.m_pulse.timer.restart()
    obj.m_fade.timer.restart()
    for (let d = 0; d < this.m_offsetDirections.length; d++) {
      obj.m_offsetDirections[d] = makeDirControl(this.m_offsetDirections[d].onTop, { ...this.m_offsetDirections[d].offset })
    }
    return obj
  }

  private getCurrentAnimationPhase(): number {
    if (this.m_texture) {
      return this.m_frame
    }

    const thingType = this.getThingType()
    if (!thingType) return 0

    const animator = (thingType as { getIdleAnimator?: () => { getPhaseAt: (t: Timer, s: number) => number } | null }).getIdleAnimator?.() ?? (thingType as { getAnimator?: () => { getPhaseAt: (t: Timer, s: number) => number } | null }).getAnimator?.()
    if (animator && typeof animator.getPhaseAt === 'function') {
      return animator.getPhaseAt(this.m_animationTimer, this.getSpeed())
    }

    const cat = thingType.getCategory?.()
    const isEffect = cat === 2
    const isCreature = cat === 1
    const phases = thingType.getAnimationPhases?.() ?? 0

    if (isEffect && phases > 0) {
      const lastPhase = phases - 1
      const phase = Math.min(Math.floor(this.m_animationTimer.ticksElapsed() / (g_gameConfig.getEffectTicksPerFrame() / this.getSpeed())), lastPhase)
      if (phase === lastPhase) this.m_animationTimer.restart()
      return phase
    }

    if (isCreature && (thingType as { isAnimateAlways?: () => boolean }).isAnimateAlways?.() && phases > 0) {
      const ticksPerFrame = Math.round(1000 / phases) / this.getSpeed()
      const now = typeof performance !== 'undefined' ? performance.now() : Date.now()
      return Math.floor((now % (ticksPerFrame * phases)) / ticksPerFrame)
    }

    return 0
  }

  private isToPointNull(): boolean {
    return this.m_toPoint.x === 0 && this.m_toPoint.y === 0
  }

  private sizeIsUnset(): boolean {
    return this.m_size.width === 0 && this.m_size.height === 0
  }

  draw(dest: Point, isOnTop: boolean, lightView: LightView | null, drawThing: boolean = true): void {
    if (this.m_transform) return

    const thingType = this.getThingType()
    if (this.m_texture != null || thingType != null) {
      const dirControl = this.m_offsetDirections[this.m_direction as number] ?? makeDirControl(false, { x: 0, y: 0 })
      if (dirControl.onTop !== isOnTop) return

      if (!this.m_canDrawOnUI && g_drawPool.getCurrentType() === DrawPoolType.FOREGROUND) return

      const animation = this.getCurrentAnimationPhase()
      if (this.m_loop > -1) {
        if (animation !== this.m_lastAnimation) {
          this.m_lastAnimation = animation
          if (animation === 0) {
            this.m_loop -= 1
            if (this.m_loop === 0) return
          }
        }
      }

      if (!this.m_texture && thingType && (thingType.isNull?.() || thingType.getAnimationPhases?.() === 0)) return

      if (!g_drawPool.isValid()) return
      const scaleFactor = g_drawPool.getScaleFactor()

      if (drawThing) {
        if (this.m_shader) g_drawPool.setShaderProgram(this.m_shader, true)
        if (this.m_opacity < 100) g_drawPool.setOpacity(this.getOpacity(), true)
        if (this.m_pulse.height > 0 && this.m_pulse.speed > 0) {
          g_drawPool.setScaleFactor(scaleFactor + getBounceValue(this.m_pulse, scaleFactor) / 100)
        }
        if (this.m_fade.height > 0 && this.m_fade.speed > 0) {
          const fadeVal = Math.max(0, Math.min(1, getBounceValue(this.m_fade, scaleFactor) / 100))
          g_drawPool.setOpacity(fadeVal, true)
        }
      }

      let point: Point = {
        x: dest.x - (dirControl.offset.x * scaleFactor),
        y: dest.y - (dirControl.offset.y * scaleFactor),
      }
      if (!this.isToPointNull()) {
        const fraction = Math.min(this.m_animationTimer.ticksElapsed() / Math.max(1, this.m_duration), 1)
        point = {
          x: point.x + this.m_toPoint.x * fraction * scaleFactor,
          y: point.y + this.m_toPoint.y * fraction * scaleFactor,
        }
      }
      if (this.m_bounce.height > 0 && this.m_bounce.speed > 0) {
        const bounceOff = getBounceValue(this.m_bounce, scaleFactor)
        point = { x: point.x - bounceOff, y: point.y - bounceOff }
      }

      if (lightView && this.m_light.intensity > 0 && typeof (lightView as { addLightSource?: (d: Point, l: Light) => void }).addLightSource === 'function') {
        ;(lightView as { addLightSource: (d: Point, l: Light) => void }).addLightSource(dest, this.m_light)
      }

      const lastDrawOrder = g_drawPool.getDrawOrder()
      if (g_drawPool.getCurrentType() === DrawPoolType.MAP) {
        g_drawPool.setDrawOrder(this.getDrawOrder() as any)
      }

      if (this.m_texture) {
        // Texture path: not porting full texture/animated texture; skip draw
      } else if (thingType) {
        const destObj = {
          tileX: 0,
          tileY: 0,
          drawElevationPx: 0,
          tileZ: 0,
          pixelOffsetX: point.x,
          pixelOffsetY: point.y,
          frameGroupIndex: 0,
        }
        thingType.draw(destObj, 0, this.m_direction as number, 0, 0, animation, Color.white, drawThing, lightView)
      }

      g_drawPool.setDrawOrder(lastDrawOrder as any)

      if (drawThing) {
        if (this.m_pulse.height > 0 && this.m_pulse.speed > 0) {
          g_drawPool.setScaleFactor(scaleFactor)
        }
        if (this.m_fade.height > 0 && this.m_fade.speed > 0) {
          g_drawPool.resetOpacity()
        }
      }
    }

    if (drawThing) {
      for (const effect of this.m_effects) {
        effect.draw(dest, isOnTop, lightView, true)
      }
    }
  }

  drawLight(dest: Point, lightView: LightView | null): void {
    if (!lightView) return
    const dirControl = this.m_offsetDirections[this.m_direction as number] ?? makeDirControl(false, { x: 0, y: 0 })
    this.draw(dest, dirControl.onTop, lightView, false)
    for (const effect of this.m_effects) {
      effect.drawLight(dest, lightView)
    }
  }
}
