import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import MiniWindow from '../../components/MiniWindow'
import ContextMenu, { ContextMenuItem, ContextMenuSeparator } from '../../components/ContextMenu'
import { g_game, FightModes, ChaseModes, PVPModes } from '../../services/client/Game'
import { g_player } from '../../services/client/LocalPlayer'
import { Position } from '../../services/client/Position'
import { isFeatureEnabled } from '../../services/protocol/features'
import { getThings, loadThings } from '../../services/protocol/things'

const WINDOW_CONFIG = {
  title: 'Inventory',
  icon: '/images/topbuttons/inventory.png',
}

const IMG = {
  minButton: '/images/inventory/min_button_small.png',
  maxButton: '/images/inventory/max_button_small.png',
  blessings: '/images/inventory/button_blessings_grey.png',
  purse: '/images/inventory/purse.png',
  buttonsGeneral: '/images/inventory/buttons_general.png',
  expertUp: '/images/inventory/button-expert-up.png',
  expertDown: '/images/inventory/button-expert-down.png',
  onPanelPvp: '/images/game/combatmodes/onPanel.png',
  whiteDove: '/images/game/combatmodes/whitedovemode.png',
  whiteHand: '/images/game/combatmodes/whitehandmode.png',
  yellowHand: '/images/game/combatmodes/yellowhandmode.png',
  redFist: '/images/game/combatmodes/redfistmode.png',
  safeFight: '/images/game/combatmodes/safefight.png',
  slotBack: '/images/ui/containerslot.png',
  slotFilled: '/images/inventory/containerslot.png',
}

const Slots = {
  Head: 1,
  Neck: 2,
  Back: 3,
  Body: 4,
  Right: 5,
  Left: 6,
  Legs: 7,
  Feet: 8,
  Finger: 9,
  Ammo: 10,
  Purse: 11,
}

const ON_SLOT_STYLE = {
  amulet: { left: 8, top: 20, slot: Slots.Neck, bg: '/images/inventory/inventory_neck.png', label: 'Neck' },
  helmet: { left: 45, top: 5, slot: Slots.Head, bg: '/images/inventory/inventory_head.png', label: 'Head' },
  backpack: { left: 82, top: 20, slot: Slots.Back, bg: '/images/inventory/inventory_back.png', label: 'Back' },
  sword: { left: 8, top: 57, slot: Slots.Left, bg: '/images/inventory/inventory_left_hand.png', label: 'Left Hand' },
  ring: { left: 8, top: 94, slot: Slots.Finger, bg: '/images/inventory/inventory_finger.png', label: 'Ring' },
  armor: { left: 45, top: 42, slot: Slots.Body, bg: '/images/inventory/inventory_torso.png', label: 'Body' },
  legs: { left: 45, top: 79, slot: Slots.Legs, bg: '/images/inventory/inventory_legs.png', label: 'Legs' },
  boots: { left: 45, top: 116, slot: Slots.Feet, bg: '/images/inventory/inventory_feet.png', label: 'Feet' },
  shield: { left: 82, top: 57, slot: Slots.Right, bg: '/images/inventory/inventory_right_hand.png', label: 'Right Hand' },
  tools: { left: 82, top: 94, slot: Slots.Ammo, bg: '/images/inventory/inventory_hip.png', label: 'Ammo' },
}

function formatCap(cap) {
  if (!Number.isFinite(cap)) return '0'
  if (cap > 99999) return `${Math.min(9999, Math.floor(cap / 1000))}k`
  if (cap > 999) return `${Math.floor(cap)}`
  if (cap > 99) return `${Math.floor(cap * 10) / 10}`
  return `${cap}`
}

function GeneralButton({ x, y, clipY, active, onClick, title }) {
  const clipX = active ? 20 : 0
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className="absolute w-[20px] h-[20px]"
      style={{
        left: x,
        top: y,
        backgroundImage: `url('${IMG.buttonsGeneral}')`,
        backgroundPosition: `-${clipX}px -${clipY}px`,
      }}
    />
  )
}

