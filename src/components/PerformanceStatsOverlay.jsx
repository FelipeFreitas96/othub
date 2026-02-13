/**
 * Performance stats overlay – rendered when "Show frame rate" is enabled.
 * Uses ref + innerHTML for updates to avoid React re-renders (FPS improvement).
 * Shares RAF with GameMapPanel via GameLoop.
 */
import { useEffect, useState, useRef, memo } from 'react'
import { getClientOptions, subscribeClientOptions } from '../modules/client_options/service/optionsService'
import { g_map } from '../services/client/ClientMap'
import { g_drawPool } from '../services/graphics/DrawPoolManager'
import { g_painter } from '../services/graphics/Painter'
import { g_game } from '../services/client/Game'
import { g_graphics } from '../services/graphics/Graphics'
import { registerGameLoop, getLastFrameJsMs } from '../services/framework/GameLoop'
import {
  getRenderCount,
  resetRenderCount,
} from '../services/framework/RenderCounter'
import { getLastStallBreakdown } from '../services/framework/FrameProfiler'

const FPS_SAMPLES = 30
const UPDATE_THROTTLE_MS = 200
const STALL_THRESHOLD_MS = 25  // frame > 50ms = stall (dropped below ~20fps); 25ms era muito sensível a GC

function escapeHtml(s) {
  if (s == null) return ''
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function getStats() {
  const creatures = g_map?.creatures ?? g_map?.m_knownCreatures
  let creatureCount = 0
  if (creatures?.values) {
    for (const c of creatures.values()) if (c?.getTile?.()) creatureCount++
  }
  const tiles = g_map?.tiles ?? g_map?.m_tiles
  const tileCount = tiles?.size ?? 0

  let missileCount = 0
  const floors = g_map?.m_floors ?? {}
  for (const k of Object.keys(floors)) {
    const list = floors[k]?.missiles
    if (Array.isArray(list)) missileCount += list.length
  }

  const animatedTexts = g_map?.getAnimatedTexts?.() ?? g_map?.m_animatedTexts ?? []
  const staticTexts = g_map?.getStaticTexts?.() ?? g_map?.m_staticTexts ?? []
  const animatedTextCount = Array.isArray(animatedTexts) ? animatedTexts.length : 0
  const staticTextCount = Array.isArray(staticTexts) ? staticTexts.length : 0

  let drawObjectCount = 0
  let poolBreakdown = {}
  try {
    drawObjectCount = g_drawPool?.getTotalDrawObjectCount?.() ?? 0
    poolBreakdown = g_drawPool?.getDrawObjectCountByPool?.() ?? {}
  } catch (_) {}

  const viewport = g_graphics?.getViewport?.() ?? {}
  const ping = g_game?.getPing?.() ?? -1
  const atlasStats = g_painter?.getTextureAtlasStats?.() ?? null
  const renderCount = getRenderCount()

  return {
    creatureCount,
    tileCount,
    missileCount,
    animatedTextCount,
    staticTextCount,
    drawObjectCount,
    poolBreakdown,
    viewportWidth: viewport.width ?? 0,
    viewportHeight: viewport.height ?? 0,
    ping,
    atlasStats,
    renderCount,
  }
}

const HIGHLIGHT_DURATION_MS = 500

function PerformanceStatsOverlay() {
  const [options, setOptions] = useState(() => getClientOptions())
  const contentRef = useRef(null)
  const lastLinesRef = useRef([])
  const lastChangedAtRef = useRef({})
  const frameTimesRef = useRef([])
  const lastTimeRef = useRef(0)
  const lastUpdateRef = useRef(0)

  useEffect(() => {
    return subscribeClientOptions((opts) => setOptions(opts ?? getClientOptions()))
  }, [])

  useEffect(() => {
    if (!options?.showFps) return

    lastTimeRef.current = performance.now()
    lastUpdateRef.current = -UPDATE_THROTTLE_MS

    const unregister = registerGameLoop((now) => {
      const dt = now - lastTimeRef.current
      lastTimeRef.current = now
      if (dt > 0 && dt < 1000) {
        const times = frameTimesRef.current
        times.push(dt)
        if (times.length > FPS_SAMPLES) times.shift()
      }
      if (now - lastUpdateRef.current >= UPDATE_THROTTLE_MS && contentRef.current) {
        lastUpdateRef.current = now
        try {
        const times = frameTimesRef.current
        const avg = times.length ? times.reduce((a, b) => a + b, 0) / times.length : 0
        const fps = avg > 0 ? Math.round(1000 / avg) : 0
        const stats = getStats()
        const appRenders = stats.renderCount ?? 0
        resetRenderCount()
        const poolEntries = Object.entries(stats.poolBreakdown || {})
        const stalls = times.filter((t) => t > STALL_THRESHOLD_MS).length
        const maxMs = times.length ? Math.round(Math.max(...times)) : 0
        const jsMs = Math.round(getLastFrameJsMs())
        const stallBreakdown = getLastStallBreakdown()
        const breakdownLines = stallBreakdown
          ? [
              `[Stall ${stallBreakdown.totalMs}ms]`,
              `  MAP: ${stallBreakdown.mapDrawMs}ms (preLoad: ${stallBreakdown.mapPreLoadMs}ms, drawFloor: ${stallBreakdown.mapDrawFloorMs}ms)`,
              `  Light: ${stallBreakdown.lightMs}ms`,
              `  CreatureInfo: ${stallBreakdown.creatureInfoMs}ms`,
              `  Foreground: ${stallBreakdown.foregroundMs}ms`,
              `  DrawPool: ${stallBreakdown.drawPoolMs}ms`,
              `  (Stall >100ms → console mostra chunks por tile)`,
            ]
          : [
              '[Stall: -]',
              '  MAP: -',
              '  Light: -',
              '  CreatureInfo: -',
              '  Foreground: -',
              '  DrawPool: -',
            ]
        const lines = [
          `FPS: ${fps}`,
          `Stalls (>${STALL_THRESHOLD_MS}ms): ${stalls}`,
          `Max frame: ${maxMs}ms | JS: ~${jsMs}ms`,
          ...breakdownLines,
          stats.atlasStats != null ? `Atlas: ${stats.atlasStats}` : `Atlas: -`,
          `Re-renders (app): ${appRenders}`,
          `Draw calls: ${stats.drawObjectCount}`,
          `Creatures (on map): ${stats.creatureCount}`,
          `Tiles: ${stats.tileCount}`,
          `Missiles: ${stats.missileCount}`,
          `Animated Text: ${stats.animatedTextCount}`,
          `Static Text: ${stats.staticTextCount}`,
          ...poolEntries.map(([k, v]) => `  ${k}: ${v}`),
          `Viewport: ${stats.viewportWidth}×${stats.viewportHeight}`,
          stats.ping >= 0 ? `Ping: ${stats.ping}ms` : `Ping: -`,
        ]
        const lastLines = lastLinesRef.current
        const lastChangedAt = lastChangedAtRef.current
        const tNow = performance.now()
        const html =
          '<div class="perf-stats-title">Render Stats</div>' +
          lines.map((l, i) => {
            const changed = i >= lastLines.length || lastLines[i] !== l
            if (changed) lastChangedAt[i] = tNow
            const stillHighlight = lastChangedAt[i] != null && (tNow - lastChangedAt[i]) < HIGHLIGHT_DURATION_MS
            if (!stillHighlight && !changed) delete lastChangedAt[i]
            const cls = (changed || stillHighlight) ? 'perf-stats-line perf-stats-line-changed' : 'perf-stats-line'
            return `<div class="${cls}">${escapeHtml(l)}</div>`
          }).join('')
        lastLinesRef.current = [...lines]
        contentRef.current.innerHTML = html
        } catch (e) {
          if (typeof console !== 'undefined') console.error('[PerformanceStatsOverlay]', e)
          contentRef.current.innerHTML = '<div class="perf-stats-title">Render Stats</div><div class="perf-stats-line">Error</div>'
        }
      }
    })
    return () => unregister()
  }, [options?.showFps])

  if (!options?.showFps) return null

  return (
    <div
      className="absolute left-2 top-2 z-20 pointer-events-none font-mono text-[11px] leading-tight
        bg-black/75 text-green-400 border border-green-600/50 rounded px-2 py-1.5 shadow-lg
        perf-stats-container"
      style={{ minWidth: '160px' }}
    >
      <div ref={contentRef}>
        <div className="perf-stats-title">Render Stats</div>
        <div className="perf-stats-line">Loading...</div>
      </div>
    </div>
  )
}

export default memo(PerformanceStatsOverlay)
