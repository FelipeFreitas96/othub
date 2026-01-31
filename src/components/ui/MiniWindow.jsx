import { useRef, useState, useCallback, useEffect } from 'react'

/**
 * MiniWindow - UIMiniWindow do OTClient: janela livre na tela (position: fixed).
 * Dimensões padrão como no OTClient (width: 192, height: 200 no .otui).
 */
const IMG = {
  miniborder: '/images/ui/miniborder.png',
}

const MINI_WINDOW_WIDTH = 192
const MINI_WINDOW_MIN_HEIGHT = 200
const MINI_WINDOW_MAX_HEIGHT = 500
const MINI_WINDOW_HEADER_HEIGHT = 28
const RESIZE_HANDLE_HEIGHT = 6

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
}) {
  const [internalOpen, setInternalOpen] = useState(defaultOpen)
  const open = controlledOpen !== undefined ? controlledOpen : internalOpen
  const setOpen = useCallback(
    (valueOrUpdater) => {
      const next = typeof valueOrUpdater === 'function' ? valueOrUpdater(open) : valueOrUpdater
      if (onOpenChange) onOpenChange(id, next)
      else setInternalOpen(next)
    },
    [id, open, onOpenChange]
  )
  const [locked, setLocked] = useState(false)
  const draggable = initialDraggable && !locked
  const [dragging, setDragging] = useState(false)
  const [resizing, setResizing] = useState(false)
  const [height, setHeight] = useState(MINI_WINDOW_MIN_HEIGHT)
  const [zIndex, setZIndex] = useState(50)
  const dragRef = useRef({ active: false, startX: 0, startY: 0, startLeft: 0, startTop: 0 })
  const resizeRef = useRef({ active: false, startY: 0, startHeight: 0 })
  const didDragRef = useRef(false)
  const topZRef = useRef(100)
  const rootRef = useRef(null)

  useEffect(() => {
    const el = rootRef.current
    if (!el || !onSizeReport) return
    const report = () => {
      const rect = el.getBoundingClientRect()
      onSizeReport(id, rect.width, rect.height)
    }
    report()
    const ro = new ResizeObserver(report)
    ro.observe(el)
    return () => ro.disconnect()
  }, [id, onSizeReport])

  useEffect(() => {
    if (!onSizeReport || !rootRef.current) return
    const raf = requestAnimationFrame(() => {
      const el = rootRef.current
      if (el) {
        const rect = el.getBoundingClientRect()
        onSizeReport(id, rect.width, rect.height)
      }
    })
    return () => cancelAnimationFrame(raf)
  }, [open, id, onSizeReport])

  const left = docked ? 0 : (fixedLeft ?? 0)
  const top = docked ? 0 : (fixedTop ?? 0)
  const positionMode = docked ? 'absolute' : 'fixed'

  const onHeaderMouseDown = useCallback(
    (e) => {
      if (!draggable || e.button !== 0) return
      e.preventDefault()
      didDragRef.current = false
      setDragging(true)
      setZIndex(1000)
      dragRef.current = {
        active: true,
        startX: e.clientX,
        startY: e.clientY,
        startLeft: left,
        startTop: top,
      }
    },
    [draggable, left, top]
  )

  const onMouseMove = useCallback(
    (e) => {
      if (resizeRef.current.active) {
        const dy = e.clientY - resizeRef.current.startY
        const newHeight = Math.max(
          MINI_WINDOW_MIN_HEIGHT,
          Math.min(MINI_WINDOW_MAX_HEIGHT, resizeRef.current.startHeight + dy)
        )
        setHeight(newHeight)
        return
      }
      if (!dragRef.current.active || !onPositionChange) return
      didDragRef.current = true
      const newLeft = dragRef.current.startLeft + (e.clientX - dragRef.current.startX)
      const newTop = dragRef.current.startTop + (e.clientY - dragRef.current.startY)
      onPositionChange(id, newLeft, newTop)
    },
    [id, onPositionChange]
  )

  const onMouseUp = useCallback(
    (e) => {
      if (resizeRef.current.active) {
        setResizing(false)
        setZIndex(50)
        resizeRef.current.active = false
        return
      }
      if (dragRef.current.active) {
        setDragging(false)
        setZIndex(50)
        if (onDragEnd && id) {
          const root = rootRef.current
          let panelId = null
          if (root) {
            const prev = root.style.pointerEvents
            root.style.pointerEvents = 'none'
            const under = document.elementFromPoint(e.clientX, e.clientY)
            const panelEl = under?.closest('[data-panel]')
            panelId = panelEl?.getAttribute('data-panel') ?? null
            root.style.pointerEvents = prev
          }
          onDragEnd(id, e.clientX, e.clientY, panelId, left, top)
        }
      }
      dragRef.current.active = false
    },
    [onDragEnd, id]
  )

  const onResizeHandleMouseDown = useCallback((e) => {
    if (e.button !== 0) return
    e.preventDefault()
    e.stopPropagation()
    setResizing(true)
    setZIndex(1000)
    resizeRef.current = { active: true, startY: e.clientY, startHeight: height }
  }, [height])

  useEffect(() => {
    if (!draggable && !resizing) return
    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)
    return () => {
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
    }
  }, [draggable, resizing, onMouseMove, onMouseUp])

  const bringToFront = useCallback(() => {
    if (!dragging) {
      topZRef.current += 1
      setZIndex(topZRef.current)
    }
  }, [dragging])

  return (
    <div
      ref={rootRef}
      id={id}
      className={`rounded border border-ot-border bg-ot-panel overflow-hidden flex flex-col ${className}`}
      style={{
        position: positionMode,
        left: `${Number(left) || 0}px`,
        top: `${Number(top) || 0}px`,
        right: 'auto',
        bottom: 'auto',
        zIndex,
        width: MINI_WINDOW_WIDTH,
        height: open ? height : MINI_WINDOW_HEADER_HEIGHT,
        minHeight: open ? MINI_WINDOW_MIN_HEIGHT : MINI_WINDOW_HEADER_HEIGHT,
        maxHeight: open ? MINI_WINDOW_MAX_HEIGHT : MINI_WINDOW_HEADER_HEIGHT,
      }}
    >
      <div
        role="button"
        tabIndex={0}
        onMouseDown={onHeaderMouseDown}
        onClick={bringToFront}
        onDoubleClick={() => {
          if (!didDragRef.current) setOpen(!open)
        }}
        className={`flex items-center gap-1 px-1 py-0.5 border-b border-ot-border cursor-pointer select-none hover:bg-ot-hover ${headerClassName}`}
        style={{ cursor: draggable && !resizing ? (dragging ? 'grabbing' : 'grab') : 'default' }}
        title={draggable ? 'Arraste para mover • Solte sobre um painel para acoplar • Duplo clique para expandir/recolher' : 'Janela travada'}
      >
        {icon && (
          <div
            className="w-3 h-3 rounded flex-shrink-0 bg-no-repeat bg-[length:auto_100%] bg-[position:0_0] bg-ot-text/30"
            style={{ backgroundImage: `url('${typeof icon === 'string' ? icon : IMG.miniborder}')`, backgroundSize: 'auto' }}
          />
        )}
        <span className="text-ot-text-bright text-[11px] font-verdana flex-1 truncate">{title}</span>
        <button
          type="button"
          className="w-4 h-4 flex items-center justify-center rounded hover:bg-ot-hover text-ot-text/80 text-[10px] flex-shrink-0"
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation()
            setLocked((l) => !l)
          }}
          title={locked ? 'Destravar' : 'Travar'}
        >
          {locked ? '🔒' : '🔓'}
        </button>
        <button
          type="button"
          className="w-4 h-4 flex items-center justify-center rounded hover:bg-ot-hover text-ot-text/80 text-[10px] flex-shrink-0"
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation()
            if (didDragRef.current) {
              didDragRef.current = false
              return
            }
            setOpen(!open)
          }}
          title={open ? 'Recolher' : 'Expandir'}
        >
          {open ? '−' : '+'}
        </button>
      </div>
      {open && (
        <>
          <div className="flex-1 min-h-0 min-w-0 overflow-x-hidden overflow-y-auto flex flex-col">
            {children}
          </div>
          <div
            role="separator"
            aria-label="Redimensionar altura"
            className="flex-shrink-0 w-full bg-ot-border hover:bg-ot-border/80 cursor-ns-resize flex items-center justify-center group"
            style={{ height: RESIZE_HANDLE_HEIGHT }}
            onMouseDown={onResizeHandleMouseDown}
            title="Arraste para redimensionar a altura"
          >
            <span className="w-8 h-0.5 rounded-full bg-ot-text/30 group-hover:bg-ot-text/50" />
          </div>
        </>
      )}
    </div>
  )
}
