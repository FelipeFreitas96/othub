/**
 * GameLoop – loop compartilhado para mapa + overlay.
 * Respeita backgroundFrameRate:
 * - 1–500: RAF + throttle (limita ao valor)
 * - 501: setTimeout(0) – uncapped, máximo que o PC conseguir (benchmark)
 */

import { getClientOptions } from '../../modules/client_options/service/optionsService'

type FrameCallback = (now: number) => void

const callbacks = new Set<FrameCallback>()
let loopId = 0
let isUncapped = false

let lastFrameJsMs = 0
let lastTickTime = 0

function cancelCurrent(): void {
  if (!loopId) return
  if (isUncapped) clearTimeout(loopId)
  else cancelAnimationFrame(loopId)
  loopId = 0
}

function runFrame(now: number): void {
  const t0 = performance.now()
  for (const cb of callbacks) cb(now)
  lastFrameJsMs = performance.now() - t0
}

function tickRaf(now: number): void {
  loopId = requestAnimationFrame(tickRaf)

  const limit = getClientOptions().backgroundFrameRate ?? 501
  const capped = typeof limit === 'number' && limit > 0 && limit < 501
  const frameBudgetMs = capped ? 1000 / limit : 0

  if (capped && lastTickTime > 0 && now - lastTickTime < frameBudgetMs) return
  lastTickTime = now

  runFrame(now)
}

function tickUncapped(): void {
  loopId = window.setTimeout(tickUncapped, 0) as unknown as number
  const now = performance.now()
  runFrame(now)
}

function schedule(): void {
  cancelCurrent()
  const limit = getClientOptions().backgroundFrameRate ?? 501
  isUncapped = limit >= 501

  if (isUncapped) {
    loopId = window.setTimeout(tickUncapped, 0) as unknown as number
  } else {
    loopId = requestAnimationFrame(tickRaf)
  }
}

/** Tempo total de JS no último frame (todos os callbacks). Se dt >> isso, o resto é GC/browser. */
export function getLastFrameJsMs(): number {
  return lastFrameJsMs
}

export function registerGameLoop(cb: FrameCallback): () => void {
  callbacks.add(cb)
  if (loopId === 0) schedule()
  return () => {
    callbacks.delete(cb)
    if (callbacks.size === 0) cancelCurrent()
  }
}

/** Reagendar loop quando backgroundFrameRate mudar (ex: options). */
export function rescheduleGameLoop(): void {
  if (callbacks.size === 0 || loopId === 0) return
  schedule()
}
