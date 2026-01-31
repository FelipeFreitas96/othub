/**
 * HealthMana - cópia de modules/game_healthinfo/healthinfo.otui
 * Imagens: public/images/healthmana/ (mesmo path do OTClient)
 */
const IMG = {
  hitpointsSymbol: '/images/healthmana/hitpoints_symbol.png',
  manaSymbol: '/images/healthmana/mana_symbol.png',
  barBorder: '/images/healthmana/hitpoints_manapoints_bar_border.png',
  hitpointsBarFilled: '/images/healthmana/hitpoints_bar_filled.png',
  manaBarFilled: '/images/healthmana/mana_bar_filled.png',
}

export default function HealthMana() {
  const health = { current: 155, total: 155 }
  const mana = { current: 60, total: 60 }
  const healthPct = (health.current / health.total) * 100
  const manaPct = (mana.current / mana.total) * 100

  return (
    <div className="flex items-center gap-2">
      {/* Linha de HP - icon hitpoints_symbol, total bar_border, current hitpoints_bar_filled */}
      <div className="flex items-center gap-1 min-w-[140px]">
        <img src={IMG.hitpointsSymbol} alt="" className="w-3 h-[11px] flex-shrink-0 object-contain" />
        <div
          className="flex-1 min-w-0 h-[11px] overflow-hidden bg-no-repeat bg-[length:100%_100%]"
          style={{ backgroundImage: `url('${IMG.barBorder}')` }}
        >
          <div
            className="h-full bg-no-repeat bg-left bg-[length:auto_100%]"
            style={{ width: `${healthPct}%`, backgroundImage: `url('${IMG.hitpointsBarFilled}')` }}
          />
        </div>
        <span className="text-ot-text text-[11px] w-11 text-right tabular-nums">{health.current}</span>
      </div>
      {/* Linha de Mana - icon mana_symbol, total bar_border, current mana_bar_filled */}
      <div className="flex items-center gap-1 min-w-[140px]">
        <img src={IMG.manaSymbol} alt="" className="w-3 h-[11px] flex-shrink-0 object-contain" />
        <div
          className="flex-1 min-w-0 h-[11px] overflow-hidden bg-no-repeat bg-[length:100%_100%]"
          style={{ backgroundImage: `url('${IMG.barBorder}')` }}
        >
          <div
            className="h-full bg-no-repeat bg-left bg-[length:auto_100%]"
            style={{ width: `${manaPct}%`, backgroundImage: `url('${IMG.manaBarFilled}')` }}
          />
        </div>
        <span className="text-ot-text text-[11px] w-11 text-right tabular-nums">{mana.current}</span>
      </div>
    </div>
  )
}
