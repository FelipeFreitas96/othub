import { useCallback, useEffect, useRef, useState } from 'react'

const DEFAULT_HEADER_HEIGHT = 27

export default function UIWindow({
  id,
  title,
  icon,
  children,
  className = '',
  contentClassName = '',
  headerClassName = '',
  titleClassName = '',
  style,
  draggable = true,
  movable = true,
  focusable = true,
  onEnter,
  onEscape,
  onFocusChange,
  onPositionChange,
  onDragStart,
  onDragEnd,
  left = 0,
  top = 0,
  position = 'fixed',
  width,
  height,
  minHeight,
  maxHeight,
  minWidth,
  maxWidth,
  renderHeaderActions = null,
  headerHeight = DEFAULT_HEADER_HEIGHT,
}) {
  const [dragging, setDragging] = useState(false)
  const [zIndex, setZIndex] = useState(50)
  const dragRef = useRef({ active: false, startX: 0, startY: 0, startLeft: 0, startTop: 0 })
  const rootRef = useRef(null)
  const topZRef = useRef(100)

  const onMouseMove = useCallback(
    (event) => {
      if (!dragRef.current.active || !draggable || !movable || !onPositionChange) return
      const newLeft = dragRef.current.startLeft + (event.clientX - dragRef.current.startX)
      const newTop = dragRef.current.startTop + (event.clientY - dragRef.current.startY)
      onPositionChange(id, newLeft, newTop)
    },
    [draggable, id, movable, onPositionChange]
  )

  const onMouseUp = useCallback(
    (event) => {
      if (!dragRef.current.active) return
      dragRef.current.active = false
      setDragging(false)
      setZIndex(50)
      onDragEnd?.(id, event.clientX, event.clientY)
    },
    [id, onDragEnd]
  )

  useEffect(() => {
    if (!dragging) return
    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)
    return () => {
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
    }
  }, [dragging, onMouseMove, onMouseUp])

  const handleMouseDownHeader = useCallback(
    (event) => {
      if (!draggable || !movable || event.button !== 0) return
      event.preventDefault()
      setDragging(true)
      setZIndex(1000)
      dragRef.current = {
        active: true,
        startX: event.clientX,
        startY: event.clientY,
        startLeft: Number(left) || 0,
        startTop: Number(top) || 0,
      }
      onDragStart?.(id, event.clientX, event.clientY)
    },
    [draggable, id, left, movable, onDragStart, top]
  )

  const bringToFront = useCallback(() => {
    topZRef.current += 1
    setZIndex(topZRef.current)
    onFocusChange?.(true)
  }, [onFocusChange])

  return (
    <div
      ref={rootRef}
      id={id}
      role={focusable ? 'dialog' : undefined}
      tabIndex={focusable ? 0 : -1}
      onClick={bringToFront}
      onKeyDown={(event) => {
        if (event.key === 'Enter') onEnter?.()
        else if (event.key === 'Escape') onEscape?.()
      }}
      className={`border border-ot-border bg-ot-panel overflow-hidden flex flex-col ${className}`}
      style={{
        position,
        left: `${Number(left) || 0}px`,
        top: `${Number(top) || 0}px`,
        right: 'auto',
        bottom: 'auto',
        width,
        height,
        minHeight,
        maxHeight,
        minWidth,
        maxWidth,
        zIndex,
        ...style,
      }}
    >
      <div
        className={`flex items-center gap-1 px-1 py-0.5 border-b border-ot-border select-none ${headerClassName}`}
        style={{ height: headerHeight, cursor: draggable && movable ? (dragging ? 'grabbing' : 'grab') : 'default' }}
        onMouseDown={handleMouseDownHeader}
      >
        {icon && (
          <div
            className="w-3 h-3 rounded flex-shrink-0 bg-no-repeat bg-[length:auto_100%] bg-[position:0_0]"
            style={{ backgroundImage: `url('${icon}')` }}
          />
        )}
        <span className={`text-ot-text-bright text-[11px] font-verdana font-bold flex-1 truncate ${titleClassName}`}>{title}</span>
        {renderHeaderActions?.()}
      </div>
      <div className={`flex-1 min-h-0 min-w-0 flex flex-col ${contentClassName}`}>{children}</div>
    </div>
  )
}

