import { forwardRef, useRef, useEffect, useState } from 'react'

/**
 * OtcImage - desenho idêntico ao OTClient via Canvas.
 * Implementa image-source, image-clip, image-repeated, image-border (9-slice)
 * desenhando em canvas como o cliente C++ faz.
 */
function parseClip(clip) {
  if (!clip) return null
  if (typeof clip === 'string') {
    const parts = clip.trim().split(/\s+/).map(Number)
    if (parts.length >= 4) return { x: parts[0], y: parts[1], width: parts[2], height: parts[3] }
    return null
  }
  if (
    typeof clip.x === 'number' &&
    typeof clip.width === 'number' &&
    typeof clip.height === 'number'
  ) {
    return { x: clip.x, y: clip.y ?? 0, width: clip.width, height: clip.height }
  }
  return null
}

function normalizeBorder(border) {
  if (border == null) return null
  if (typeof border === 'number') return { top: border, right: border, bottom: border, left: border }
  return {
    top: border.top ?? 4,
    right: border.right ?? 4,
    bottom: border.bottom ?? 4,
    left: border.left ?? 4,
  }
}

function normalizeOffset(offset) {
  if (offset == null) return { x: 0, y: 0 }
  if (typeof offset === 'number') return { x: offset, y: offset }
  return { x: offset.x ?? 0, y: offset.y ?? 0 }
}

/**
 * Desenha 9-slice como no OTClient: cantos 1:1, bordas esticam em 1 eixo, centro estica nos 2.
 */
function drawNineSlice(ctx, img, b, destW, destH) {
  const iw = img.naturalWidth
  const ih = img.naturalHeight
  const sl = b.left
  const sr = b.right
  const st = b.top
  const sb = b.bottom
  const scx = iw - sl - sr
  const scy = ih - st - sb
  const dcx = Math.max(0, destW - sl - sr)
  const dcy = Math.max(0, destH - st - sb)

  // Cantos (1:1)
  ctx.drawImage(img, 0, 0, sl, st, 0, 0, sl, st)
  ctx.drawImage(img, iw - sr, 0, sr, st, destW - sr, 0, sr, st)
  ctx.drawImage(img, 0, ih - sb, sl, sb, 0, destH - sb, sl, sb)
  ctx.drawImage(img, iw - sr, ih - sb, sr, sb, destW - sr, destH - sb, sr, sb)
  // Bordas (esticam em 1 eixo)
  if (dcx > 0) {
    ctx.drawImage(img, sl, 0, scx, st, sl, 0, dcx, st)
    ctx.drawImage(img, sl, ih - sb, scx, sb, sl, destH - sb, dcx, sb)
  }
  if (dcy > 0) {
    ctx.drawImage(img, 0, st, sl, scy, 0, st, sl, dcy)
    ctx.drawImage(img, iw - sr, st, sr, scy, destW - sr, st, sr, dcy)
  }
  // Centro (estica nos 2)
  if (dcx > 0 && dcy > 0) {
    ctx.drawImage(img, sl, st, scx, scy, sl, st, dcx, dcy)
  }
}

/**
 * Desenha região clipada em tiles para preencher destW x destH (como image-repeated no OTClient).
 */
function drawTiledClip(ctx, img, clip, destW, destH, repeatX, repeatY, offsetX, offsetY) {
  const sw = clip.width
  const sh = clip.height
  const sx = clip.x
  const sy = clip.y
  const startX = repeatX ? -((offsetX % sw) + sw) % sw : 0
  const startY = repeatY ? -((offsetY % sh) + sh) % sh : 0
  for (let dy = startY; dy < destH; dy += repeatY ? sh : destH + 1) {
    for (let dx = startX; dx < destW; dx += repeatX ? sw : destW + 1) {
      const dw = Math.min(sw, destW - dx)
      const dh = Math.min(sh, destH - dy)
      if (dw > 0 && dh > 0) {
        ctx.drawImage(img, sx, sy, dw, dh, dx, dy, dw, dh)
      }
    }
  }
}

/**
 * Desenha imagem inteira em tiles (image-repeated sem clip). Respeita repeat-x / repeat-y.
 */
function drawTiledFull(ctx, img, destW, destH, repeatX, repeatY, offsetX, offsetY) {
  const iw = img.naturalWidth
  const ih = img.naturalHeight
  const startX = repeatX ? -((offsetX % iw) + iw) % iw : 0
  const startY = repeatY ? -((offsetY % ih) + ih) % ih : 0
  const endX = repeatX ? destW : Math.min(iw, destW)
  const endY = repeatY ? destH : Math.min(ih, destH)
  for (let dy = startY; dy < endY; dy += repeatY ? ih : destH) {
    for (let dx = startX; dx < endX; dx += repeatX ? iw : destW) {
      const dw = Math.min(iw, destW - dx)
      const dh = Math.min(ih, destH - dy)
      if (dw > 0 && dh > 0) {
        ctx.drawImage(img, 0, 0, dw, dh, dx, dy, dw, dh)
      }
    }
  }
}

