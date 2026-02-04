import OtcImage from './OtcImage'

/**
 * GameLeftPanel (gameLeftPanel) - cópia de gameinterface.otui
 * Só o frame (9-slice). As janelas são renderizadas fora, em camada flutuante.
 */
const IMG = { panelFrame: '/images/ui/2pixel_up_frame_borderimage.png' }
const WIDTH = 192

export default function GameLeftPanel({ panelId = 'left' }) {
  return (
    <OtcImage
      data-panel={panelId}
      src={IMG.panelFrame}
      border={4}
      className="flex-shrink-0 overflow-hidden relative h-full"
      style={{ width: WIDTH, height: '100%' }}
    />
  )
}
