// ui/components/GameMapPanel.jsx
import { useEffect, useRef } from 'react'
import { MapView } from '../services/render/MapView.js'
import { getThings, loadThings } from '../services/things/things.js'
import { sendMove, GAME_CLIENT_OPCODES, OPCODE_TO_DIRECTION } from '../services/protocol/gameProtocol.js'
import { isFeatureEnabled } from '../services/protocol/features.js'
import { localPlayer } from '../services/game/LocalPlayer.js'
import { getMapStore } from '../services/protocol/mapStore.js'

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
    const mapStore = getMapStore()

    mapViewRef.current = new MapView({ host, w: 18, h: 14, thingsRef })
    if (mapStore.center?.x != null) {
      mapViewRef.current.setMapState(mapStore.getMapStateForView())
      mapViewRef.current.requestVisibleTilesCacheUpdate()
    }

    loadThings(860).then((t) => {
      thingsRef.current = t
      if (mapViewRef.current && mapStore.center?.x != null) {
        mapViewRef.current.setMapState(mapStore.getMapStateForView())
        mapViewRef.current.draw()
      }
    })

    const onMap = () => {
      const state = getMapStore().getMapStateForView()
      mapViewRef.current?.setMapState(state)
      mapViewRef.current?.requestVisibleTilesCacheUpdate()
      mapViewRef.current?.draw()
    }

    const onMapMove = () => {
      const ms = getMapStore()
      if (!ms?.center || !mapViewRef.current) return
      mapViewRef.current.setMapState(ms.getMapStateForView())
      mapViewRef.current.requestVisibleTilesCacheUpdate()
    }

    const onKeyDown = (e) => {
      const opcode = WASD_TO_MOVE[e.code]
      if (opcode == null) return
      if (!localPlayer.canWalk(mapStore)) return
      e.preventDefault()
      if (isFeatureEnabled('GameAllowPreWalk')) {
        const dir = OPCODE_TO_DIRECTION[opcode]
        if (dir != null) localPlayer.preWalk(dir)
      }
      sendMove(opcode)
    }

    window.addEventListener('ot:map', onMap)
    window.addEventListener('ot:mapMove', onMapMove)
    window.addEventListener('keydown', onKeyDown, true)

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
      window.removeEventListener('ot:map', onMap)
      window.removeEventListener('ot:mapMove', onMapMove)
      window.removeEventListener('keydown', onKeyDown, true)
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