function ItemSlot({ style, item, onDragStart, onDropItem }) {
  const [spriteRevision, setSpriteRevision] = useState(0)
  const [menuPos, setMenuPos] = useState(null)

  useEffect(() => {
    if (!item) return
    const things = getThings()
    if (things?.ready) return

    const timer = window.setInterval(() => {
      if (getThings()?.ready) {
        setSpriteRevision((v) => v + 1)
        window.clearInterval(timer)
      }
    }, 200)

    return () => window.clearInterval(timer)
  }, [item])

  const itemCanvas = useMemo(() => {
    if (!item) return null
    const thingType = item.getThingType?.()
    const things = getThings()
    if (!thingType || !things?.sprites) return null

    const animationPhase = item.calculateAnimationPhase?.(true) ?? 0
    const xPattern = item.m_numPatternX ?? 0
    const yPattern = item.m_numPatternY ?? 0
    const zPattern = item.m_numPatternZ ?? 0
    const texture = thingType.getTexture?.(animationPhase, things.sprites, 0, xPattern, yPattern, zPattern) ?? null
    if (texture) return texture

    const firstSpriteId = thingType.spriteIds?.[0] ?? 0
    if (firstSpriteId > 0) return things.sprites.getCanvas?.(firstSpriteId) ?? null
    return null
  }, [item, spriteRevision])

  const count = item?.getCount?.() ?? 0
  return (
    <div
      data-inventory-slot={style.slot}
      className="absolute w-[34px] h-[34px] border border-black/30 bg-no-repeat bg-cover"
      style={{ left: style.left, top: style.top, backgroundImage: `url('${item ? IMG.slotFilled : style.bg}')` }}
      title={style.label}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault()
        onDropItem(style.slot)
      }}
    >
      <button
        type="button"
        className="absolute inset-0 w-full h-full"
        onMouseDown={(e) => onDragStart(item, e)}
        onDoubleClick={() => item && g_game.use(item)}
        onContextMenu={(e) => {
          e.preventDefault()
          if (!item) return
          setMenuPos({ x: e.clientX, y: e.clientY })
        }}
      >
        {itemCanvas && (
          <canvas
            width={32}
            height={32}
            className="absolute left-[1px] top-[1px] w-[32px] h-[32px] [image-rendering:pixelated]"
            ref={(el) => {
              if (!el || !itemCanvas) return
              const ctx = el.getContext('2d')
              if (!ctx) return
              ctx.imageSmoothingEnabled = false
              ctx.clearRect(0, 0, 32, 32)
              const sw = itemCanvas.width || 32
              const sh = itemCanvas.height || 32
              const scale = Math.min(32 / sw, 32 / sh)
              const dw = Math.max(1, Math.floor(sw * scale))
              const dh = Math.max(1, Math.floor(sh * scale))
              const dx = Math.floor((32 - dw) / 2)
              const dy = Math.floor((32 - dh) / 2)
              ctx.drawImage(itemCanvas, 0, 0, sw, sh, dx, dy, dw, dh)
            }}
          />
        )}
      </button>
      {count > 1 && <span className="absolute right-0.5 bottom-0 text-[9px] text-white">{count}</span>}
      <ContextMenu open={menuPos} onClose={() => setMenuPos(null)}>
        <ContextMenuItem onClick={() => { if (item) g_game.use(item); setMenuPos(null) }}>Use</ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem onClick={() => { if (item) g_game.look(item); setMenuPos(null) }}>Look</ContextMenuItem>
      </ContextMenu>
    </div>
  )
}

