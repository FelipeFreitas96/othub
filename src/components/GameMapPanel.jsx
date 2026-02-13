// ui/components/GameMapPanel.jsx
import { useEffect, useRef, useState } from 'react'
import { UIMap } from '../services/client/UIMap'
import { DrawPoolType } from '../services/graphics/DrawPool'
import { loadThings } from '../services/protocol/things'
import { g_map } from '../services/client/ClientMap'
import { g_drawPool } from '../services/graphics/DrawPoolManager'
import { g_painter } from '../services/graphics/Painter'
import { useWalkController } from '../modules/game_walk'
import { g_graphics } from '../services/graphics/Graphics'
import { g_player } from '../services/client/LocalPlayer'
import { g_game } from '../services/client/Game'
import ContextMenu, { ContextMenuItem, ContextMenuSeparator } from './ContextMenu'
import PerformanceStatsOverlay from './PerformanceStatsOverlay'
import { getClientOptions, subscribeClientOptions } from '../modules/client_options/service/optionsService'

const IMG = { panelMap: '/images/ui/panel_map.png' }

export default function GameMapPanel() {
  const hostRef = useRef(null)
  const uiMapRef = useRef(null)
  const [mapContextMenu, setMapContextMenu] = useState(null)
  const targetCreature = mapContextMenu?.attackCreature ?? mapContextMenu?.creatureThing ?? null
  const canWalkHere = !!mapContextMenu?.autoWalkPos
  const canLook = !!(mapContextMenu?.lookThing ?? mapContextMenu?.creatureThing ?? mapContextMenu?.useThing)
  const canUse = !!mapContextMenu?.useThing
  const canAttackOrFollow = !!targetCreature && !targetCreature?.isLocalPlayer?.()
  const hasCurrentTarget = g_game.isAttacking?.() || g_game.isFollowing?.()
  const hasUtilityActions = canUse || canLook
  const hasCreatureActions = canAttackOrFollow || hasCurrentTarget

  // Initialize walk controller (handles WASD, arrows, numpad)
  useWalkController()

  const closeMapContextMenu = () => setMapContextMenu(null)

  const executeMapMenuAction = (action) => {
    if (!mapContextMenu) return

    const targetCreature = mapContextMenu.attackCreature ?? mapContextMenu.creatureThing ?? null
    switch (action) {
      case 'walk':
        if (mapContextMenu.autoWalkPos) {
          g_player.stopAutoWalk?.()
          g_player.autoWalk?.(mapContextMenu.autoWalkPos)
        }
        break
      case 'use':
        if (mapContextMenu.useThing) g_game.use(mapContextMenu.useThing)
        break
      case 'look':
        if (mapContextMenu.lookThing) g_game.look(mapContextMenu.lookThing)
        else if (targetCreature) g_game.look(targetCreature)
        else if (mapContextMenu.useThing) g_game.look(mapContextMenu.useThing)
        break
      case 'attack':
        if (targetCreature) g_game.attack(targetCreature)
        break
      case 'follow':
        if (targetCreature) g_game.follow(targetCreature)
        break
      case 'cancel_target':
        g_game.cancelAttackAndFollow?.()
        break
      default:
        break
    }

    closeMapContextMenu()
  }

  useEffect(() => {
    const host = hostRef.current
    if (!host) return

    // Ensure draw pools are initialized (idempotent; also called at module level and in App.jsx)
    g_drawPool.init(32)
    g_painter.setUseTextureAtlas(!!getClientOptions().useTextureAtlas)

    // UIMap owns MapView and registers with g_map (OTC: m_drawDimension 18x14)
    uiMapRef.current = new UIMap(host, 18, 14)
    uiMapRef.current.followCreature(g_player)

    let crosshairCursorEnabled = !!getClientOptions().crosshairCursor
    const applyIdleCursor = () => {
      if (dragState.dragging) return
      host.style.cursor = crosshairCursorEnabled ? 'crosshair' : ''
    }

    const dragState = {
      active: false,
      dragging: false,
      startX: 0,
      startY: 0,
      thing: null,
    }

    const getMousePoint = (event) => {
      const rect = host.getBoundingClientRect()
      return {
        x: event.clientX - rect.left,
        y: event.clientY - rect.top,
      }
    }

    const isInsideHost = (clientX, clientY) => {
      const rect = host.getBoundingClientRect()
      return clientX >= rect.left && clientX <= rect.right && clientY >= rect.top && clientY <= rect.bottom
    }

    const resetDrag = () => {
      dragState.active = false
      dragState.dragging = false
      dragState.startX = 0
      dragState.startY = 0
      dragState.thing = null
      window.__otMapDragState = null
      window.__otDraggedMapThing = null
      applyIdleCursor()
    }

    const dropDraggedThing = (event) => {
      const uiMap = uiMapRef.current
      const thing = dragState.thing
      if (!uiMap || !thing || !isInsideHost(event.clientX, event.clientY)) return

      const point = getMousePoint(event)
      const tile = uiMap.getTile?.(point)
      const toPos = tile?.getPosition?.()
      const fromPos = thing.getPosition?.()
      if (!toPos || !fromPos || !fromPos.isValid?.()) return
      if (fromPos.x === toPos.x && fromPos.y === toPos.y && fromPos.z === toPos.z) return

      g_game.move(thing, toPos, 1)
    }

    const onMouseDown = (event) => {
      if (event.button !== 0) return
      setMapContextMenu(null)
      const uiMap = uiMapRef.current
      if (!uiMap) return

      const point = getMousePoint(event)
      uiMap.onMouseMove?.(point)
      const tile = uiMap.getTile?.(point)
      const thing = tile?.getTopMoveThing?.()
      if (!thing) return

      dragState.active = true
      dragState.dragging = false
      dragState.startX = event.clientX
      dragState.startY = event.clientY
      dragState.thing = thing
      window.__otMapDragState = {
        active: true,
        dragging: false,
        thing,
      }
    }

    const onMouseMove = (event) => {
      const uiMap = uiMapRef.current
      if (!uiMap) return

      if (isInsideHost(event.clientX, event.clientY)) {
        uiMap.onMouseMove?.(getMousePoint(event))
      }

      if (!dragState.active || dragState.dragging) return
      const dx = event.clientX - dragState.startX
      const dy = event.clientY - dragState.startY
      if ((dx * dx + dy * dy) < 9) return
      dragState.dragging = true
      if (window.__otMapDragState) {
        window.__otMapDragState.dragging = true
      }
      window.__otDraggedMapThing = dragState.thing
      host.style.cursor = 'grabbing'
    }

    const onMouseUp = (event) => {
      const inventoryDragState = window.__otInventoryDragState
      const draggedInventoryItem = window.__otDraggedInventoryItem
      if (event.button === 0 && inventoryDragState?.dragging && draggedInventoryItem) {
        if (isInsideHost(event.clientX, event.clientY)) {
          const point = getMousePoint(event)
          const tile = uiMapRef.current?.getTile?.(point)
          const toPos = tile?.getPosition?.()
          if (toPos?.isValid?.()) {
            event.preventDefault()
            g_game.move(draggedInventoryItem, toPos, 1)
          }
        }
        window.__otInventoryDragState = null
        window.__otDraggedInventoryItem = null
        document.body.style.cursor = ''
        return
      }

      if (event.button === 0 && dragState.active) {
        if (dragState.dragging) {
          event.preventDefault()
          dropDraggedThing(event)
        }
        // Let other modules (inventory slots) consume map drag first.
        window.setTimeout(() => resetDrag(), 0)
        return
      }
    }

    const onContextMenu = (event) => {
      if (!isInsideHost(event.clientX, event.clientY)) return
      event.preventDefault()
      const uiMap = uiMapRef.current
      if (!uiMap) return

      const mousePos = getMousePoint(event)
      uiMap.onMouseMove?.(mousePos)
      const autoWalkPos = uiMap.getPosition?.(mousePos)
      if (!autoWalkPos?.isValid?.()) {
        setMapContextMenu(null)
        return
      }

      const localPlayerPos = g_player.getPosition?.()
      if (localPlayerPos && autoWalkPos.z !== localPlayerPos.z) {
        const dz = autoWalkPos.z - localPlayerPos.z
        autoWalkPos.x += dz
        autoWalkPos.y += dz
        autoWalkPos.z = localPlayerPos.z
      }

      const tile = uiMap.getTile?.(mousePos)
      const autoWalkTile = g_map.getTile(autoWalkPos)
      const targetTile = autoWalkTile ?? tile
      const lookThing = targetTile?.getTopLookThing?.() ?? tile?.getTopLookThing?.() ?? null
      const useThing = targetTile?.getTopUseThing?.() ?? tile?.getTopUseThing?.() ?? null
      const creatureThing = targetTile?.getTopCreature?.(true) ?? tile?.getTopCreature?.(true) ?? null
      const attackCreature = targetTile?.getTopCreature?.(true) ?? null

      setMapContextMenu({
        x: event.clientX,
        y: event.clientY,
        lookThing,
        useThing,
        creatureThing,
        attackCreature,
        autoWalkPos,
      })
    }

    const onDragOver = (event) => {
      const draggedInventoryItem = window.__otDraggedInventoryItem
      if (!draggedInventoryItem) return
      if (!isInsideHost(event.clientX, event.clientY)) return
      event.preventDefault()
      if (event.dataTransfer) event.dataTransfer.dropEffect = 'move'
    }

    const onDrop = (event) => {
      const draggedInventoryItem = window.__otDraggedInventoryItem
      if (!draggedInventoryItem || !isInsideHost(event.clientX, event.clientY)) return
      event.preventDefault()
      setMapContextMenu(null)

      const uiMap = uiMapRef.current
      if (!uiMap) return
      const point = getMousePoint(event)
      const tile = uiMap.getTile?.(point)
      const toPos = tile?.getPosition?.()
      if (!toPos || !toPos.isValid?.()) return

      g_game.move(draggedInventoryItem, toPos, 1)
      window.__otDraggedInventoryItem = null
    }

    const onWindowDragOver = (event) => {
      const draggedInventoryItem = window.__otDraggedInventoryItem
      if (!draggedInventoryItem) return
      if (!isInsideHost(event.clientX, event.clientY)) return
      event.preventDefault()
      if (event.dataTransfer) event.dataTransfer.dropEffect = 'move'
    }

    const onWindowDrop = (event) => {
      const draggedInventoryItem = window.__otDraggedInventoryItem
      if (!draggedInventoryItem || !isInsideHost(event.clientX, event.clientY)) return
      event.preventDefault()
      setMapContextMenu(null)

      const uiMap = uiMapRef.current
      if (!uiMap) return
      const point = getMousePoint(event)
      const tile = uiMap.getTile?.(point)
      const toPos = tile?.getPosition?.()
      if (!toPos || !toPos.isValid?.()) return

      g_game.move(draggedInventoryItem, toPos, 1)
      window.__otDraggedInventoryItem = null
    }

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

    const unsubOptions = subscribeClientOptions((opts) => {
      g_painter.setUseTextureAtlas(!!opts?.useTextureAtlas)
      crosshairCursorEnabled = !!opts?.crosshairCursor
      applyIdleCursor()
    })
    applyIdleCursor()

    const onMap = () => {
      setMapContextMenu(null)
      ensureFollow()
      uiMapRef.current?.getMapView()?.requestUpdateVisibleTiles()
      drawAllPanesAndRender()
    }

    const onMapMove = () => {
      setMapContextMenu(null)
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
    host.addEventListener('mousedown', onMouseDown)
    host.addEventListener('contextmenu', onContextMenu)
    host.addEventListener('dragover', onDragOver)
    host.addEventListener('drop', onDrop)
    window.addEventListener('dragover', onWindowDragOver, true)
    window.addEventListener('drop', onWindowDrop, true)
    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)

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
      host.removeEventListener('mousedown', onMouseDown)
      host.removeEventListener('contextmenu', onContextMenu)
      host.removeEventListener('dragover', onDragOver)
      host.removeEventListener('drop', onDrop)
      window.removeEventListener('dragover', onWindowDragOver, true)
      window.removeEventListener('drop', onWindowDrop, true)
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
      resetDrag()
      unsubOptions()
      uiMapRef.current?.dispose()
      uiMapRef.current = null
      host.innerHTML = ''
    }
  }, [])

  return (
    <div
      className="flex-1 min-w-0 m-0.5 p-1 overflow-hidden flex items-center justify-center bg-no-repeat bg-cover bg-center border-4 border-ot-border relative"
      style={{ backgroundImage: `url('${IMG.panelMap}')` }}
    >
      <div ref={hostRef} className="w-full h-full bg-ot-dark/80" />
      <PerformanceStatsOverlay />
      <ContextMenu open={mapContextMenu} onClose={closeMapContextMenu}>
        {canWalkHere && (
          <ContextMenuItem onClick={() => executeMapMenuAction('walk')}>
            Walk Here
          </ContextMenuItem>
        )}
        {hasUtilityActions && canWalkHere && <ContextMenuSeparator />}
        {canUse && (
          <ContextMenuItem onClick={() => executeMapMenuAction('use')}>
            Use
          </ContextMenuItem>
        )}
        {canLook && (
          <ContextMenuItem onClick={() => executeMapMenuAction('look')}>
            Look
          </ContextMenuItem>
        )}
        {hasCreatureActions && (canWalkHere || hasUtilityActions) && <ContextMenuSeparator />}
        {canAttackOrFollow && (
          <ContextMenuItem onClick={() => executeMapMenuAction('attack')}>
            Attack
          </ContextMenuItem>
        )}
        {canAttackOrFollow && (
          <ContextMenuItem onClick={() => executeMapMenuAction('follow')}>
            Follow
          </ContextMenuItem>
        )}
        {hasCurrentTarget && canAttackOrFollow && <ContextMenuSeparator />}
        {hasCurrentTarget && (
          <ContextMenuItem onClick={() => executeMapMenuAction('cancel_target')}>
            Cancel Target
          </ContextMenuItem>
        )}
      </ContextMenu>
    </div>
  )
}
