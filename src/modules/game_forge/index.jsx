import MiniWindow from '../../components/MiniWindow'
const WINDOW_CONFIG = {
  title: 'GAME FORGE',
  icon: '/images/topbuttons/options.png',
}
export default function ModulePlaceholder(layoutProps) {
  return (
    <MiniWindow {...layoutProps} title={WINDOW_CONFIG.title} icon={WINDOW_CONFIG.icon} resizable={false}>
      <div className=\"p-2 text-[11px] text-ot-text/80\">game_forge module placeholder (OTC parity scaffold).</div>
    </MiniWindow>
  )
}
