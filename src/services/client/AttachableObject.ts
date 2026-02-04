/*
 * Copyright (c) 2010-2026 OTClient <https://github.com/edubart/otclient>
 * Port 1:1 from attachableobject.h + attachableobject.cpp.
 * Widget attach: uses AttachableReactRef (React ref) instead of UIWidget.
 * Lua callbacks → dispatchClientEvent (eventNames).
 */

import type { Point } from './types'
import type { LightView } from './declarations'
import type { AttachableReactRef } from './declarations'
import { g_dispatcher } from '../framework/EventDispatcher'
import { dispatchClientEvent, AttachedEffectOnAttach, AttachedEffectOnDetach, WidgetAttached, WidgetDetached } from './eventNames'
import { g_drawPool } from '../graphics/DrawPoolManager'

/** Minimal interface for attached effect – implemented by AttachedEffect (attachedeffect.ts). */
export interface IAttachedEffectLike {
  getId(): number
  isHidedOwner(): boolean
  getDuration(): number
  isPermanent(): boolean
  isFollowingOwner(): boolean
  getLoop(): number
  draw(dest: Point, isOnTop: boolean, lightView: LightView | null, drawThing?: boolean): void
  drawLight(dest: Point, lightView: LightView | null): void
}

/** Stub for particle effect (no ParticleManager in TS). */
export interface IParticleEffectLike {
  getEffectType(): { getName(): string }
  render(): void
}

/** Attached widget entry: id + React ref (replaces UIWidgetPtr). */
export interface AttachedWidgetEntry {
  id: string
  ref: AttachableReactRef
}

export interface AttachableObjectData {
  attachedEffects: IAttachedEffectLike[]
  attachedParticles: IParticleEffectLike[]
  attachedWidgets: AttachedWidgetEntry[]
}

const EMPTY_ATTACHED_EFFECTS: IAttachedEffectLike[] = []
const EMPTY_ATTACHED_WIDGETS: AttachedWidgetEntry[] = []

export abstract class AttachableObject {
  protected m_data: AttachableObjectData | null = null
  protected m_ownerHidden: number = 0

  constructor() {}

  /** Destructor: clear effects, particles, widgets. */
  destroy(): void {
    this.clearAttachedEffects(true)
    this.clearAttachedParticlesEffect()
    this.clearAttachedWidgets(false)
  }

  /** Return this object for script/event payload (replaces attachedObjectToLuaObject). */
  abstract attachedObjectToLuaObject(): AttachableObject
  abstract isTile(): boolean
  abstract isThing(): boolean

  attachEffect(obj: IAttachedEffectLike | null): void {
    if (!obj) return

    this.onStartAttachEffect(obj)

    if (obj.isHidedOwner()) {
      this.m_ownerHidden += 1
    }

    if (obj.getDuration() > 0) {
      const self = this
      g_dispatcher.scheduleEvent(() => {
        self.detachEffect(obj)
      }, obj.getDuration())
    }

    this.getData().attachedEffects.push(obj)
    const self = this
    g_dispatcher.addEvent(() => {
      self.onDispatcherAttachEffect(obj)
      dispatchClientEvent(AttachedEffectOnAttach, {
        effect: obj,
        attachedObject: self.attachedObjectToLuaObject(),
      })
    })
  }

  detachEffect(obj: IAttachedEffectLike): boolean {
    if (!this.hasAttachedEffects()) return false
    const it = this.m_data!.attachedEffects.indexOf(obj)
    if (it === -1) return false
    this.onDetachEffect(this.m_data!.attachedEffects[it])
    this.m_data!.attachedEffects.splice(it, 1)
    return true
  }

  detachEffectById(id: number): boolean {
    if (!this.hasAttachedEffects()) return false
    const it = this.m_data!.attachedEffects.findIndex((o) => o.getId() === id)
    if (it === -1) return false
    this.onDetachEffect(this.m_data!.attachedEffects[it])
    this.m_data!.attachedEffects.splice(it, 1)
    return true
  }

  onStartAttachEffect(_effect: IAttachedEffectLike): void {}
  onDispatcherAttachEffect(_effect: IAttachedEffectLike): void {}
  onStartDetachEffect(_effect: IAttachedEffectLike): void {}

  isOwnerHidden(): boolean {
    return this.m_ownerHidden > 0
  }

  getAttachedEffects(): IAttachedEffectLike[] {
    return this.m_data ? this.m_data.attachedEffects : EMPTY_ATTACHED_EFFECTS
  }

  attachParticleEffect(name: string): void {
    const effect: IParticleEffectLike = {
      getEffectType: () => ({ getName: () => name }),
      render: () => {},
    }
    this.getData().attachedParticles.push(effect)
  }

  clearAttachedParticlesEffect(): void {
    if (this.m_data) {
      this.m_data.attachedParticles = []
    }
  }

  detachParticleEffectByName(name: string): boolean {
    if (!this.hasAttachedParticles()) return false
    const findFunc = (obj: IParticleEffectLike) => {
      const effectType = obj.getEffectType()
      return effectType ? effectType.getName() === name : false
    }
    const it = this.m_data!.attachedParticles.findIndex(findFunc)
    if (it === -1) return false
    this.m_data!.attachedParticles.splice(it, 1)
    return true
  }

  updateAndAttachParticlesEffects(newElements: string[]): void {
    if (!this.hasAttachedParticles()) return

    const toRemove: string[] = []
    for (const effect of this.m_data!.attachedParticles) {
      const findPos = newElements.indexOf(effect.getEffectType().getName())
      if (findPos === -1) {
        toRemove.push(effect.getEffectType().getName())
      } else {
        newElements.splice(findPos, 1)
      }
    }

    for (const name of toRemove) {
      this.detachParticleEffectByName(name)
    }
    for (const name of newElements) {
      this.attachParticleEffect(name)
    }
  }