const OtcImage = forwardRef(function OtcImage(
  {
    src,
    clip,
    repeated,
    repeat,
    border,
    color,
    fixedRatio = false,
    smooth = true,
    autoResize = false,
    offset,
    className = '',
    style = {},
    as, // ignorado: canvas sempre em div
    children,
    ...rest
  },
  ref
) {
  const repeatedVal = repeated ?? repeat ?? false
  const repeatX = repeatedVal === true || repeatedVal === 'x'
  const repeatY = repeatedVal === true || repeatedVal === 'y'
  const hasBorder = !!normalizeBorder(border)
  const parsedClip = parseClip(clip)
  const hasClip = !!parsedClip
  const off = normalizeOffset(offset)

  const containerRef = useRef(null)
  const canvasRef = useRef(null)
  const loadIdRef = useRef(0)
  const [size, setSize] = useState({ w: 0, h: 0 })
  const [img, setImg] = useState(null)
  const [imgError, setImgError] = useState(false)

  useEffect(() => {
    if (!src) return
    setImgError(false)
    setImg(null)
    loadIdRef.current += 1
    const thisLoadId = loadIdRef.current
    const image = new Image()
    image.onload = () => {
      if (thisLoadId === loadIdRef.current) setImg(image)
    }
    image.onerror = () => {
      if (thisLoadId === loadIdRef.current) setImgError(true)
    }
    image.src = src
    return () => {
      image.src = ''
    }
  }, [src])

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const ro = new ResizeObserver(() => {
      setSize({ w: el.clientWidth, h: el.clientHeight })
    })
    ro.observe(el)
    setSize({ w: el.clientWidth, h: el.clientHeight })
    return () => ro.disconnect()
  }, [])

  useEffect(() => {
    const canvas = canvasRef.current
    const image = img
    if (!canvas || !image || size.w <= 0 || size.h <= 0) return

    const dpr = window.devicePixelRatio || 1
    const w = Math.max(1, Math.floor(size.w * dpr))
    const h = Math.max(1, Math.floor(size.h * dpr))
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w
      canvas.height = h
    }

    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.imageSmoothingEnabled = smooth
    ctx.imageSmoothingQuality = smooth ? 'high' : 'low'

    const drawW = size.w
    const drawH = size.h
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, drawW, drawH)

    if (hasBorder) {
      const b = normalizeBorder(border)
      drawNineSlice(ctx, image, b, drawW, drawH)
    } else if (hasClip) {
      if (repeatX || repeatY) {
        drawTiledClip(ctx, image, parsedClip, drawW, drawH, repeatX, repeatY, off.x, off.y)
      } else {
        ctx.drawImage(
          image,
          parsedClip.x, parsedClip.y, parsedClip.width, parsedClip.height,
          0, 0, drawW, drawH
        )
      }
    } else {
      if (repeatX || repeatY) {
        drawTiledFull(ctx, image, drawW, drawH, repeatX, repeatY, off.x, off.y)
      } else if (autoResize) {
        ctx.drawImage(image, 0, 0, image.naturalWidth, image.naturalHeight, 0, 0, drawW, drawH)
      } else if (fixedRatio) {
        const scale = Math.min(drawW / image.naturalWidth, drawH / image.naturalHeight)
        const dw = image.naturalWidth * scale
        const dh = image.naturalHeight * scale
        const dx = (drawW - dw) / 2 + off.x
        const dy = (drawH - dh) / 2 + off.y
        ctx.drawImage(image, 0, 0, image.naturalWidth, image.naturalHeight, dx, dy, dw, dh)
      } else {
        ctx.drawImage(image, 0, 0, image.naturalWidth, image.naturalHeight, off.x, off.y, image.naturalWidth, image.naturalHeight)
      }
    }

    if (color) {
      ctx.fillStyle = color
      ctx.globalCompositeOperation = 'multiply'
      ctx.fillRect(0, 0, drawW, drawH)
      ctx.globalCompositeOperation = 'source-over'
    }
  }, [img, size, hasBorder, hasClip, parsedClip, repeatedVal, repeatX, repeatY, off.x, off.y, border, autoResize, fixedRatio, smooth, color])

  return (
    <div
      ref={(node) => {
        containerRef.current = node
        if (typeof ref === 'function') ref(node)
        else if (ref) ref.current = node
      }}
      className={className}
      style={{ position: 'relative', overflow: 'hidden', ...style }}
      {...rest}
    >
      <canvas
        ref={canvasRef}
        style={{
          position: 'absolute',
          left: 0,
          top: 0,
          width: '100%',
          height: '100%',
          display: 'block',
          pointerEvents: 'none',
        }}
      />
      {imgError && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background: 'rgba(0,0,0,0.3)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 12,
            color: '#888',
          }}
        >
          Imagem não carregada
        </div>
      )}
      <div style={{ position: 'relative', zIndex: 1 }}>{children}</div>
    </div>
  )
})

export default OtcImage
