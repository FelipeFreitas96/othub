/*
 * Copyright (c) 2010-2026 OTClient <https://github.com/edubart/otclient>
 * Port 1:1 from attachedeffectmanager.h + attachedeffectmanager.cpp
 */

import type { AttachedEffect } from './AttachedEffect'
import type { ThingCategory } from './Const'
import type { Bounce } from './StaticData'

/** OTC: stdext::map<uint16_t, AttachedEffectPtr> → Map<number, AttachedEffect> */
const m_effects = new Map<number, AttachedEffect>()

export function getAttachedEffectById(id: number): AttachedEffect | null {
  const obj = m_effects.get(id)
  if (!obj) {
    if (typeof console !== 'undefined') console.error('AttachedEffectManager::getById(' + id + '): not found.')
    return null
  }
  return obj.clone()
}

export function removeAttachedEffect(id: number): void {
  m_effects.delete(id)
}

export function clearAttachedEffects(): void {
  m_effects.clear()
}

export function registerAttachedEffectByThing(
  id: number,
  name: string,
  thingId: number,
  category: ThingCategory
): AttachedEffect | null {
  if (m_effects.has(id)) {
    if (typeof console !== 'undefined') console.error('AttachedEffectManager::registerByThing(' + id + ', ' + name + '): has already been registered.')
    return null
  }
  const obj = AttachedEffect.create(thingId, category)
  if (!obj) return null
  ;(obj as { m_id: number }).m_id = id
  ;(obj as { m_thingId: number }).m_thingId = thingId
  ;(obj as { m_thingCategory: ThingCategory }).m_thingCategory = category
  ;(obj as { m_name: string }).m_name = name
  m_effects.set(id, obj)
  return obj
}

export function registerAttachedEffectByImage(
  id: number,
  name: string,
  path: string,
  smooth: boolean
): AttachedEffect | null {
  if (m_effects.has(id)) {
    if (typeof console !== 'undefined') console.error('AttachedEffectManager::registerByImage(' + id + ', ' + name + '): has already been registered.')
    return null
  }
  const obj = new AttachedEffect()
  obj.m_texturePath = path
  obj.m_smooth = smooth
  obj.m_id = id
  obj.m_name = name
  m_effects.set(id, obj)
  return obj
}

/** Singleton (OTC: g_attachedEffects). */
export const g_attachedEffects = {
  getById: getAttachedEffectById,
  remove: removeAttachedEffect,
  clear: clearAttachedEffects,
  registerByThing: registerAttachedEffectByThing,
  registerByImage: registerAttachedEffectByImage,
}