export default function Inventory(layoutProps) {
  const [inventoryShrink, setInventoryShrink] = useState(false)
  const [inventoryItems, setInventoryItems] = useState({})
  const [soul, setSoul] = useState(0)
  const [freeCapacity, setFreeCapacity] = useState(0)
  const [fightMode, setFightMode] = useState(FightModes.FightBalanced)
  const [chaseMode, setChaseMode] = useState(ChaseModes.DontChase)
  const [safeFight, setSafeFight] = useState(true)
  const [pvpMode, setPvpMode] = useState(PVPModes.WhiteDove)
  const [expert, setExpert] = useState(false)
  const draggedItemRef = useRef(null)

  const showPvpMode = isFeatureEnabled('GamePVPMode')
  const showBlessings = (g_game.getClientVersion?.() ?? 860) >= 1000
  const showPurse = isFeatureEnabled('GamePurseSlot')

  const refreshFromPlayer = useCallback(() => {
    const next = {}
    for (let i = Slots.Head; i <= Slots.Ammo; i++) next[i] = g_player.getInventoryItem?.(i) ?? null
    setInventoryItems(next)
    setSoul(g_player.getSoul?.() ?? 0)
    setFreeCapacity(g_player.getFreeCapacity?.() ?? 0)
  }, [])

  const refreshCombat = useCallback(() => {
    setFightMode(g_game.getFightMode?.() ?? FightModes.FightBalanced)
    setChaseMode(g_game.getChaseMode?.() ?? ChaseModes.DontChase)
    setSafeFight(g_game.isSafeFight?.() ?? true)
    setPvpMode(g_game.getPVPMode?.() ?? PVPModes.WhiteDove)
  }, [])

  useEffect(() => {
    loadThings(g_game.getClientVersion?.() ?? 860).catch(() => {})
    setInventoryShrink(localStorage.getItem('mainpanel_shrink_inventory') === '1')
    refreshFromPlayer()
    refreshCombat()

    const onInventoryChange = (event) => {
      const args = event?.detail?.args ?? []
      const slot = Number(args[0])
      if (!slot) return
      setInventoryItems((prev) => ({ ...prev, [slot]: args[1] ?? null }))
    }
    const onSoulChange = (event) => setSoul(Number(event?.detail?.args?.[0] ?? 0))
    const onCapChange = (event) => setFreeCapacity(Number(event?.detail?.args?.[0] ?? 0))
    const onFightMode = (event) => setFightMode(Number(event.detail))
    const onChaseMode = (event) => setChaseMode(Number(event.detail))
    const onSafeFight = (event) => setSafeFight(Boolean(event.detail))
    const onPvpMode = (event) => setPvpMode(Number(event.detail))

    window.addEventListener('localPlayer:onInventoryChange', onInventoryChange)
    window.addEventListener('localPlayer:onSoulChange', onSoulChange)
    window.addEventListener('localPlayer:onFreeCapacityChange', onCapChange)
    window.addEventListener('g_game:onFightModeChange', onFightMode)
    window.addEventListener('g_game:onChaseModeChange', onChaseMode)
    window.addEventListener('g_game:onSafeFightChange', onSafeFight)
    window.addEventListener('g_game:onPVPModeChange', onPvpMode)
    window.addEventListener('g_game:onGameStart', refreshFromPlayer)

    return () => {
      window.removeEventListener('localPlayer:onInventoryChange', onInventoryChange)
      window.removeEventListener('localPlayer:onSoulChange', onSoulChange)
      window.removeEventListener('localPlayer:onFreeCapacityChange', onCapChange)
      window.removeEventListener('g_game:onFightModeChange', onFightMode)
      window.removeEventListener('g_game:onChaseModeChange', onChaseMode)
      window.removeEventListener('g_game:onSafeFightChange', onSafeFight)
      window.removeEventListener('g_game:onPVPModeChange', onPvpMode)
      window.removeEventListener('g_game:onGameStart', refreshFromPlayer)
    }
  }, [refreshCombat, refreshFromPlayer])

  useEffect(() => {
    const onMouseMove = (event) => {
      const state = window.__otInventoryDragState
      if (!state?.active || state.dragging || !state.item) return
      const dx = event.clientX - state.startX
      const dy = event.clientY - state.startY
      if ((dx * dx + dy * dy) < 9) return
      state.dragging = true
      window.__otDraggedInventoryItem = state.item
      document.body.style.cursor = 'grabbing'
    }

    const onMouseUp = (event) => {
      const mapDragState = window.__otMapDragState
      const draggedMapThing = window.__otDraggedMapThing
      if (mapDragState?.dragging && draggedMapThing) {
        const target = event.target instanceof Element ? event.target : null
        const slotEl = target?.closest?.('[data-inventory-slot]')
        const toSlot = Number(slotEl?.getAttribute?.('data-inventory-slot') ?? 0)
        if (toSlot > 0) {
          g_game.move(draggedMapThing, new Position(0xffff, toSlot, 0), 1)
          window.__otMapDragState = null
          window.__otDraggedMapThing = null
          document.body.style.cursor = ''
          return
        }
      }

      // Let map consume the drag first on its own mouseup handler.
      window.setTimeout(() => {
        const state = window.__otInventoryDragState
        if (!state) return
        window.__otInventoryDragState = null
        window.__otDraggedInventoryItem = null
        document.body.style.cursor = ''
      }, 0)
    }

    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)
    return () => {
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
      document.body.style.cursor = ''
      window.__otInventoryDragState = null
      window.__otDraggedInventoryItem = null
    }
  }, [])

  const selectPosture = useCallback((posture) => {
    g_game.setChaseMode(posture === 'follow' ? ChaseModes.ChaseOpponent : ChaseModes.DontChase)
  }, [])

  const selectCombat = useCallback((mode) => {
    if (mode === 'attack') g_game.setFightMode(FightModes.FightOffensive)
    else if (mode === 'defense') g_game.setFightMode(FightModes.FightDefensive)
    else g_game.setFightMode(FightModes.FightBalanced)
  }, [])

  const onSafeFightToggle = useCallback(() => {
    const next = !safeFight
    setSafeFight(next)
    g_game.setSafeFight(next)
    if (!next) g_game.cancelAttack?.()
  }, [safeFight])

  const changeInventorySize = useCallback(() => {
    const next = !inventoryShrink
    setInventoryShrink(next)
    localStorage.setItem('mainpanel_shrink_inventory', next ? '1' : '0')
  }, [inventoryShrink])

  const onDropItem = useCallback((toSlot) => {
    const item = draggedItemRef.current
    draggedItemRef.current = null
    window.__otDraggedInventoryItem = null
    if (!item) return
    g_game.move(item, new Position(0xffff, toSlot, 0), 1)
  }, [])

  const onPanel = (
    <div className="relative w-[185px] h-[162px]">
      <button type="button" className="absolute left-[8px] top-[5px] w-[12px] h-[12px]" style={{ backgroundImage: `url('${IMG.minButton}')` }} onClick={changeInventorySize} />

      {showBlessings && <button type="button" className="absolute left-[23px] top-[5px] w-[12px] h-[12px]" style={{ backgroundImage: `url('${IMG.blessings}')` }} />}

      {showPurse && (
        <button
          type="button"
          className="absolute left-[82px] top-[5px] w-[34px] h-[12px]"
          style={{ backgroundImage: `url('${IMG.purse}')`, backgroundPosition: '0 0' }}
          onClick={() => {
            const purse = g_player.getInventoryItem?.(Slots.Purse)
            if (purse) g_game.use(purse)
          }}
        />
      )}

      <GeneralButton x={154} y={5} clipY={0} active={chaseMode === ChaseModes.DontChase} title="Stand" onClick={() => selectPosture('stand')} />
      <GeneralButton x={154} y={29} clipY={20} active={chaseMode === ChaseModes.ChaseOpponent} title="Follow" onClick={() => selectPosture('follow')} />
      <button type="button" className="absolute left-[154px] top-[53px] w-[20px] h-[20px]" style={{ backgroundImage: `url('${expert ? IMG.expertDown : IMG.expertUp}')` }} onClick={() => setExpert((v) => !v)} />

      <button type="button" className="absolute left-[130px] top-[5px] w-[20px] h-[20px]" style={{ backgroundImage: `url('${IMG.buttonsGeneral}')`, backgroundPosition: `-${fightMode === FightModes.FightOffensive ? 20 : 0}px -40px` }} onClick={() => selectCombat('attack')} />
      <button type="button" className="absolute left-[130px] top-[29px] w-[20px] h-[20px]" style={{ backgroundImage: `url('${IMG.buttonsGeneral}')`, backgroundPosition: `-${fightMode === FightModes.FightBalanced ? 20 : 0}px -80px` }} onClick={() => selectCombat('balanced')} />
      <button type="button" className="absolute left-[130px] top-[53px] w-[20px] h-[20px]" style={{ backgroundImage: `url('${IMG.buttonsGeneral}')`, backgroundPosition: `-${fightMode === FightModes.FightDefensive ? 20 : 0}px -60px` }} onClick={() => selectCombat('defense')} />

      <button type="button" className="absolute left-[130px] top-[77px] w-[44px] h-[21px]" style={{ backgroundImage: `url('${IMG.onPanelPvp}')`, backgroundPosition: safeFight ? '0 20px' : '0 0' }} onClick={onSafeFightToggle} />

      {showPvpMode && (
        <>
          <button type="button" className="absolute left-[130px] top-[103px] w-[20px] h-[20px]" style={{ backgroundImage: `url('${IMG.whiteDove}')`, opacity: expert ? (pvpMode === PVPModes.WhiteDove ? 1 : 0.75) : 0, pointerEvents: expert ? 'auto' : 'none' }} onClick={() => g_game.setPVPMode(PVPModes.WhiteDove)} />
          <button type="button" className="absolute left-[154px] top-[103px] w-[20px] h-[20px]" style={{ backgroundImage: `url('${IMG.whiteHand}')`, opacity: expert ? (pvpMode === PVPModes.WhiteHand ? 1 : 0.75) : 0, pointerEvents: expert ? 'auto' : 'none' }} onClick={() => g_game.setPVPMode(PVPModes.WhiteHand)} />
          <button type="button" className="absolute left-[130px] top-[123px] w-[20px] h-[20px]" style={{ backgroundImage: `url('${IMG.yellowHand}')`, opacity: expert ? (pvpMode === PVPModes.YellowHand ? 1 : 0.75) : 0, pointerEvents: expert ? 'auto' : 'none' }} onClick={() => g_game.setPVPMode(PVPModes.YellowHand)} />
          <button type="button" className="absolute left-[154px] top-[123px] w-[20px] h-[20px]" style={{ backgroundImage: `url('${IMG.redFist}')`, opacity: expert ? (pvpMode === PVPModes.RedFist ? 1 : 0.75) : 0, pointerEvents: expert ? 'auto' : 'none' }} onClick={() => g_game.setPVPMode(PVPModes.RedFist)} />
        </>
      )}

      <button type="button" className="absolute left-[130px] top-[146px] w-[44px] h-[13px] border border-ot-border text-[10px]" onClick={() => { g_game.stop(); g_player.stopAutoWalk?.() }}>Stop</button>

      <div className="absolute left-[8px] top-[141px] w-[108px] h-[18px]" style={{ backgroundImage: `url('${IMG.slotBack}')`, backgroundSize: '100% 100%' }} />

      {Object.entries(ON_SLOT_STYLE).map(([key, style]) => (
        <ItemSlot
          key={key}
          style={style}
          item={inventoryItems[style.slot] ?? null}
          onDragStart={(item, event) => {
            if (!item || event?.button !== 0) return
            draggedItemRef.current = item
            window.__otInventoryDragState = {
              active: true,
              dragging: false,
              item,
              startX: event.clientX,
              startY: event.clientY,
            }
          }}
          onDropItem={onDropItem}
        />
      ))}

      <div className="absolute left-[8px] top-[131px] w-[34px] h-[28px] text-[10px] text-center text-[#c0c0c0] leading-[12px]">
        <div>Soul</div>
        <div>{soul}</div>
      </div>

      <div className="absolute left-[82px] top-[131px] w-[34px] h-[28px] text-[10px] text-center text-[#c0c0c0] leading-[12px]">
        <div>Cap</div>
        <div>{formatCap(freeCapacity)}</div>
      </div>
    </div>
  )

  const offPanel = (
    <div className="relative w-[185px] h-[62px]">
      <button type="button" className="absolute left-[8px] top-[5px] w-[12px] h-[12px]" style={{ backgroundImage: `url('${IMG.maxButton}')` }} onClick={changeInventorySize} />

      <div className="absolute left-[24px] top-[5px] w-[30px] h-[44px] text-[10px] text-center text-[#c0c0c0] leading-[10px]">
        <div>Cap</div>
        <div>{formatCap(freeCapacity)}</div>
        <div className="mt-1">Soul</div>
        <div>{soul}</div>
      </div>

      <button type="button" className="absolute left-[57px] top-[5px] w-[20px] h-[20px]" style={{ backgroundImage: `url('${IMG.buttonsGeneral}')`, backgroundPosition: `-${fightMode === FightModes.FightOffensive ? 20 : 0}px -40px` }} onClick={() => selectCombat('attack')} />
      <button type="button" className="absolute left-[78px] top-[5px] w-[20px] h-[20px]" style={{ backgroundImage: `url('${IMG.buttonsGeneral}')`, backgroundPosition: `-${fightMode === FightModes.FightDefensive ? 20 : 0}px -60px` }} onClick={() => selectCombat('defense')} />
      <button type="button" className="absolute left-[99px] top-[5px] w-[20px] h-[20px]" style={{ backgroundImage: `url('${IMG.buttonsGeneral}')`, backgroundPosition: `-${fightMode === FightModes.FightBalanced ? 20 : 0}px -80px` }} onClick={() => selectCombat('balanced')} />

      <button type="button" className="absolute left-[57px] top-[29px] w-[20px] h-[20px]" style={{ backgroundImage: `url('${IMG.buttonsGeneral}')`, backgroundPosition: `-${chaseMode === ChaseModes.DontChase ? 20 : 0}px 0px` }} onClick={() => selectPosture('stand')} />
      <button type="button" className="absolute left-[78px] top-[29px] w-[20px] h-[20px]" style={{ backgroundImage: `url('${IMG.buttonsGeneral}')`, backgroundPosition: `-${chaseMode === ChaseModes.ChaseOpponent ? 20 : 0}px -20px` }} onClick={() => selectPosture('follow')} />
      <button type="button" className="absolute left-[99px] top-[29px] w-[20px] h-[20px]" style={{ backgroundImage: `url('${IMG.safeFight}')`, opacity: safeFight ? 1 : 0.65 }} onClick={onSafeFightToggle} />

      <button type="button" className="absolute left-[130px] top-[46px] w-[44px] h-[13px] border border-ot-border text-[10px]" onClick={() => { g_game.stop(); g_player.stopAutoWalk?.() }}>Stop</button>

      <div className="absolute left-[24px] top-[44px] w-[95px] h-[18px]" style={{ backgroundImage: `url('${IMG.slotBack}')`, backgroundSize: '100% 100%' }} />
    </div>
  )

  return (
    <MiniWindow {...layoutProps} title={WINDOW_CONFIG.title} icon={WINDOW_CONFIG.icon} resizable={false}>
      {inventoryShrink ? offPanel : onPanel}
    </MiniWindow>
  )
}
