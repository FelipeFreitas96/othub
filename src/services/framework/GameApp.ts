/**
 * GameApp – OTC GraphicalApplication.
 * Exposes mustOptimize(), getFps(), etc. for FPS-based optimizations (animated text, static text, effects).
 */
import { getClientOptions, updateClientOptions } from '../../modules/client_options/service/optionsService'

const FPS_SAMPLES = 30

let m_frameTimes: number[] = []
let m_lastTime = 0
let m_fps = 0
let m_interval = 0

/** Call once per frame from the main render loop. */
export function updateFrame(): void {
  const now = typeof performance !== 'undefined' ? performance.now() : Date.now()
  const dt = m_lastTime > 0 ? now - m_lastTime : 0
  m_lastTime = now
  if (dt > 0 && dt < 1000) {
    m_frameTimes.push(dt)
    if (m_frameTimes.length > FPS_SAMPLES) m_frameTimes.shift()
  }
  const tick = typeof performance !== 'undefined' ? performance.now() : Date.now()
  if (tick - m_interval >= 1000) {
    m_interval = tick
    const avg = m_frameTimes.length ? m_frameTimes.reduce((a, b) => a + b, 0) / m_frameTimes.length : 0
    m_fps = avg > 0 ? Math.round(1000 / avg) : 0
    m_frameTimes = []
  }
}

export function getFps(): number {
  return m_fps
}

/** OTC: getMaxFps – background frame rate limit (501 = uncapped). */
export function getMaxFps(): number {
  const v = getClientOptions().backgroundFrameRate ?? 501
  return typeof v === 'number' ? v : 501
}

/** OTC: mustOptimize() – true when optimizeFps is on AND FPS is below 58. */
export function mustOptimize(): boolean {
  const opts = getClientOptions()
  if (!opts?.optimizeFps) return false
  return getMaxFps() >= m_fps && m_fps > 0 && m_fps < 58
}

/** OTC: optimize(bool) – set option. */
export function setOptimizeFps(v: boolean): void {
  updateClientOptions({ optimizeFps: v })
}

export const g_app = {
  mustOptimize,
  getFps,
  getMaxFps,
  updateFrame,
  setOptimizeFps,
}
