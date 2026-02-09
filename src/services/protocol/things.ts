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

    // Vite serves files from /public at the site root ("/"), not under "/public".
    // Keep both case variants as fallback to support different file naming.
    const datCandidates = [`/things/${v}/Tibia.dat`, `/things/${v}/tibia.dat`]
    const sprCandidates = [`/things/${v}/Tibia.spr`, `/things/${v}/tibia.spr`]

    const looksLikeHtml = (buf: ArrayBuffer) => {
      const b = new Uint8Array(buf)
      if (b.length < 4) return true
      const s4 = String.fromCharCode(b[0], b[1], b[2], b[3]).toLowerCase()
      return s4 === '<!do' || s4 === '<htm' || s4 === '<bod'
    }

    const loadBinaryFromCandidates = async (
      label: 'DAT' | 'SPR',
      urls: string[]
    ): Promise<ArrayBuffer | null> => {
      for (const url of urls) {
        try {
          const res = await fetch(url)
          if (!res.ok) continue
          const buf = await res.arrayBuffer()
          const ct = res.headers.get('content-type') || ''
          if (ct.includes('text/html') || looksLikeHtml(buf)) {
            console.warn(`[Things] ${label} looks like HTML (wrong path/missing file):`, { url: res.url || url, contentType: ct })
            continue
          }
          return buf
        } catch {
          // Try next candidate.
        }
      }
      return null
    }

    let datLoaded = false
    try {
      const datBuf = await loadBinaryFromCandidates('DAT', datCandidates)
      if (datBuf) {
        t.types.loadDat(datBuf)
        datLoaded = true
        console.log('[Things] DAT loaded:', { version: v, signature: t.types.datSignature })
      } else {
        console.warn('[Things] Missing DAT:', { tried: datCandidates })
      }
    } catch (e) {
      console.error('[Things] DAT load failed:', e)
      console.log('[Things] DAT debug:', { version: v, signature: t.types.datSignature, counts: t.types.counts })
    }

    let sprLoaded = false
    try {
      const sprBuf = await loadBinaryFromCandidates('SPR', sprCandidates)
      if (sprBuf) {
        t.sprites.loadSpr(sprBuf)
        sprLoaded = true
        console.log('[Things] SPR loaded:', { version: v, signature: t.sprites.signature, sprites: t.sprites.spriteCount })
      } else {
        console.warn('[Things] Missing SPR:', { tried: sprCandidates })
      }
    } catch (e) {
      console.error('[Things] SPR load failed:', e)
    }

    t.ready = datLoaded && sprLoaded
    return t
  } catch (e) {
    console.error('[Things] Failed to load things:', e)
    t.ready = false
    return t
  }
}
