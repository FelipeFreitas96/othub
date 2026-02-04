import OtcImage from './OtcImage'

/**
 * GameBottomPanel - cópia de gameinterface.otui (gameBottomPanel)
 * image-source: /images/ui/background_dark (image-repeated) - image-clip: região que se repete.
 * bottomLock: icon-source: /images/ui/actionbar/locked
 */
const IMG = {
  backgroundDark: '/images/ui/background_dark.png',
  actionbarLocked: '/images/ui/actionbar/locked.png',
}

export default function GameBottomPanel({ height = 200 }) {
  return (
    <OtcImage
      as="div"
      src={IMG.backgroundDark}
      repeated
      className="flex-shrink-0 border-t border-ot-border flex items-stretch"
      style={{ height: `${height}px`, minHeight: '120px' }}
    >
      {/* gameBottomStatsBarPanel */}
      <div className="flex-1 flex items-center px-2 border-r border-ot-border">
        <span className="text-ot-text text-xs mr-2">HP: 155/155</span>
        <span className="text-ot-text text-xs">Mana: 60/60</span>
      </div>
      {/* gameBottomActionPanel - slots de hotkey */}
      <div className="flex gap-0.5 p-1 items-end flex-wrap content-end">
        {Array.from({ length: 12 }).map((_, i) => (
          <button
            key={i}
            type="button"
            className="w-8 h-8 border border-ot-border bg-ot-dark hover:bg-ot-hover rounded flex-shrink-0 flex items-center justify-center text-ot-text/70 text-[10px]"
            title={`Slot ${i + 1}`}
          >
            {i + 1}
          </button>
        ))}
      </div>
      {/* bottomLock - icon-source: /images/ui/actionbar/locked */}
      <button type="button" className="w-3 border-l border-ot-border flex items-center justify-center hover:bg-ot-hover bg-no-repeat bg-center" style={{ backgroundImage: `url('${IMG.actionbarLocked}')` }} title="Travar painel" />
    </OtcImage>
  )
}
