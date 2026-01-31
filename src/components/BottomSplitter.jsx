import { useRef, useCallback } from 'react'
import OtcImage from './ui/OtcImage'

/**
 * BottomSplitter - cópia de gameinterface.otui (bottomSplitter)
 * image-source: /images/ui/actionbar/splitterActBottom - image-clip + repeat-x.
 */
const IMG = {
  splitterBottom: '/images/ui/actionbar/splitterActBottom.png',
}

const MIN_HEIGHT = 120
const MAX_HEIGHT = 280

export default function BottomSplitter({ height, onHeightChange, minHeight = MIN_HEIGHT, maxHeight = MAX_HEIGHT }) {
  const ref = useRef(null)
  const startY = useRef(0)
  const startHeight = useRef(0)

  const onMouseDown = useCallback(
    (e) => {
      e.preventDefault()
      startY.current = e.clientY
      startHeight.current = height
      const onMouseMove = (e2) => {
        const dy = e2.clientY - startY.current
        const newHeight = Math.max(minHeight, Math.min(maxHeight, startHeight.current - dy))
        onHeightChange(newHeight)
      }
      const onMouseUp = () => {
        document.removeEventListener('mousemove', onMouseMove)
        document.removeEventListener('mouseup', onMouseUp)
      }
      document.addEventListener('mousemove', onMouseMove)
      document.addEventListener('mouseup', onMouseUp)
    },
    [height, onHeightChange, minHeight, maxHeight]
  )

  return (
    <OtcImage
      ref={ref}
      as="div"
      role="separator"
      onMouseDown={onMouseDown}
      src={IMG.splitterBottom}
      repeat="x"
      className="h-1.5 flex-shrink-0 hover:opacity-90 cursor-ns-resize flex items-center justify-center bg-ot-border group"
      style={{ backgroundSize: 'auto 100%' }}
      title="Arraste para redimensionar"
    />
  )
}
