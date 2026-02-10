import OtcImage from './OtcImage'
import GameConsolePanel from '../modules/game_console/ui/GameConsolePanel'

/**
 * GameBottomPanel - cópia de gameinterface.otui (gameBottomPanel)
 * image-source: /images/ui/background_dark (image-repeated) - image-clip: região que se repete.
 */
const IMG = {
  backgroundDark: '/images/ui/background_dark.png',
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
      <div className="flex-1 min-w-0 min-h-0 h-full">
        <GameConsolePanel />
      </div>
    </OtcImage>
  )
}
