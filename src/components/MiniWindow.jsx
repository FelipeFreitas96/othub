import { useRef, useState, useCallback, useEffect } from 'react'
import UIWindow from './UIWindow'

const MINI_WINDOW_WIDTH = 192
const MINI_WINDOW_MIN_HEIGHT = 200
const MINI_WINDOW_MAX_HEIGHT = 500
const MINI_WINDOW_HEADER_HEIGHT = 28
const RESIZE_HANDLE_HEIGHT = 6
const MINIWINDOW_BUTTONS_IMG = '/images/ui/miniwindow_buttons'

export default function MiniWindow({
  id,
  title,
  icon,
  children,
  defaultOpen = true,
  open: controlledOpen,
  onOpenChange,
  draggable: initialDraggable = true,
  className = '',
  headerClassName = '',
  fixedLeft,
  fixedTop,
  docked = false,
  onDragEnd,
  onPositionChange,
  onSizeReport,
  resizable = true,
  width = MINI_WINDOW_WIDTH,
  defaultHeight = MINI_WINDOW_MIN_HEIGHT,
  minHeight = MINI_WINDOW_MIN_HEIGHT,
  maxHeight = MINI_WINDOW_MAX_HEIGHT,
}) {
  const [internalVisible, setInternalVisible] = useState(defaultOpen)
  const [collapsed, setCollapsed] = useState(false)
  const [locked, setLocked] = useState(false)
  const [resizing, setResizing] = useState(false)
  const [height, setHeight] = useState(() => Math.max(minHeight, Math.min(maxHeight, defaultHeight)))
  const resizeRef = useRef({ active: false, startY: 0, startHeight: 0 })

  const visible = controlledOpen !== undefined ? controlledOpen : internalVisible
  const draggable = initialDraggable && !locked
  const left = docked ? 0 : (fixedLeft ?? 0)
  const top = docked ? 0 : (fixedTop ?? 0)
  const positionMode = docked ? 'absolute' : 'fixed'

  const setVisible = useCallback((valueOrUpdater) => {
    const next = typeof valueOrUpdater === 'function' ? valueOrUpdater(visible) : valueOrUpdater
    if (onOpenChange) onOpenChange(id, next)
    else setInternalVisible(next)
  }, [id, onOpenChange, visible])

  useEffect(() => {
    const el = document.getElementById(id)
    if (!el || !onSizeReport) return
    const report = () => {
      const rect = el.getBoundingClientRect()
      onSizeReport(id, rect.width, rect.height)
    }
    report()
    const ro = new ResizeObserver(report)
    ro.observe(el)
    return () => ro.disconnect()
  }, [id, onSizeReport, visible, collapsed])

  const onResizeMove = useCallback((event) => {
    if (!resizeRef.current.active) return
    const dy = event.clientY - resizeRef.current.startY
    const next = Math.max(minHeight, Math.min(maxHeight, resizeRef.current.startHeight + dy))
    setHeight(next)
  }, [maxHeight, minHeight])

  const onResizeUp = useCallback(() => {
    if (!resizeRef.current.active) return
    resizeRef.current.active = false
    setResizing(false)
  }, [])

  useEffect(() => {
    if (!resizing) return
    window.addEventListener('mousemove', onResizeMove)
    window.addEventListener('mouseup', onResizeUp)
    return () => {
      window.removeEventListener('mousemove', onResizeMove)
      window.removeEventListener('mouseup', onResizeUp)
    }
  }, [onResizeMove, onResizeUp, resizing])

  if (!visible) return null

  return (
    <UIWindow
      id={id}
      title={title}
      icon={icon}
      position={positionMode}
      left={left}
      top={top}
      width={Number(width) || MINI_WINDOW_WIDTH}
      height={collapsed ? MINI_WINDOW_HEADER_HEIGHT : height}
      minHeight={collapsed ? MINI_WINDOW_HEADER_HEIGHT : minHeight}
      maxHeight={collapsed ? MINI_WINDOW_HEADER_HEIGHT : maxHeight}
      draggable={draggable}
      movable
      onPositionChange={onPositionChange}
      onDragEnd={(windowId, clientX, clientY) => {
        if (!onDragEnd) return
        const root = document.getElementById(windowId)
        let panelId = null
        if (root) {
          const prev = root.style.pointerEvents
          root.style.pointerEvents = 'none'
          const under = document.elementFromPoint(clientX, clientY)
          const panelEl = under?.closest('[data-panel]')
          panelId = panelEl?.getAttribute('data-panel') ?? null
          root.style.pointerEvents = prev
        }
        onDragEnd(windowId, clientX, clientY, panelId, left, top)
      }}
      className={`rounded bg-ot-panel overflow-hidden ${className}`}
      headerClassName={`hover:bg-ot-hover ${headerClassName}`}
      headerHeight={MINI_WINDOW_HEADER_HEIGHT}
      renderHeaderActions={() => (
        <>
          <button
            type="button"
            className="w-4 h-4 flex items-center justify-center rounded hover:bg-ot-hover text-ot-text/80 text-[10px]"
            onMouseDown={(event) => event.stopPropagation()}
            onClick={(event) => {
              event.stopPropagation()
              setLocked((value) => !value)
            }}
            title={locked ? 'Destravar' : 'Travar'}
          >
            <span
              className="w-[14px] h-[14px] bg-no-repeat"
              style={{
                backgroundImage: `url('${MINIWINDOW_BUTTONS_IMG}')`,
                backgroundPosition: locked ? '-84px 0px' : '-98px 0px',
              }}
            />
          </button>
          <button
            type="button"
            className="w-4 h-4 flex items-center justify-center rounded hover:bg-ot-hover text-ot-text/80 text-[10px]"
            onMouseDown={(event) => event.stopPropagation()}
            onClick={(event) => {
              event.stopPropagation()
              setCollapsed((value) => !value)
            }}
            title={collapsed ? 'Expandir' : 'Recolher'}
          >
            {collapsed ? '+' : '-'}
          </button>
          <button
            type="button"
            className="w-4 h-4 flex items-center justify-center rounded hover:bg-ot-hover text-ot-text/80 text-[10px]"
            onMouseDown={(event) => event.stopPropagation()}
            onClick={(event) => {
              event.stopPropagation()
              setVisible(false)
            }}
            title="Fechar"
          >
            x
          </button>
        </>
      )}
    >
      {!collapsed && (
        <>
          <div className="flex-1 min-h-0 min-w-0 overflow-x-hidden overflow-y-auto flex flex-col">
            {children}
          </div>
          {resizable && (
            <div
              role="separator"
              aria-label="Redimensionar altura"
              className="flex-shrink-0 w-full bg-ot-border hover:bg-ot-border/80 cursor-ns-resize flex items-center justify-center group"
              style={{ height: RESIZE_HANDLE_HEIGHT }}
              onMouseDown={(event) => {
                if (event.button !== 0) return
                event.preventDefault()
                event.stopPropagation()
                resizeRef.current = { active: true, startY: event.clientY, startHeight: height }
                setResizing(true)
              }}
              title="Arraste para redimensionar a altura"
            >
              <span className="w-8 h-0.5 rounded-full bg-ot-text/30 group-hover:bg-ot-text/50" />
            </div>
          )}
        </>
      )}
    </UIWindow>
  )
}
