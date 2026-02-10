import HealthMana from '../game_healthinfo'
import { g_game } from '../../services/client/Game'

const IMG = {
  topstatsButtonPanel: '/images/ui/topstats_button_panel.png',
  inventory: '/images/topbuttons/inventory.png',
  skills: '/images/topbuttons/skills.png',
  battle: '/images/topbuttons/battle.png',
  options: '/images/topbuttons/options.png',
  logout: '/images/topbuttons/logout.png',
}

function TopIconButton({ title, icon, onClick }) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className="w-[27px] h-[27px] mx-0.5 border border-ot-border bg-ot-panel hover:bg-ot-hover flex items-center justify-center flex-shrink-0"
    >
      <span
        className="w-4 h-4 bg-no-repeat bg-center bg-contain"
        style={{ backgroundImage: `url('${icon}')` }}
      />
    </button>
  )
}

export default function ClientTopMenu() {
  const toggleWindow = (windowId) => {
    window.dispatchEvent(new CustomEvent('ot:topmenuToggleWindow', { detail: { windowId } }))
  }

  const onLogout = () => {
    g_game.getProtocolGame?.()?.sendLogout?.()
  }

  return (
    <div className="h-8 flex-shrink-0 flex items-center px-2 bg-ot-panel border-b border-ot-border shadow-ot-panel">
      {/* image-clip: x y width height = elemento width x height, backgroundPosition -x -y, backgroundSize auto */}
      <button type="button" className="w-[9px] h-[27px] hover:opacity-90 mx-0.5 bg-no-repeat flex-shrink-0" style={{ backgroundImage: `url('${IMG.topstatsButtonPanel}')`, backgroundPosition: '-27px 0', backgroundSize: 'auto' }} title="Aumentar painel esquerdo" />
      <button type="button" className="w-[9px] h-[27px] hover:opacity-90 mx-0.5 bg-no-repeat flex-shrink-0" style={{ backgroundImage: `url('${IMG.topstatsButtonPanel}')`, backgroundPosition: '-36px -26px', backgroundSize: 'auto' }} title="Diminuir painel esquerdo" />
      <div className="flex-1 flex items-center justify-center min-w-0">
        <HealthMana />
      </div>
      <TopIconButton title="Inventory" icon={IMG.inventory} onClick={() => toggleWindow('inventoryWindow')} />
      <TopIconButton title="Skills" icon={IMG.skills} onClick={() => toggleWindow('skillWindow')} />
      <TopIconButton title="Battle" icon={IMG.battle} onClick={() => toggleWindow('battleWindow')} />
      <TopIconButton title="Options" icon={IMG.options} onClick={() => toggleWindow('optionsWindow')} />
      <TopIconButton title="Logout" icon={IMG.logout} onClick={onLogout} />
      <button type="button" className="w-[9px] h-[27px] hover:opacity-90 mx-0.5 bg-no-repeat flex-shrink-0" style={{ backgroundImage: `url('${IMG.topstatsButtonPanel}')`, backgroundPosition: '-9px -27px', backgroundSize: 'auto' }} title="Diminuir painel direito" />
      <button type="button" className="w-[9px] h-[27px] hover:opacity-90 mx-0.5 bg-no-repeat flex-shrink-0" style={{ backgroundImage: `url('${IMG.topstatsButtonPanel}')`, backgroundPosition: '0 0', backgroundSize: 'auto' }} title="Aumentar painel direito" />
    </div>
  )
}
