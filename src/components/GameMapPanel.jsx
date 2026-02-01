// ui/components/GameMapPanel.jsx
import { useEffect, useRef } from 'react'
import { MapView } from '../services/client/MapView.js'
import { getThings, loadThings } from '../services/protocol/things.js'
import { sendMove, GAME_CLIENT_OPCODES, OPCODE_TO_DIRECTION } from '../services/client/ProtocolGameParse.js'
import { isFeatureEnabled } from '../services/protocol/features.js'
import { localPlayer } from '../services/game/LocalPlayer.js'
import { g_map } from '../services/client/ClientMap.js'

const IMG = { panelMap: '/images/ui/panel_map.png' }

const WASD_TO_MOVE = {
  KeyW: GAME_CLIENT_OPCODES.GameClientWalkNorth,
  KeyS: GAME_CLIENT_OPCODES.GameClientWalkSouth,
  KeyA: GAME_CLIENT_OPCODES.GameClientWalkWest,
  KeyD: GAME_CLIENT_OPCODES.GameClientWalkEast,
}

export default function GameMapPanel() {
  const hostRef = useRef(null)
  const mapViewRef = useRef(null)

  useEffect(() => {
    const host = hostRef.current
    if (!host) return

    const thingsRef = { current: getThings() }

    // MapView usa a área aware completa (18x14) para processar tiles
    // O zoom da câmera do Three.js ajusta para mostrar apenas a área visível (15x11)
    mapViewRef.current = new MapView({ host, w: 18, h: 14, thingsRef })
    g_map.addMapView(mapViewRef.current)
    
    if (g_map.center?.x != null) {
      mapViewRef.current.setMapState(g_map.getMapStateForView())
      mapViewRef.current.requestVisibleTilesCacheUpdate()
    }

    loadThings(860).then((t) => {
      thingsRef.current = t
      if (mapViewRef.current && g_map.center?.x != null) {
        mapViewRef.current.setMapState(g_map.getMapStateForView())
        mapViewRef.current.draw()
      }
    })

    const onMap = () => {
      const state = g_map.getMapStateForView()
      mapViewRef.current?.setMapState(state)
      mapViewRef.current?.requestVisibleTilesCacheUpdate()
      mapViewRef.current?.draw()
    }

    const onMapMove = () => {
      if (!g_map?.center || !mapViewRef.current) return
      mapViewRef.current.setMapState(g_map.getMapStateForView())
      mapViewRef.current.requestVisibleTilesCacheUpdate()
    }

    const keysHeld = new Set()

    const onKeyDown = (e) => {
      if (WASD_TO_MOVE[e.code]) {
        keysHeld.add(e.code)
        e.preventDefault()
      }
    }

    const onKeyUp = (e) => {
      if (WASD_TO_MOVE[e.code]) {
        keysHeld.delete(e.code)
        e.preventDefault()
      }
    }

    const processMovement = () => {
      if (keysHeld.size === 0) return

      // Pega a última tecla pressionada (ou a primeira do Set)
      const lastKey = Array.from(keysHeld).pop()
      const opcode = WASD_TO_MOVE[lastKey]
      
      if (opcode != null && localPlayer.canWalk()) {
        if (isFeatureEnabled('GameAllowPreWalk')) {
          const dir = OPCODE_TO_DIRECTION[opcode]
          if (dir != null) localPlayer.preWalk(dir)
        }
        sendMove(opcode)
      }
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
    window.addEventListener('keydown', onKeyDown, true)
    window.addEventListener('keyup', onKeyUp, true)

    let raf = 0
    const loop = () => {
      processMovement()
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
      window.removeEventListener('keydown', onKeyDown, true)
      window.removeEventListener('keyup', onKeyUp, true)
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
