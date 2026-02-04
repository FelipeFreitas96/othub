/**
 * ContextMenu reutilizável: abre no clique direito, renderiza em portal, fecha ao clicar fora.
 * Uso: <ContextMenu open={position} onClose={...}>{itens}</ContextMenu>
 * position: null (fechado) ou { x, y } (clientX/clientY do evento)
 */
import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

function clampPosition(x, y, el) {
  if (!el) return { x, y }
  const r = el.getBoundingClientRect()
  const vw = window.innerWidth
  const vh = window.innerHeight
  return {
    x: Math.max(0, Math.min(x, vw - r.width)),
    y: Math.max(0, Math.min(y, vh - r.height)),
  }
}

export function useContextMenu() {
  const [position, setPosition] = useState(null)
  const onContextMenu = (e) => {
    e.preventDefault()
    e.stopPropagation()
    setPosition({ x: e.clientX, y: e.clientY })
  }
  const close = () => setPosition(null)
  return { position, onContextMenu, close }
}

export default function ContextMenu({ open, onClose, children, className = '', style = {} }) {
  const ref = useRef(null)
  const [clamped, setClamped] = useState(open)

  useEffect(() => {
    if (!open) return
    setClamped(open)
    const raf = requestAnimationFrame(() => {
      const next = clampPosition(open.x, open.y, ref.current)
      setClamped(next)
    })
    return () => cancelAnimationFrame(raf)
  }, [open])

  useEffect(() => {
    if (!open) return
    const handleClick = (e) => {
      if (ref.current && !ref.current.contains(e.target)) onClose()
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [open, onClose])

  if (!open) return null

  const pos = clamped ?? open
  const x = Number.isFinite(pos?.x) ? pos.x : 0
  const y = Number.isFinite(pos?.y) ? pos.y : 0
  const menuStyle = {
    left: x,
    top: y,
    zIndex: 9999,
    ...style,
  }

  return createPortal(
    <div
      ref={ref}
      role="menu"
      className={`fixed border border-ot-border rounded py-1 min-w-[160px] shadow-lg bg-[#1a1a1a] ${className}`}
      style={menuStyle}
    >
      {children}
    </div>,
    document.body
  )
}

/** Item de menu (botão com estilo OTClient) */
export function ContextMenuItem({ onClick, children, className = '', checkbox, checked }) {
  const base = 'w-full text-left px-3 py-1.5 text-[11px] text-white hover:bg-white/10 transition-colors'
  const withCheck = 'flex items-center gap-2'
  return (
    <button
      type="button"
      className={`${base} ${checkbox ? withCheck : ''} ${className}`}
      style={{ fontFamily: 'inherit' }}
      onClick={onClick}
    >
      {checkbox && (
        <span
          className="inline-block w-3 h-3 border border-ot-border flex-shrink-0 rounded-sm"
          style={{ backgroundColor: checked ? '#4a4a4a' : 'transparent' }}
        />
      )}
      {children}
    </button>
  )
}

/** Separador do menu */
export function ContextMenuSeparator() {
  return <div className="border-t border-ot-border my-1.5 mx-2" />
}
