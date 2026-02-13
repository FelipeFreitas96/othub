/**
 * Performance stats overlay – rendered when "Show frame rate" is enabled.
 * Displays FPS, object count, creatures, and other render details in the left corner.
 */
import { useEffect, useState, useRef } from 'react'
import { getClientOptions, subscribeClientOptions } from '../modules/client_options/service/optionsService'
import { g_map } from '../services/client/ClientMap'
import { g_drawPool } from '../services/graphics/DrawPoolManager'
import { g_game } from '../services/client/Game'
import { g_graphics } from '../services/graphics/Graphics'

const FPS_SAMPLES = 30

function getStats() {
  const creatures = g_map?.creatures ?? g_map?.m_knownCreatures
  const creatureCount = creatures?.size ?? 0
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
  }
}

export default function PerformanceStatsOverlay() {
  const [options, setOptions] = useState(() => getClientOptions())
  const [stats, setStats] = useState(getStats)
  const [fps, setFps] = useState(0)
  const frameTimesRef = useRef([])
  const lastTimeRef = useRef(0)
  const rafRef = useRef(0)

  useEffect(() => {
    return subscribeClientOptions((opts) => setOptions(opts ?? getClientOptions()))
  }, [])

  useEffect(() => {
    if (!options?.showFps) return

    const tick = (now) => {
      rafRef.current = requestAnimationFrame(tick)
      const dt = now - lastTimeRef.current
      lastTimeRef.current = now
      if (dt > 0 && dt < 1000) {
        const times = frameTimesRef.current
        times.push(dt)
        if (times.length > FPS_SAMPLES) times.shift()
        const avg = times.reduce((a, b) => a + b, 0) / times.length
        setFps(Math.round(1000 / avg))
      }
      setStats(getStats())
    }
    lastTimeRef.current = performance.now()
    rafRef.current = requestAnimationFrame(tick)
    return () => {
      cancelAnimationFrame(rafRef.current)
    }
  }, [options?.showFps])

  if (!options?.showFps) return null

  const poolEntries = Object.entries(stats.poolBreakdown || {})

  const lines = [
    `FPS: ${fps}`,
    `Draw objs: ${stats.drawObjectCount}`,
    `Creatures: ${stats.creatureCount}`,
    `Tiles: ${stats.tileCount}`,
    `Missiles: ${stats.missileCount}`,
    `Animated Text: ${stats.animatedTextCount}`,
    `Static Text: ${stats.staticTextCount}`,
    ...poolEntries.map(([k, v]) => `  ${k}: ${v}`),
    `Viewport: ${stats.viewportWidth}×${stats.viewportHeight}`,
    stats.ping >= 0 ? `Ping: ${stats.ping}ms` : null,
  ].filter(Boolean)

  return (
    <div
      className="absolute left-2 top-2 z-20 pointer-events-none font-mono text-[11px] leading-tight
        bg-black/75 text-green-400 border border-green-600/50 rounded px-2 py-1.5 shadow-lg"
      style={{ minWidth: '160px' }}
    >
      <div className="text-green-300 font-semibold text-[10px] uppercase tracking-wider mb-1">
        Render Stats
      </div>
      {lines.map((line, i) => (
        <div key={i} className="text-green-400/95">
          {line}
        </div>
      ))}
    </div>
  )
}
