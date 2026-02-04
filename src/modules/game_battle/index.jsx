import { useState } from 'react'
import MiniWindow from '../../components/MiniWindow'

/**
 * BattleList - cópia de modules/game_battle/battle.otui
 * Imagens: public/images/game/battle/, public/images/options/
 */
const WINDOW_CONFIG = {
  title: 'Battle List',
  icon: '/images/game/battle/icon-battlelist.png',
}

const IMG = {
  buttonEmpty: '/images/options/button_empty.png',
  iconBattlelist: '/images/game/battle/icon-battlelist.png',
  players: '/images/game/battle/icon-battlelist-players.png',
  knights: '/images/game/battle/icon-battlelist-knight.png',
  paladins: '/images/game/battle/icon-battlelist-paladin.png',
  druids: '/images/game/battle/icon-battlelist-druid.png',
  sorcerers: '/images/game/battle/icon-battlelist-sorcerer.png',
  monks: '/images/game/battle/icon-battlelist-monk.png',
  summons: '/images/game/battle/icon-battlelist-summon.png',
  npcs: '/images/game/battle/icon-battlelist-npc.png',
  monsters: '/images/game/battle/icon-battlelist-monster.png',
  skulls: '/images/game/battle/icon-battlelist-skull.png',
  party: '/images/game/battle/icon-battlelist-party.png',
  guild: '/images/game/battle/icon-battlelist-own-guild.png',
  miniborder: '/images/ui/miniborder.png',
}

const FILTER_ICONS = [
  { id: 'players', title: 'Ocultar jogadores', img: IMG.players },
  { id: 'knights', title: 'Ocultar knights', img: IMG.knights },
  { id: 'paladins', title: 'Ocultar paladins', img: IMG.paladins },
  { id: 'druids', title: 'Ocultar druids', img: IMG.druids },
  { id: 'sorcerers', title: 'Ocultar sorcerers', img: IMG.sorcerers },
  { id: 'monks', title: 'Ocultar monks', img: IMG.monks },
  { id: 'summons', title: 'Ocultar summons', img: IMG.summons },
  { id: 'npcs', title: 'Ocultar NPCs', img: IMG.npcs },
  { id: 'monsters', title: 'Ocultar monstros', img: IMG.monsters },
  { id: 'skulls', title: 'Ocultar não-skull', img: IMG.skulls },
  { id: 'party', title: 'Ocultar party', img: IMG.party },
  { id: 'guild', title: 'Ocultar guild', img: IMG.guild },
]

export default function BattleList(layoutProps) {
  const [filters, setFilters] = useState({})
  const toggleFilter = (id) => setFilters((f) => ({ ...f, [id]: !f[id] }))

  const content = (
    <div className="min-h-[120px] flex flex-col">
      {/* filterPanel - grid de BattleIcon */}
      <div className="p-2 flex flex-wrap gap-0.5 justify-center" style={{ width: 130 }}>
        {FILTER_ICONS.slice(0, 12).map(({ id, title, img }) => (
          <button
            key={id}
            type="button"
            title={title}
            onClick={() => toggleFilter(id)}
            className={`w-5 h-5 flex items-center justify-center bg-no-repeat bg-center transition-colors flex-shrink-0 ${
              filters[id] ? 'opacity-60' : 'hover:opacity-90'
            }`}
            style={{ backgroundImage: `url('${img}')`, backgroundSize: 'auto' }}
          >
            <img src={img} alt="" className="w-3 h-3 object-contain pointer-events-none" />
          </button>
        ))}
      </div>
      <div className="h-px bg-ot-border mx-1" />
      {/* MiniWindowContents / battlePanel - lista de criaturas */}
      <div className="flex-1 overflow-y-auto p-1 min-h-[60px] space-y-0.5">
        <div className="text-ot-text/60 text-[10px] px-1 py-0.5 hover:bg-ot-hover rounded cursor-default">
          Criatura 1 (100%)
        </div>
        <div className="text-ot-text/60 text-[10px] px-1 py-0.5 hover:bg-ot-hover rounded cursor-default">
          Criatura 2 (80%)
        </div>
        <div className="text-ot-text/60 text-[10px] px-1 py-0.5 hover:bg-ot-hover rounded cursor-default">
          Criatura 3 (50%)
        </div>
      </div>
    </div>
  )

  return (
    <MiniWindow {...layoutProps} title={WINDOW_CONFIG.title} icon={WINDOW_CONFIG.icon}>
      {content}
    </MiniWindow>
  )
}
