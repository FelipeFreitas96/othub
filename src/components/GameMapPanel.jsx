// ui/components/GameMapPanel.jsx
import { useEffect, useRef } from 'react'
import { UIMap } from '../services/client/UIMap'
import { DrawPoolType } from '../services/graphics/DrawPool'
import { loadThings } from '../services/protocol/things'
import { g_map } from '../services/client/ClientMap'
import { g_drawPool } from '../services/graphics/DrawPoolManager'
import { useWalkController } from '../modules/game_walk'
import { g_graphics } from '../services/graphics/Graphics'
import { g_player } from '../services/client/LocalPlayer'

const IMG = { panelMap: '/images/ui/panel_map.png' }

export default function GameMapPanel() {
  const hostRef = useRef(null)
  const uiMapRef = useRef(null)

  // Initialize walk controller (handles WASD, arrows, numpad)
  useWalkController()

  useEffect(() => {
    const host = hostRef.current
    if (!host) return

    // Ensure draw pools are initialized (idempotent; also called at module level and in App.jsx)
    g_drawPool.init(32)

    // UIMap owns MapView and registers with g_map (OTC: m_drawDimension 18x14)
    uiMapRef.current = new UIMap(host, 18, 14)
    uiMapRef.current.followCreature(g_player)

    const ensureFollow = () => {
      const mapView = uiMapRef.current?.getMapView?.()
      if (!mapView) return
      if (mapView.getFollowingCreature?.() !== g_player) {
        uiMapRef.current?.followCreature?.(g_player)
      }
    }

    const drawAllPanesAndRender = () => {
      if (!uiMapRef.current || !host) return
      const w = host.clientWidth ?? 0
      const h = host.clientHeight ?? 0
      if (w <= 0 || h <= 0) return
      g_graphics.setViewport(w, h)
      uiMapRef.current.draw(DrawPoolType.MAP)
      uiMapRef.current.draw(DrawPoolType.LIGHT)
      uiMapRef.current.draw(DrawPoolType.CREATURE_INFORMATION)
      uiMapRef.current.draw(DrawPoolType.FOREGROUND_MAP)
      g_drawPool.draw()
    }

    if (g_map.center?.x != null) {
      drawAllPanesAndRender()
    }

    loadThings(860).then(() => {
      if (uiMapRef.current && g_map.center?.x != null) {
        drawAllPanesAndRender()
      }
    })

    const onMap = () => {
      ensureFollow()
      uiMapRef.current?.getMapView()?.requestUpdateVisibleTiles()
      drawAllPanesAndRender()
    }

    const onMapMove = () => {
      ensureFollow()
      drawAllPanesAndRender()
    }

    // ResizeObserver: atualiza viewport e resize do MapView para o próximo draw
    const resizeObserver = new ResizeObserver(() => {
      if (uiMapRef.current && host && host.clientWidth > 0 && host.clientHeight > 0) {
        g_graphics.setViewport(host.clientWidth, host.clientHeight)
        uiMapRef.current.getMapView().resize(host)
      }
    })
    resizeObserver.observe(host)

    window.addEventListener('ot:map', onMap)
    window.addEventListener('ot:mapMove', onMapMove)

    let raf = 0
    const loop = () => {
      raf = requestAnimationFrame(loop)
      const hasCenter = g_map.center?.x != null
      if (uiMapRef.current && hasCenter) {
        drawAllPanesAndRender()
      }
    }
    loop()

    return () => {
      cancelAnimationFrame(raf)
      resizeObserver.disconnect()
      window.removeEventListener('ot:map', onMap)
      window.removeEventListener('ot:mapMove', onMapMove)
      uiMapRef.current?.dispose()
      uiMapRef.current = null
      host.innerHTML = ''
    }
  }, [])

  return (
    <div
      className="flex-1 min-w-0 m-0.5 p-1 overflow-hidden flex items-center justify-center bg-no-repeat bg-cover bg-center border-4 border-ot-border"
      style={{ backgroundImage: `url('${IMG.panelMap}')` }}
    >
      <div ref={hostRef} className="w-full h-full bg-ot-dark/80" />
    </div>
  )
}
