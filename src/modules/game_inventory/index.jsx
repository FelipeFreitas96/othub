import { useState } from 'react'
import MiniWindow from '../../components/MiniWindow'

/**
 * Inventory - cópia de modules/game_inventory/inventory.otui
 * Imagens: public/images/inventory/, public/images/game/combatmodes/, public/images/ui/containerslot
 */
const WINDOW_CONFIG = {
  title: 'Inventory',
  icon: '/images/topbuttons/inventory',
}

const IMG = {
  minButtonSmall: '/images/inventory/min_button_small.png',
  maxButtonSmall: '/images/inventory/max_button_small.png',
  buttonBlessingsGrey: '/images/inventory/button_blessings_grey.png',
  purse: '/images/inventory/purse.png',
  buttonsGeneral: '/images/inventory/buttons_general.png',
  buttonExpertUp: '/images/inventory/button-expert-up.png',
  buttonExpertDown: '/images/inventory/button-expert-down.png',
  buttonExpertDisabled: '/images/inventory/button-expert-disabled.png',
  combatmodeOnPanel: '/images/game/combatmodes/onPanel.png',
  whitedove: '/images/game/combatmodes/whitedovemode.png',
  whitehand: '/images/game/combatmodes/whitehandmode.png',
  yellowhand: '/images/game/combatmodes/yellowhandmode.png',
  redfist: '/images/game/combatmodes/redfistmode.png',
  safefight: '/images/game/combatmodes/safefight.png',
  containerslot: '/images/ui/containerslot.png',
}

const SLOTS = [
  { id: 'helmet', label: 'Cap' },
  { id: 'amulet', label: 'Amulet' },
  { id: 'backpack', label: 'Backpack' },
  { id: 'armor', label: 'Armor' },
  { id: 'sword', label: 'Weapon' },
  { id: 'shield', label: 'Shield' },
  { id: 'legs', label: 'Legs' },
  { id: 'boots', label: 'Boots' },
  { id: 'ring', label: 'Ring' },
  { id: 'tools', label: 'Ammo' },
]

export default function Inventory(layoutProps) {
  const [expanded, setExpanded] = useState(true)

  const content = (
    <div className="rounded border border-ot-border bg-ot-panel overflow-hidden flex-1 min-h-0 flex flex-col">
      <div className="flex items-center gap-1 px-1 py-1 border-b border-ot-border">
        <button type="button" className="w-3 h-3 rounded hover:opacity-90 bg-no-repeat bg-center bg-cover" style={{ backgroundImage: `url('${expanded ? IMG.minButtonSmall : IMG.maxButtonSmall}')` }} onClick={() => setExpanded(!expanded)} title={expanded ? 'Minimizar' : 'Expandir'} />
        <button type="button" className="w-3 h-3 rounded hover:opacity-90 bg-no-repeat bg-center bg-cover" style={{ backgroundImage: `url('${IMG.buttonBlessingsGrey}')` }} title="Blessings" />
        <div className="flex-1" />
        <button type="button" className="w-5 h-5 rounded hover:opacity-90 bg-no-repeat bg-center bg-cover" style={{ backgroundImage: `url('${IMG.buttonsGeneral}')`, backgroundPosition: '0 0' }} title="Stand" />
        <button type="button" className="w-5 h-5 rounded hover:opacity-90 bg-no-repeat bg-center bg-cover" style={{ backgroundImage: `url('${IMG.buttonsGeneral}')`, backgroundPosition: '0 -20px' }} title="Follow" />
        <button type="button" className="w-5 h-5 rounded hover:opacity-90 bg-no-repeat bg-center bg-cover" style={{ backgroundImage: `url('${IMG.buttonsGeneral}')`, backgroundPosition: '0 -40px' }} title="Attack" />
        <button type="button" className="w-5 h-5 rounded hover:opacity-90 bg-no-repeat bg-center bg-cover" style={{ backgroundImage: `url('${IMG.buttonsGeneral}')`, backgroundPosition: '0 -60px' }} title="Defense" />
        <button type="button" className="w-5 h-5 rounded hover:opacity-90 bg-no-repeat bg-center bg-cover" style={{ backgroundImage: `url('${IMG.buttonsGeneral}')`, backgroundPosition: '0 -80px' }} title="Balanced" />
      </div>
      {expanded && (
        <div className="p-1.5">
          <div className="grid grid-cols-4 gap-0.5 p-0.5 bg-no-repeat bg-[length:100%_100%]" style={{ backgroundImage: `url('${IMG.containerslot}')` }}>
            {SLOTS.map(({ id, label }) => (
              <div key={id} className="aspect-square max-w-[32px] flex items-center justify-center text-[8px] text-ot-text/50 hover:opacity-80" title={label}>—</div>
            ))}
          </div>
          <div className="flex justify-between mt-1 text-[10px] text-ot-text/80">
            <span>Soul: 100</span>
            <span>Cap: 1000/1000</span>
          </div>
          <button
            type="button"
            className="w-full mt-1 py-0.5 text-[10px] border border-ot-border rounded hover:bg-ot-hover"
          >
            Stop
          </button>
        </div>
      )}
    </div>
  )

  return (
    <MiniWindow {...layoutProps} title={WINDOW_CONFIG.title} icon={WINDOW_CONFIG.icon}>
      {content}
    </MiniWindow>
  )
}
