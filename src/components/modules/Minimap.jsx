import MiniWindow from '../ui/MiniWindow'

/**
 * Minimap - cópia de modules/game_minimap/minimap.otui
 * Imagens: public/images/ui/1pixel_down_frame, public/images/automap/
 */
const WINDOW_CONFIG = {
  title: 'Minimap',
  icon: '/images/topbuttons/minimap',
}

const IMG = {
  minimapBorder: '/images/ui/1pixel_down_frame.png',
  automapButtons: '/images/automap/automap_buttons.png',
  automapRose: '/images/automap/automap_rose.png',
  automapLayers: '/images/automap/automap_indicator_maplayers.png',
  verticalLineDark: '/images/ui/vertical_line_dark.png',
}

export default function Minimap(layoutProps) {
  const content = (
    <div className="rounded border border-ot-border bg-ot-panel overflow-hidden p-1 flex-1 min-h-0">
      <div className="flex gap-1">
        {/* minimapBorder - image-source: /images/ui/1pixel_down_frame, size: 115 111 */}
        <div className="w-[115px] h-[111px] overflow-hidden flex-shrink-0 relative bg-no-repeat bg-cover" style={{ backgroundImage: `url('${IMG.minimapBorder}')` }}>
          <div className="absolute inset-1 bg-ot-dark flex items-center justify-center text-ot-text/30 text-[9px]">Mapa</div>
        </div>
        {/* layersPanel - zoom (image-clip 0 40 / 0 20), fullMap (0 0), rose */}
        <div className="flex flex-col items-center gap-0.5">
          <button type="button" className="w-5 h-5 rounded hover:opacity-90 bg-no-repeat bg-center bg-cover" style={{ backgroundImage: `url('${IMG.automapButtons}')`, backgroundPosition: '0 -40px' }} title="Zoom +" />
          <button type="button" className="w-5 h-5 rounded hover:opacity-90 bg-no-repeat bg-center bg-cover" style={{ backgroundImage: `url('${IMG.automapButtons}')`, backgroundPosition: '0 -20px' }} title="Zoom −" />
          <div className="w-px h-2 bg-ot-border" style={{ backgroundImage: `url('${IMG.verticalLineDark}')` }} />
          <button type="button" className="w-5 h-5 rounded hover:opacity-90 bg-no-repeat bg-center bg-cover" style={{ backgroundImage: `url('${IMG.automapButtons}')`, backgroundPosition: '0 0' }} title="Mapa completo" />
          <div className="w-[43px] h-[43px] rounded bg-no-repeat bg-cover" style={{ backgroundImage: `url('${IMG.automapRose}')`, backgroundPosition: '0 0' }} title="Rosa dos ventos" />
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
