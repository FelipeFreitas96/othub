/*
 * OTC client event names (emit in service, listen in frontend).
 * Replace Lua callbacks / script hooks with CustomEvent.
 */

export const OTCLIENT_EVENT_PREFIX = 'otclient:'

export const AttachedEffectOnAttach = OTCLIENT_EVENT_PREFIX + 'attachedEffectOnAttach'
export const AttachedEffectOnDetach = OTCLIENT_EVENT_PREFIX + 'attachedEffectOnDetach'
export const WidgetAttached = OTCLIENT_EVENT_PREFIX + 'widgetAttached'
export const WidgetDetached = OTCLIENT_EVENT_PREFIX + 'widgetDetached'

/**
 * Emit a client event (replaces Lua callbacks).
 */
export function dispatchClientEvent(eventName: string, detail: unknown): void {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(eventName, { detail }))
  }
}
