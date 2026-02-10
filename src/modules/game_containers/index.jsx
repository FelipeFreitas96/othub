import { useCallback, useEffect, useMemo, useState } from 'react'
import MiniWindow from '../../components/MiniWindow'
import ContextMenu, { ContextMenuItem, ContextMenuSeparator } from '../../components/ContextMenu'
import { g_game } from '../../services/client/Game'
import { getThings } from '../../services/protocol/things'

const WINDOW_CONFIG = {
  title: 'Containers',
  icon: '/images/topbuttons/containers.png',
}

function ItemSprite({ item }) {
  const canvas = useMemo(() => {
    if (!item) return null
    const tt = item.getThingType?.()
    const things = getThings()
    if (!tt || !things?.sprites) return null
    const phase = item.calculateAnimationPhase?.(true) ?? 0
    const texture = tt.getTexture?.(phase, things.sprites, 0, item.m_numPatternX ?? 0, item.m_numPatternY ?? 0, item.m_numPatternZ ?? 0) ?? null
    if (texture) return texture
    const firstSpriteId = tt.spriteIds?.[0] ?? 0
    if (firstSpriteId > 0) return things.sprites.getCanvas?.(firstSpriteId) ?? null
    return null
  }, [item])

  if (!canvas) return null
  return (
    <canvas
      width={32}
      height={32}
      className="w-8 h-8 [image-rendering:pixelated]"
      ref={(el) => {
        if (!el || !canvas) return
        const ctx = el.getContext('2d')
        if (!ctx) return
        ctx.imageSmoothingEnabled = false
        ctx.clearRect(0, 0, 32, 32)
        const sw = canvas.width || 32
        const sh = canvas.height || 32
        const scale = Math.min(32 / sw, 32 / sh)
        const dw = Math.max(1, Math.floor(sw * scale))
        const dh = Math.max(1, Math.floor(sh * scale))
        const dx = Math.floor((32 - dw) / 2)
        const dy = Math.floor((32 - dh) / 2)
        ctx.drawImage(canvas, 0, 0, sw, sh, dx, dy, dw, dh)
      }}
    />
  )
}

function ContainerSlot({ item }) {
  const [menuPos, setMenuPos] = useState(null)
  const count = item?.getCount?.() ?? 0

  return (
    <button
      type="button"
      className="relative w-[34px] h-[34px] border border-black/30 bg-[url('/images/ui/containerslot.png')] bg-cover"
      onDoubleClick={() => item && g_game.use(item)}
      onContextMenu={(e) => {
        e.preventDefault()
        if (!item) return
        setMenuPos({ x: e.clientX, y: e.clientY })
      }}
    >
      {item && <ItemSprite item={item} />}
      {count > 1 && <span className="absolute right-0.5 bottom-0 text-[9px] text-white">{count}</span>}
      <ContextMenu open={menuPos} onClose={() => setMenuPos(null)}>
        <ContextMenuItem onClick={() => { if (item) g_game.use(item); setMenuPos(null) }}>Use</ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem onClick={() => { if (item) g_game.look(item); setMenuPos(null) }}>Look</ContextMenuItem>
      </ContextMenu>
    </button>
  )
}

export default function Containers(layoutProps) {
  const [containers, setContainers] = useState({})

  useEffect(() => {
    const onOpen = (event) => {
      const d = event?.detail ?? {}
      const id = Number(d.containerId)
      if (!Number.isFinite(id)) return
      setContainers((prev) => ({
        ...prev,
        [id]: {
          id,
          name: d.name || 'Container',
          capacity: Number(d.capacity ?? 0),
          hasParent: !!d.hasParent,
          items: Array.isArray(d.items) ? d.items : [],
        },
      }))
    }

    const onClose = (event) => {
      const id = Number(event?.detail?.containerId)
      if (!Number.isFinite(id)) return
      setContainers((prev) => {
        const next = { ...prev }
        delete next[id]
        return next
      })
    }

    const onAdd = (event) => {
      const { containerId, slot, item } = event?.detail ?? {}
      const id = Number(containerId)
      if (!Number.isFinite(id)) return
      setContainers((prev) => {
        const c = prev[id]
        if (!c) return prev
        const items = [...(c.items ?? [])]
        const at = Number(slot)
        if (Number.isFinite(at) && at >= 0) items.splice(at, 0, item)
        else items.push(item)
        return { ...prev, [id]: { ...c, items } }
      })
    }

    const onUpdate = (event) => {
      const { containerId, slot, item } = event?.detail ?? {}
      const id = Number(containerId)
      const at = Number(slot)
      if (!Number.isFinite(id) || !Number.isFinite(at) || at < 0) return
      setContainers((prev) => {
        const c = prev[id]
        if (!c) return prev
        const items = [...(c.items ?? [])]
        items[at] = item
        return { ...prev, [id]: { ...c, items } }
      })
    }

    const onRemove = (event) => {
      const { containerId, slot, lastItem } = event?.detail ?? {}
      const id = Number(containerId)
      const at = Number(slot)
      if (!Number.isFinite(id) || !Number.isFinite(at) || at < 0) return
      setContainers((prev) => {
        const c = prev[id]
        if (!c) return prev
        const items = [...(c.items ?? [])]
        if (at < items.length) items.splice(at, 1)
        if (lastItem) items.push(lastItem)
        return { ...prev, [id]: { ...c, items } }
      })
    }

    window.addEventListener('ot:containerOpen', onOpen)
    window.addEventListener('ot:containerClose', onClose)
    window.addEventListener('ot:containerAddItem', onAdd)
    window.addEventListener('ot:containerUpdateItem', onUpdate)
    window.addEventListener('ot:containerRemoveItem', onRemove)
    return () => {
      window.removeEventListener('ot:containerOpen', onOpen)
      window.removeEventListener('ot:containerClose', onClose)
      window.removeEventListener('ot:containerAddItem', onAdd)
      window.removeEventListener('ot:containerUpdateItem', onUpdate)
      window.removeEventListener('ot:containerRemoveItem', onRemove)
    }
  }, [])

  const containerList = useMemo(
    () => Object.values(containers).sort((a, b) => Number(a.id) - Number(b.id)),
    [containers]
  )

  return (
    <MiniWindow {...layoutProps} title={WINDOW_CONFIG.title} icon={WINDOW_CONFIG.icon} resizable={false}>
      <div className="p-1.5 flex flex-col gap-2">
        {containerList.length === 0 && <div className="text-[11px] text-ot-text/70 px-1 py-2">No open containers.</div>}
        {containerList.map((container) => (
          <div key={container.id} className="border border-ot-border/60 p-1">
            <div className="text-[11px] font-bold text-ot-text-bright px-0.5 pb-1">{container.name}</div>
            <div className="grid grid-cols-5 gap-1">
              {Array.from({ length: Math.max(container.items.length, container.capacity || 0) }).map((_, i) => (
                <ContainerSlot key={`${container.id}-${i}`} item={container.items[i] ?? null} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </MiniWindow>
  )
}
