// ui/components/GameMapPanel.jsx
import { useEffect, useRef } from 'react'
import { MapView } from '../services/client/MapView'
import { getThings, loadThings } from '../services/protocol/things'
import { g_map } from '../services/client/ClientMap'
import { useWalkController } from './modules/game_walk'

const IMG = { panelMap: '/images/ui/panel_map.png' }

export default function GameMapPanel() {
  const hostRef = useRef(null)
  const mapViewRef = useRef(null)

  // Initialize walk controller (handles WASD, arrows, numpad)
  useWalkController()

  useEffect(() => {
    const host = hostRef.current
    if (!host) return

    const thingsRef = { current: getThings() }

    // MapView usa a área aware completa (18x14) para processar tiles
    // O zoom da câmera do Three.js ajusta para mostrar apenas a área visível (15x11)
    mapViewRef.current = new MapView({ host, w: 18, h: 14, thingsRef })
    g_map.addMapView(mapViewRef.current)
    
    if (g_map.center?.x != null) {
      mapViewRef.current.requestVisibleTilesCacheUpdate()
    }

    loadThings(860).then((t) => {
      thingsRef.current = t
      if (mapViewRef.current && g_map.center?.x != null) {
        mapViewRef.current.requestVisibleTilesCacheUpdate()
        mapViewRef.current.draw()
      }
    })

    const onMap = () => {
      mapViewRef.current?.requestVisibleTilesCacheUpdate()
      mapViewRef.current?.draw()
    }

    const onMapMove = () => {
      if (!g_map?.center || !mapViewRef.current) return
      mapViewRef.current.requestVisibleTilesCacheUpdate()
    }

    // ResizeObserver para atualizar o fit quando o container mudar de tamanho
    const resizeObserver = new ResizeObserver(() => {
      if (mapViewRef.current && host) {
        mapViewRef.current.resize(host)
      }
    })
    resizeObserver.observe(host)

    window.addEventListener('ot:map', onMap)
    window.addEventListener('ot:mapMove', onMapMove)

    let raf = 0
    const loop = () => {
      if (mapViewRef.current) {
        mapViewRef.current.draw()
        mapViewRef.current.render()
      }
      raf = requestAnimationFrame(loop)
    }
    loop()

    return () => {
      cancelAnimationFrame(raf)
      resizeObserver.disconnect()
      window.removeEventListener('ot:map', onMap)
      window.removeEventListener('ot:mapMove', onMapMove)
      g_map.removeMapView(mapViewRef.current)
      mapViewRef.current?.dispose()
      mapViewRef.current = null
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
