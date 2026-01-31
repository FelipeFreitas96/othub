import HealthMana from './modules/HealthMana'

/**
 * TopStatsBar - cópia de gameinterface.otui (gameTopPanel)
 * Imagens: public/images/ui/ (image-source: /images/ui/topstats_button_panel, image-clip)
 */
const IMG = {
  topstatsButtonPanel: '/images/ui/topstats_button_panel.png',
}

export default function TopStatsBar() {
  return (
    <div className="h-8 flex-shrink-0 flex items-center px-2 bg-ot-panel border-b border-ot-border shadow-ot-panel">
      {/* image-clip: x y width height = elemento width x height, backgroundPosition -x -y, backgroundSize auto */}
      <button type="button" className="w-[9px] h-[27px] hover:opacity-90 mx-0.5 bg-no-repeat flex-shrink-0" style={{ backgroundImage: `url('${IMG.topstatsButtonPanel}')`, backgroundPosition: '-27px 0', backgroundSize: 'auto' }} title="Aumentar painel esquerdo" />
      <button type="button" className="w-[9px] h-[27px] hover:opacity-90 mx-0.5 bg-no-repeat flex-shrink-0" style={{ backgroundImage: `url('${IMG.topstatsButtonPanel}')`, backgroundPosition: '-36px -26px', backgroundSize: 'auto' }} title="Diminuir painel esquerdo" />
      <div className="flex-1 flex items-center justify-center min-w-0">
        <HealthMana />
      </div>
      <button type="button" className="w-[9px] h-[27px] hover:opacity-90 mx-0.5 bg-no-repeat flex-shrink-0" style={{ backgroundImage: `url('${IMG.topstatsButtonPanel}')`, backgroundPosition: '-9px -27px', backgroundSize: 'auto' }} title="Diminuir painel direito" />
      <button type="button" className="w-[9px] h-[27px] hover:opacity-90 mx-0.5 bg-no-repeat flex-shrink-0" style={{ backgroundImage: `url('${IMG.topstatsButtonPanel}')`, backgroundPosition: '0 0', backgroundSize: 'auto' }} title="Aumentar painel direito" />
    </div>
  )
}
