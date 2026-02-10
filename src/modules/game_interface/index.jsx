import { useState, useCallback, useRef, useEffect } from 'react'
import TopStatsBar from '../client_topmenu'
import GameMapPanel from '../../components/GameMapPanel'
import GameLeftPanel from '../../components/GameLeftPanel'
import GameRightPanel from '../../components/GameRightPanel'
import GameBottomPanel from '../../components/GameBottomPanel'
import BottomSplitter from '../../components/BottomSplitter'
import Minimap from '../game_minimap'
import Inventory from '../game_inventory'
import BattleList from '../game_battle'
import Skills from '../game_skills'
import Containers from '../game_containers'
import ClientOptions from '../client_options'

/**
 * Layout principal - gameinterface.otui
 * Cada módulo importa MiniWindow e define título/ícone; aqui só passamos props de layout.
 */
const WINDOW_IDS = {
  minimapWindow: Minimap,
  inventoryWindow: Inventory,
  battleWindow: BattleList,
  skillWindow: Skills,
  containersWindow: Containers,
  optionsWindow: ClientOptions,
}

export default function GameInterface() {
  const [bottomPanelHeight, setBottomPanelHeight] = useState(200)
  const [leftWindows, setLeftWindows] = useState(['minimapWindow', 'inventoryWindow'])
  const [rightWindows, setRightWindows] = useState(['battleWindow', 'skillWindow', 'containersWindow'])
  const [panelRects, setPanelRects] = useState({ left: null, right: null })
  const [positions, setPositions] = useState({ optionsWindow: { x: 220, y: 80 } })
  const [windowSizes, setWindowSizes] = useState({})
  const [windowOpen, setWindowOpen] = useState({})
  const leftPanelRef = useRef(null)
  const rightPanelRef = useRef(null)

  const MINI_WINDOW_DEFAULT_WIDTH = 192
  const MINI_WINDOW_DEFAULT_HEIGHT = 200

  const updatePanelRects = useCallback(() => {
    setPanelRects({
      left: leftPanelRef.current?.getBoundingClientRect() ?? null,
      right: rightPanelRef.current?.getBoundingClientRect() ?? null,
    })
  }, [])

  useEffect(() => {
    const ro = new ResizeObserver(updatePanelRects)
    const raf = requestAnimationFrame(() => {
      updatePanelRects()
      if (leftPanelRef.current) ro.observe(leftPanelRef.current)
      if (rightPanelRef.current) ro.observe(rightPanelRef.current)
    })
    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
    }
  }, [updatePanelRects, leftWindows, rightWindows])

  const handleSizeReport = useCallback((windowId, width, height) => {
    setWindowSizes((s) => {
      const prev = s[windowId]
      if (prev?.width === width && prev?.height === height) return s
      return { ...s, [windowId]: { width, height } }
    })
  }, [])

  const PANEL_PADDING = 8
  const PANEL_WINDOW_GAP = 4

  const getCenterXInPanel = useCallback((rect, windowId) => {
    const size = windowSizes[windowId]
    const w = size?.width ?? MINI_WINDOW_DEFAULT_WIDTH
    return Math.max(0, (rect.width - w) / 2)
  }, [windowSizes])

  const handleOpenChange = useCallback((windowId, open) => {
    setWindowOpen((prev) => ({ ...prev, [windowId]: open }))
  }, [])

  useEffect(() => {
    const onTopmenuToggleWindow = (event) => {
      const windowId = event?.detail?.windowId
      if (!windowId || !WINDOW_IDS[windowId]) return
      setWindowOpen((prev) => ({ ...prev, [windowId]: !(prev[windowId] ?? true) }))
    }
    window.addEventListener('ot:topmenuToggleWindow', onTopmenuToggleWindow)
    return () => window.removeEventListener('ot:topmenuToggleWindow', onTopmenuToggleWindow)
  }, [])

  /** Y do topo do slot no painel: painel vazio → topo (PANEL_PADDING); com elementos → topo do slot (acima/abaixo conforme getInsertIndex). */
  const getStackedY = useCallback((configs, index, sizes) => {
    let y = PANEL_PADDING
    for (let i = 0; i < index; i++) {
      const h = sizes[configs[i].id]?.height ?? MINI_WINDOW_DEFAULT_HEIGHT
      y += h + PANEL_WINDOW_GAP
    }
    return Math.round(y)
  }, [])

  /**
   * Índice onde inserir a janela ao soltar no painel:
   * - Painel vazio → 0 (topo).
   * - Soltar acima do centro de um elemento → inserir acima dele (retorna i).
   * - Soltar abaixo do centro de um elemento → inserir abaixo dele (retorna i+1).
   */
  const getInsertIndex = useCallback((panelRect, currentIds, clientY) => {
    if (!panelRect || currentIds.length === 0) return 0
    const configs = currentIds.map((id) => ({ id, Content: WINDOW_IDS[id] }))
    for (let i = 0; i < configs.length; i++) {
      const windowTop = panelRect.top + getStackedY(configs, i, windowSizes)
      const windowHeight = windowSizes[configs[i].id]?.height ?? MINI_WINDOW_DEFAULT_HEIGHT
      const windowMid = windowTop + windowHeight / 2
      if (clientY < windowMid) return i
    }
    return configs.length
  }, [getStackedY, windowSizes])

  const handleDock = useCallback((windowId, clientX, clientY, panelIdFromDrop, fixedLeft, fixedTop) => {
    const panel = panelIdFromDrop ?? (() => {
      const el = document.elementFromPoint(clientX, clientY)
      return el?.closest('[data-panel]')?.getAttribute('data-panel')
    })()

    if (panel === 'left') {
      setRightWindows((prev) => prev.filter((id) => id !== windowId))
      setLeftWindows((prev) => {
        const currentIds = prev.filter((id) => id !== windowId)
        const insertIndex = getInsertIndex(leftPanelRef.current?.getBoundingClientRect() ?? null, currentIds, clientY)
        return [...currentIds.slice(0, insertIndex), windowId, ...currentIds.slice(insertIndex)]
      })
      setPositions((p) => {
        const rect = leftPanelRef.current?.getBoundingClientRect()
        const x = rect ? getCenterXInPanel(rect, windowId) : PANEL_PADDING
        return { ...p, [windowId]: { x } }
      })
    } else if (panel === 'right') {
      setLeftWindows((prev) => prev.filter((id) => id !== windowId))
      setRightWindows((prev) => {
        const currentIds = prev.filter((id) => id !== windowId)
        const insertIndex = getInsertIndex(rightPanelRef.current?.getBoundingClientRect() ?? null, currentIds, clientY)
        return [...currentIds.slice(0, insertIndex), windowId, ...currentIds.slice(insertIndex)]
      })
      setPositions((p) => {
        const rect = rightPanelRef.current?.getBoundingClientRect()
        const x = rect ? getCenterXInPanel(rect, windowId) : PANEL_PADDING
        return { ...p, [windowId]: { x } }
      })
    } else {
      setLeftWindows((prev) => prev.filter((id) => id !== windowId))
      setRightWindows((prev) => prev.filter((id) => id !== windowId))
      const dropX = clientX - 90
      const dropY = clientY - 16
      setPositions((p) => ({ ...p, [windowId]: { x: Math.max(0, dropX), y: Math.max(0, dropY) } }))
    }
  }, [getCenterXInPanel, getInsertIndex])

  const handlePositionChange = useCallback((windowId, x, y) => {
    const inLeft = leftWindows.includes(windowId)
    const inRight = rightWindows.includes(windowId)
    const size = windowSizes[windowId]
    const w = size?.width ?? MINI_WINDOW_DEFAULT_WIDTH
    if (inLeft) {
      const rect = panelRects.left
      if (!rect) return
      const clampedX = Math.max(0, Math.min(rect.width - w, x - rect.left))
      setPositions((p) => ({ ...p, [windowId]: { x: clampedX } }))
    } else if (inRight) {
      const rect = panelRects.right
      if (!rect) return
      const clampedX = Math.max(0, Math.min(rect.width - w, x - rect.left))
      setPositions((p) => ({ ...p, [windowId]: { x: clampedX } }))
    } else {
      setPositions((p) => ({ ...p, [windowId]: { x, y } }))
    }
  }, [leftWindows, rightWindows, panelRects.left, panelRects.right, windowSizes])

  const leftConfigs = leftWindows.map((id) => ({ id, Content: WINDOW_IDS[id] }))
  const rightConfigs = rightWindows.map((id) => ({ id, Content: WINDOW_IDS[id] }))
  const allIds = Object.keys(WINDOW_IDS)
  const floatingIds = allIds.filter((id) => !leftWindows.includes(id) && !rightWindows.includes(id))
  const floatingConfigs = floatingIds.map((id) => ({ id, Content: WINDOW_IDS[id] }))

  return (
    <div className="w-full h-full flex flex-col bg-ot-dark relative">
      <TopStatsBar />

      <div className="flex-1 flex min-h-0 relative items-stretch">
        <div ref={leftPanelRef} data-panel="left" className="relative z-10 flex-shrink-0 self-stretch min-h-0">
          <GameLeftPanel panelId="left" />
          {panelRects.left && leftConfigs.length > 0 && (
            <div className="absolute inset-0 overflow-visible pointer-events-none">
              {leftConfigs.map((w, i) => {
                const x = Math.round(positions[w.id]?.x ?? getCenterXInPanel(panelRects.left, w.id))
                const y = getStackedY(leftConfigs, i, windowSizes)
                const Content = w.Content
                return (
                  <div key={`${w.id}-left`} className="pointer-events-auto" style={{ position: 'absolute', left: x, top: y }}>
                    <Content
                      id={w.id}
                      open={windowOpen[w.id]}
                      onOpenChange={handleOpenChange}
                      docked
                      fixedLeft={Math.round(panelRects.left.left + x)}
                      fixedTop={Math.round(panelRects.left.top + y)}
                      onDragEnd={handleDock}
                      onPositionChange={handlePositionChange}
                      onSizeReport={handleSizeReport}
                    />
                  </div>
                )
              })}
            </div>
          )}
        </div>
        <div className="flex-1 min-w-0 min-h-0 flex flex-col">
          <div className="flex-1 min-h-0 min-w-0">
            <GameMapPanel />
          </div>
          <BottomSplitter height={bottomPanelHeight} onHeightChange={setBottomPanelHeight} />
          <GameBottomPanel height={bottomPanelHeight} />
        </div>
        <div ref={rightPanelRef} data-panel="right" className="relative z-10 flex-shrink-0 self-stretch min-h-0">
          <GameRightPanel panelId="right" />
          {rightConfigs.length > 0 && panelRects.right && (
            <div className="absolute inset-0 overflow-visible pointer-events-none">
              {rightConfigs.map((w, i) => {
                const x = Math.round(positions[w.id]?.x ?? getCenterXInPanel(panelRects.right, w.id))
                const y = getStackedY(rightConfigs, i, windowSizes)
                const Content = w.Content
                return (
                  <div key={`${w.id}-right`} className="pointer-events-auto" style={{ position: 'absolute', left: x, top: y }}>
                    <Content
                      id={w.id}
                      open={windowOpen[w.id]}
                      onOpenChange={handleOpenChange}
                      docked
                      fixedLeft={Math.round(panelRects.right.left + x)}
                      fixedTop={Math.round(panelRects.right.top + y)}
                      onDragEnd={handleDock}
                      onPositionChange={handlePositionChange}
                      onSizeReport={handleSizeReport}
                    />
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
      {floatingConfigs.map((w) => {
        const pos = positions[w.id] ?? { x: 100, y: 100 }
        const Content = w.Content
        return (
          <Content
            key={`${w.id}-float`}
            id={w.id}
            open={windowOpen[w.id]}
            onOpenChange={handleOpenChange}
            fixedLeft={pos.x}
            fixedTop={pos.y}
            onDragEnd={handleDock}
            onPositionChange={handlePositionChange}
            onSizeReport={handleSizeReport}
          />
        )
      })}
    </div>
  )
}