  getAttachedWidgets(): AttachedWidgetEntry[] {
    return this.m_data ? this.m_data.attachedWidgets : EMPTY_ATTACHED_WIDGETS
  }

  hasAttachedWidgets(): boolean {
    return !!(this.m_data && this.m_data.attachedWidgets.length > 0)
  }

  hasAttachedEffects(): boolean {
    return !!(this.m_data && this.m_data.attachedEffects.length > 0)
  }

  hasAttachedParticles(): boolean {
    return !!(this.m_data && this.m_data.attachedParticles.length > 0)
  }

  isWidgetAttached(widget: AttachableReactRef): boolean {
    if (!this.hasAttachedWidgets()) return false
    return this.m_data!.attachedWidgets.some((obj) => obj.ref === widget)
  }

  attachWidget(widget: AttachableReactRef, id: string): void {
    if (!widget || this.isWidgetAttached(widget)) return
    this.getData().attachedWidgets.push({ id, ref: widget })
    dispatchClientEvent(WidgetAttached, { attachedObject: this, widgetId: id, ref: widget })
  }

  clearAttachedWidgets(callEvent: boolean): void {
    if (!this.hasAttachedWidgets()) return
    const oldList = this.m_data!.attachedWidgets
    this.m_data!.attachedWidgets = []

    for (const entry of oldList) {
      if (callEvent) {
        dispatchClientEvent(WidgetDetached, { attachedObject: this, widgetId: entry.id, ref: entry.ref })
      }
    }
  }

  detachWidgetById(id: string): boolean {
    if (!this.hasAttachedWidgets()) return false
    const it = this.m_data!.attachedWidgets.findIndex((obj) => obj.id === id)
    if (it === -1) return false
    const entry = this.m_data!.attachedWidgets[it]
    this.m_data!.attachedWidgets.splice(it, 1)
    dispatchClientEvent(WidgetDetached, { attachedObject: this, widgetId: entry.id, ref: entry.ref })
    return true
  }

  detachWidget(widget: AttachableReactRef): boolean {
    if (!this.hasAttachedWidgets()) return false
    const it = this.m_data!.attachedWidgets.findIndex((obj) => obj.ref === widget)
    if (it === -1) return false
    const entry = this.m_data!.attachedWidgets[it]
    this.m_data!.attachedWidgets.splice(it, 1)
    dispatchClientEvent(WidgetDetached, { attachedObject: this, widgetId: entry.id, ref: entry.ref })
    return true
  }

  getAttachedWidgetById(id: string): AttachableReactRef | null {
    if (!this.hasAttachedWidgets()) return null
    const entry = this.m_data!.attachedWidgets.find((obj) => obj.id === id)
    return entry ? entry.ref : null
  }

  protected onDetachEffect(effect: IAttachedEffectLike, callEvent: boolean = true): void {
    if (effect.isHidedOwner()) {
      this.m_ownerHidden -= 1
    }
    this.onStartDetachEffect(effect)
    if (callEvent) {
      dispatchClientEvent(AttachedEffectOnDetach, {
        effect,
        attachedObject: this.attachedObjectToLuaObject(),
      })
    }
  }

  clearAttachedEffects(ignoreLuaEvent: boolean): void {
    if (!this.hasAttachedEffects()) return
    for (const e of this.m_data!.attachedEffects) {
      this.onDetachEffect(e, !ignoreLuaEvent)
    }
    this.m_data!.attachedEffects = []
  }

  clearTemporaryAttachedEffects(): void {
    if (!this.hasAttachedEffects()) return
    this.m_data!.attachedEffects = this.m_data!.attachedEffects.filter((obj) => {
      if (!obj.isPermanent()) {
        this.onDetachEffect(obj)
        return true
      }
      return false
    })
  }

  clearPermanentAttachedEffects(): void {
    if (!this.hasAttachedEffects()) return
    this.m_data!.attachedEffects = this.m_data!.attachedEffects.filter((obj) => {
      if (obj.isPermanent()) {
        this.onDetachEffect(obj)
        return true
      }
      return false
    })
  }

  getAttachedEffectById(id: number): IAttachedEffectLike | null {
    if (!this.hasAttachedEffects()) return null
    const it = this.m_data!.attachedEffects.find((o) => o.getId() === id)
    return it ?? null
  }

  drawAttachedEffect(originalDest: Point, dest: Point, lightView: LightView | null, isOnTop: boolean): void {
    if (!this.hasAttachedEffects()) return
    for (const effect of this.m_data!.attachedEffects) {
      const drawDest = effect.isFollowingOwner() ? dest : originalDest
      effect.draw(drawDest, isOnTop, lightView, true)
      if (effect.getLoop() === 0) {
        const self = this
        g_dispatcher.addEvent(() => {
          self.detachEffect(effect)
        })
      }
    }
  }

  drawAttachedLightEffect(dest: Point, lightView: LightView | null): void {
    if (!this.hasAttachedEffects()) return
    for (const effect of this.m_data!.attachedEffects) {
      effect.drawLight(dest, lightView)
    }
  }

  drawAttachedParticlesEffect(dest: Point): void {
    if (!this.hasAttachedParticles()) return
    if (!g_drawPool.isValid()) return
    g_drawPool.pushTransformMatrix()
    g_drawPool.translate(dest.x, dest.y)
    for (const effect of this.m_data!.attachedParticles) {
      effect.render()
    }
    g_drawPool.popTransformMatrix()
  }

  protected getData(): AttachableObjectData {
    if (!this.m_data) {
      this.m_data = {
        attachedEffects: [],
        attachedParticles: [],
        attachedWidgets: [],
      }
    }
    return this.m_data
  }
}
