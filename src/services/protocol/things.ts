import { ThingTypeManager } from '../things/thingTypeManager'
import { SpriteManager } from '../things/spriteManager'

export interface Things {
  version: number
  types: ThingTypeManager
  sprites: SpriteManager
  ready: boolean
}

let singleton: Things | null = null

export function getThings(): Things {
  if (!singleton) singleton = { version: 0, types: new ThingTypeManager(), sprites: new SpriteManager(), ready: false }
  if (typeof window !== 'undefined') (window as any).__otThings = singleton
  return singleton
}

export async function loadThings(version: number | string = 860): Promise<Things> {
  const v = typeof version === 'string' ? parseInt(version, 10) : version
  const t = getThings()
  try {
    if (t.ready && t.version === v) return t
    t.version = v
    t.ready = false

    const datUrl = `/public/things/${v}/tibia.dat`
    const sprUrl = `/public/things/${v}/tibia.spr`

    const looksLikeHtml = (buf: ArrayBuffer) => {
      const b = new Uint8Array(buf)
      if (b.length < 4) return true
      const s4 = String.fromCharCode(b[0], b[1], b[2], b[3]).toLowerCase()
      return s4 === '<!do' || s4 === '<htm' || s4 === '<bod'
    }

    try {
      const datRes = await fetch(datUrl)
      if (datRes.ok) {
        const datBuf = await datRes.arrayBuffer()
        const ct = datRes.headers.get('content-type') || ''
        if (ct.includes('text/html') || looksLikeHtml(datBuf)) {
          console.warn('[Things] DAT looks like HTML (wrong path/missing file):', { url: datRes.url || datUrl, contentType: ct })
        } else {
          t.types.loadDat(datBuf)
          console.log('[Things] DAT loaded:', { version: v, signature: t.types.datSignature })
        }
      } else {
        console.warn('[Things] Missing DAT:', { url: datUrl, status: datRes.status })
      }
    } catch (e) {
      console.error('[Things] DAT load failed:', e)
      console.log('[Things] DAT debug:', { version: v, signature: t.types.datSignature, counts: t.types.counts })
    }

    try {
      const sprRes = await fetch(sprUrl)
      if (sprRes.ok) {
        const sprBuf = await sprRes.arrayBuffer()
        const ct = sprRes.headers.get('content-type') || ''
        if (ct.includes('text/html') || looksLikeHtml(sprBuf)) {
          console.warn('[Things] SPR looks like HTML (wrong path/missing file):', { url: sprRes.url || sprUrl, contentType: ct })
        } else {
          t.sprites.loadSpr(sprBuf)
          console.log('[Things] SPR loaded:', { version: v, signature: t.sprites.signature, sprites: t.sprites.spriteCount })
        }
      } else {
        console.warn('[Things] Missing SPR:', { url: sprUrl, status: sprRes.status })
      }
    } catch (e) {
      console.error('[Things] SPR load failed:', e)
    }

    t.ready = true
    return t
  } catch (e) {
    console.error('[Things] Failed to load things:', e)
    t.ready = false
    return t
  }
}
