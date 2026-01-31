// ui/components/GameMapPanel.jsx
import { useEffect, useRef } from 'react'
import { MapView } from '../services/render/MapView.js'
import { getThings, loadThings } from '../services/things/things.js'
import { sendMove, GAME_CLIENT_OPCODES } from '../services/protocol/gameProtocol.js'

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
    const mapState = window.__otMapState

    mapViewRef.current = new MapView({ host, w: 18, h: 14, thingsRef })
    if (mapState) {
      mapViewRef.current.setMapState(mapState)
      mapViewRef.current.requestVisibleTilesCacheUpdate()
    }

    loadThings(mapState?.version || 860).then((t) => {
      thingsRef.current = t
      if (mapViewRef.current && mapState) {
        mapViewRef.current.setMapState(mapState)
        mapViewRef.current.draw()
      }
    })

    const onMap = (e) => {
      mapViewRef.current?.setMapState(e.detail)
      mapViewRef.current?.draw()
    }

    const onMapMove = (e) => {
      const mapStore = typeof window !== 'undefined' ? window.__otMapStore : null
      if (!mapStore?.center || !mapViewRef.current) return
      const { fromPos } = e?.detail ?? {}
      const playerId = typeof window !== 'undefined' ? window.__otPlayerId : null
      // 0x65–0x68: servidor só envia nova linha/coluna; jogador não está no tile novo. Precisamos atualizar tiles (skipTileUpdate = false) para não desincronizar.
      if (fromPos && playerId != null) {
        const playerData = mapStore.getCreature(playerId) || {}
        mapStore.startWalk(playerId, fromPos, mapStore.center, playerData, false)
      }
      const pos = mapStore.center
      const zMin = Math.max(0, pos.z - 2)
      const zMax = Math.min(15, pos.z + 2)
      const snap = mapStore.snapshotFloors(zMin, zMax)
      const current = snap.floors?.[pos.z] ?? mapStore.snapshotFloor(pos.z)
      mapViewRef.current.setMapState({
        pos,
        w: current.w,
        h: current.h,
        tiles: current.tiles,
        floors: snap.floors,
        zMin: snap.zMin,
        zMax: snap.zMax,
        range: mapStore.range,
        ts: Date.now(),
      })
      mapViewRef.current.requestVisibleTilesCacheUpdate()
    }

    const onKeyDown = (e) => {
      const opcode = WASD_TO_MOVE[e.code]
      if (opcode != null) {
        e.preventDefault()
        console.log('[WASD]', e.code, '-> sendMove', opcode)
        sendMove(opcode)
      }
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
