/**
 * EventDispatcher – port of OTClient src/framework/core/eventdispatcher.h + eventdispatcher.cpp
 * Copyright (c) 2010-2026 OTClient; ported to JS for this project.
 *
 * OTC: addEvent(callback) = executa no próximo poll() (próximo frame do loop).
 *      scheduleEvent(callback, delayMs) = executa após delay; processado em poll() (executeScheduledEvents).
 *      poll() = executeEvents + executeScheduledEvents (sem setTimeout/setInterval).
 */

export interface ScheduledEventHandle {
  cancel(): void
}

interface ScheduledEntry {
  callback: () => void
  runAt: number
  canceled: boolean
}

export class EventDispatcher {
  /** Eventos addEvent – executados no próximo poll(). */
  private m_eventList: (() => void)[] = []
  /** Eventos agendados (scheduleEvent) – processados em poll() quando runAt <= now. */
  private m_scheduled: ScheduledEntry[] = []
  private m_disabled = false

  /** OTC: addEvent(callback) – agenda para rodar no próximo poll() (próximo frame). */
  addEvent(callback: () => void): void {
    if (this.m_disabled) return
    this.m_eventList.push(callback)
  }

  /** OTC: scheduleEvent(callback, delayMs) – agenda para rodar após delay; executado em poll() quando o tempo vence. */
  scheduleEvent(callback: () => void, delayMs: number): ScheduledEventHandle {
    if (this.m_disabled) {
      return { cancel() {} }
    }
    const runAt = Date.now() + Math.max(0, delayMs)
    const entry: ScheduledEntry = { callback, runAt, canceled: false }
    this.m_scheduled.push(entry)
    return {
      cancel: () => {
        entry.canceled = true
      },
    }
  }

  /**
   * OTC: poll() – executeEvents + executeScheduledEvents (sem Node/OTC timer).
   * Chamado no início de MapView.draw(); eventos agendados rodam quando Date.now() >= runAt.
   */
  poll(): void {
    const now = Date.now()

    const events = this.m_eventList
    this.m_eventList = []
    for (const fn of events) {
      try {
        fn()
      } catch (e) {
        if (typeof console !== 'undefined') console.error('[EventDispatcher] addEvent callback error:', e)
      }
    }

    const toRun: (() => void)[] = []
    this.m_scheduled = this.m_scheduled.filter((entry) => {
      if (entry.canceled) return false
      if (now >= entry.runAt) {
        toRun.push(entry.callback)
        return false
      }
      return true
    })
    for (const fn of toRun) {
      try {
        fn()
      } catch (e) {
        if (typeof console !== 'undefined') console.error('[EventDispatcher] scheduleEvent callback error:', e)
      }
    }
  }

  /** OTC: shutdown() – desabilita e limpa. */
  shutdown(): void {
    this.m_disabled = true
    this.m_eventList = []
    this.m_scheduled = []
  }
}

/** Singleton: instância única do dispatcher (OTC: g_dispatcher). */
export const g_dispatcher = new EventDispatcher()
