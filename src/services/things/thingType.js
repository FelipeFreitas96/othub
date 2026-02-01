/**
 * ThingType – 1:1 port of OTClient src/client/thingtype.h + thingtype.cpp
 * Copyright (c) 2010-2020 OTClient; ported to JS for this project.
 */

import { FEATURES, isFeatureEnabled } from '../protocol/features.js'
import { g_game } from '../client/Game.js'

// thingtype.h FrameGroupType
export const FrameGroupType = {
  Default: 0,
  Idle: 0,
  Moving: 1,
}

// thingtype.h ThingCategory
export const ThingCategory = {
  Item: 0,
  Creature: 1,
  Effect: 2,
  Missile: 3,
  Invalid: 4,
  Last: 4,
}

// thingtype.h ThingAttr (exact OTC enum)
export const ThingAttr = {
  Ground: 0,
  GroundBorder: 1,
  OnBottom: 2,
  OnTop: 3,
  Container: 4,
  Stackable: 5,
  ForceUse: 6,
  MultiUse: 7,
  Writable: 8,
  WritableOnce: 9,
  FluidContainer: 10,
  Splash: 11,
  NotWalkable: 12,
  NotMoveable: 13,
  BlockProjectile: 14,
  NotPathable: 15,
  Pickupable: 16,
  Hangable: 17,
  HookSouth: 18,
  HookEast: 19,
  Rotateable: 20,
  Light: 21,
  DontHide: 22,
  Translucent: 23,
  Displacement: 24,
  Elevation: 25,
  LyingCorpse: 26,
  AnimateAlways: 27,
  MinimapColor: 28,
  LensHelp: 29,
  FullGround: 30,
  Look: 31,
  Cloth: 32,
  Market: 33,
  Usable: 34,
  Wrapable: 35,
  Unwrapable: 36,
  TopEffect: 37,
  Opacity: 100,
  NotPreWalkable: 101,
  DefaultAction: 251, // 10.10+ .dat byte 35
  FloorChange: 252,
  NoMoveAnimation: 253, // 10.10+ .dat byte 16
  Chargeable: 254, // deprecated; 10.10+ .dat byte 254 = Usable
  Last: 255,
}

export class ThingType {
  constructor() {
    this.m_category = ThingCategory.Invalid
    this.m_id = 0
    this.m_null = true
    this.m_exactSize = 0
    this.m_realSize = 0
    this.m_animator = null
    this.m_numPatternX = 0
    this.m_numPatternY = 0
    this.m_numPatternZ = 0
    this.m_animationPhases = 0
    this.m_layers = 0
    this.m_elevation = 0
    this.m_opacity = 1.0
    this.m_displacement = { x: 0, y: 0 }
    this.m_size = { width: 1, height: 1 }
    this.m_attribs = new Map()
    this.m_spritesIndex = []
    this.m_frameGroups = []
    this.m_customImage = ''
    /** OTC: m_textureData per animation phase; we cache canvas per (phase, layer, x, y, z) */
    this.m_textureData = []
    this.m_textureCache = new Map()
  }

  getId() { return this.m_id }
  getCategory() { return this.m_category }
  isNull() { return this.m_null }
  hasAttr(attr) { return this.m_attribs.has(attr) }

  getWidth() { return this.m_size.width }
  getHeight() { return this.m_size.height }
  getLayers() { return this.m_layers }
  getNumPatternX() { return this.m_numPatternX }
  getNumPatternY() { return this.m_numPatternY }
  getNumPatternZ() { return this.m_numPatternZ }
  getAnimationPhases() { return this.m_animationPhases }
  getDisplacement() { return this.m_displacement }
  getDisplacementX() { return this.m_displacement.x }
  getDisplacementY() { return this.m_displacement.y }
  getElevation() { return this.m_elevation }

  isGround() { return this.m_attribs.has(ThingAttr.Ground) }
  isGroundBorder() { return this.m_attribs.has(ThingAttr.GroundBorder) }
  isOnBottom() { return this.m_attribs.has(ThingAttr.OnBottom) }
  isOnTop() { return this.m_attribs.has(ThingAttr.OnTop) }
  isFullGround() { return this.m_attribs.has(ThingAttr.FullGround) }
  blockProjectile() { return this.m_attribs.has(ThingAttr.BlockProjectile) }
  isDontHide() { return this.m_attribs.has(ThingAttr.DontHide) }
  hasElevation() { return this.m_attribs.has(ThingAttr.Elevation) }
  isTranslucent() { return this.m_attribs.has(ThingAttr.Translucent) }
  hasDisplacement() { return this.m_attribs.has(ThingAttr.Displacement) }
  isTopEffect() { return this.m_attribs.has(ThingAttr.TopEffect) }
  isChargeable() { return this.m_attribs.has(ThingAttr.Chargeable) }
  isAnimateAlways() { return this.m_attribs.has(ThingAttr.AnimateAlways) }

  isStackable() { return this.m_attribs.has(ThingAttr.Stackable) }
  isFluidContainer() { return this.m_attribs.has(ThingAttr.FluidContainer) }
  isSplash() { return this.m_attribs.has(ThingAttr.Splash) }

  get stackable() { return this.isStackable() }
  get fluid() { return this.isFluidContainer() }
  get splash() { return this.isSplash() }
  get chargeable() { return this.isChargeable() }
  get ground() { return this.isGround() }
  get groundBorder() { return this.isGroundBorder() }
  get onBottom() { return this.isOnBottom() }
  get onTop() { return this.isOnTop() }
  get fullGround() { return this.isFullGround() }
  get blockProjectile() { return this.m_attribs.has(ThingAttr.BlockProjectile) }
  get dontHide() { return this.isDontHide() }
  get elevation() { return this.m_elevation }
  get displacement() { return this.m_displacement }
  get width() { return this.m_size.width }
  get height() { return this.m_size.height }
  get layers() { return this.m_layers }
  get patternX() { return this.m_numPatternX }
  get patternY() { return this.m_numPatternY }
  get patternZ() { return this.m_numPatternZ }
  get phases() { return this.m_animationPhases }
  get spriteIds() { return this.m_spritesIndex }
  get frameGroups() { return this.m_frameGroups }

  /**
   * OTC getSpriteIndex(w, h, l, x, y, z, a)
   * index = ((((((a % m_animationPhases) * m_numPatternZ + z) * m_numPatternY + y) * m_numPatternX + x) * m_layers + l) * m_size.height + h) * m_size.width + w
   */
  getSpriteIndex(w, h, l, x, y, z, a) {
    const phases = Math.max(1, this.m_animationPhases)
    const pz = this.m_numPatternZ
    const py = this.m_numPatternY
    const px = this.m_numPatternX
    const layers = this.m_layers
    const height = this.m_size.height
    const width = this.m_size.width
    const index = ((((((a % phases) * pz + z) * py + y) * px + x) * layers + l) * height + h) * width + w
    return index < this.m_spritesIndex.length ? index : -1
  }

  /**
   * OTC getTextureIndex(l, x, y, z) – index into texture frame grid
   */
  getTextureIndex(l, x, y, z) {
    return ((l * this.m_numPatternZ + z) * this.m_numPatternY + y) * this.m_numPatternX + x
  }

  /**
   * OTC getTexture(animationPhase) – returns the full texture for that phase.
   * We return a canvas for the single frame (layer, xPattern, yPattern, zPattern) so we can render the sprite in one draw.
   * See https://github.com/opentibiabr/otclient/blob/main/src/client/thingtype.cpp
   */
  getTexture(animationPhase, sprites, layer, xPattern, yPattern, zPattern) {
    if (this.m_null || !sprites?.getCanvas) return null
    const phases = Math.max(1, this.m_animationPhases)
    const a = animationPhase % phases
    const key = `${a}_${layer}_${xPattern}_${yPattern}_${zPattern}`
    if (this.m_textureCache.has(key)) return this.m_textureCache.get(key)
    const canvas = this.loadTexture(a, sprites, layer, xPattern, yPattern, zPattern)
    if (canvas) this.m_textureCache.set(key, canvas)
    return canvas ?? null
  }

  /**
   * OTC loadTexture(animationPhase) – builds the combined texture (all sprites for one frame).
   * We build one canvas bw*32 x bh*32 for the given (phase, layer, x, y, z).
   */
  loadTexture(animationPhase, sprites, layer, xPattern, yPattern, zPattern) {
    const bw = this.getWidth()
    const bh = this.getHeight()
    const cw = bw * 32
    const ch = bh * 32
    const canvas = document.createElement('canvas')
    canvas.width = cw
    canvas.height = ch
    const ctx = canvas.getContext('2d')
    ctx.clearRect(0, 0, cw, ch)
    const spriteIds = this.m_spritesIndex ?? []
    let drawn = 0
    for (let h = 0; h < bh; h++) {
      for (let w = 0; w < bw; w++) {
        const idx = this.getSpriteIndex(w, h, layer, xPattern, yPattern, zPattern, animationPhase)
        const sid = idx >= 0 ? (spriteIds[idx] ?? 0) : 0
        if (!sid) continue
        const src = sprites.getCanvas(sid)
        if (!src) continue
        const px = (bw - 1 - w) * 32
        const py = (bh - 1 - h) * 32
        ctx.drawImage(src, 0, 0, 32, 32, px, py, 32, 32)
        drawn++
      }
    }
    return drawn > 0 ? canvas : null
  }

  /**
   * OTC: ThingType::draw(dest, layer, xPattern, yPattern, zPattern, animationPhase, color, drawThings, lightView)
   * https://github.com/opentibiabr/otclient/blob/main/src/client/thingtype.cpp
   * addTexturedRect na ordem de chamada — sem pass/renderOrder; pipeline desenha na ordem enqueue.
   */
  draw(pipeline, dest, layer, xPattern, yPattern, zPattern, animationPhase, color, drawThings, lightView) {
    if (this.m_null || !this.m_animationPhases) return

    const things = pipeline.thingsRef?.current
    if (!things?.sprites) return

    const animationFrameId = animationPhase % this.m_animationPhases
    const texture = this.getTexture(animationFrameId, things.sprites, layer, xPattern, yPattern, zPattern)
    if (!texture) return

    const TILE_PIXELS = 32
    const { tileX, tileY, drawElevationPx, tileZ, pixelOffsetX = 0, pixelOffsetY = 0 } = dest
    const bw = this.getWidth()
    const bh = this.getHeight()
    let dx = -(this.getDisplacementX?.() ?? this.m_displacement?.x ?? 0) / TILE_PIXELS
    let dy = (this.getDisplacementY?.() ?? this.m_displacement?.y ?? 0) / TILE_PIXELS
    dx += (pixelOffsetX || 0) / TILE_PIXELS
    dy += (pixelOffsetY || 0) / TILE_PIXELS
    // OTC tile.cpp drawThing: newDest = dest - drawElevation * scaleFactor; thing->draw(newDest); updateElevation(thing, drawElevation).
    // Elevation = deslocamento em y (dy -). A elevation do thing atual NÃO entra na sua posição; só atualiza drawElevation para o próximo.
    const dyElev = drawElevationPx / TILE_PIXELS

    const tx0 = tileX - (bw - 1)
    const ty0 = tileY - (bh - 1)
    if (tx0 < 0 || tx0 >= pipeline.w || ty0 < 0 || ty0 >= pipeline.h) return

    const tex = pipeline.texForCanvas?.(texture)
    if (!tex) return

    if (drawThings !== false) {
      pipeline.addTexturedRect({
        tileX: tx0,
        tileY: ty0,
        texture: tex,
        width: bw,
        height: bh,
        z: tileZ ?? 0,
        dx,
        dy: dy + dyElev,
      })
    }

    if (lightView && this.hasLight?.()) {
      // stub: lightView.addLightSource(...)
    }
  }

  /**
   * OTC unserialize(uint16 clientId, ThingCategory category, FileStreamPtr fin)
   */
  unserialize(clientId, category, fin) {
    this.m_null = false
    this.m_id = clientId
    this.m_category = category
    const clientVersion = g_game.getClientVersion()
    let count = 0
    let attr = -1
    let done = false

    for (let i = 0; i < ThingAttr.Last; i++) {
      count++
      attr = fin.u8()
      if (attr === ThingAttr.Last) {
        done = true
        break
      }

      if (clientVersion >= 1000) {
        if (attr === 16) attr = ThingAttr.NoMoveAnimation
        else if (attr > 16) attr -= 1
      } else if (clientVersion >= 860) {
        // no change
      } else if (clientVersion >= 780) {
        if (attr === 8) {
          this.m_attribs.set(ThingAttr.Chargeable, true)
          continue
        } else if (attr > 8) attr -= 1
      } else if (clientVersion >= 755) {
        if (attr === 23) attr = ThingAttr.FloorChange
      } else if (clientVersion >= 740) {
        if (attr > 0 && attr <= 15) attr += 1
        else if (attr === 16) attr = ThingAttr.Light
        else if (attr === 17) attr = ThingAttr.FloorChange
        else if (attr === 18) attr = ThingAttr.FullGround
        else if (attr === 19) attr = ThingAttr.Elevation
        else if (attr === 20) attr = ThingAttr.Displacement
        else if (attr === 22) attr = ThingAttr.MinimapColor
        else if (attr === 23) attr = ThingAttr.Rotateable
        else if (attr === 24) attr = ThingAttr.LyingCorpse
        else if (attr === 25) attr = ThingAttr.Hangable
        else if (attr === 26) attr = ThingAttr.HookSouth
        else if (attr === 27) attr = ThingAttr.HookEast
        else if (attr === 28) attr = ThingAttr.AnimateAlways
        if (attr === ThingAttr.MultiUse) attr = ThingAttr.ForceUse
        else if (attr === ThingAttr.ForceUse) attr = ThingAttr.MultiUse
      }

      switch (attr) {
        case ThingAttr.Displacement:
          if (clientVersion >= 755) {
            this.m_displacement.x = fin.u16()
            this.m_displacement.y = fin.u16()
          } else {
            this.m_displacement.x = 8
            this.m_displacement.y = 8
          }
          this.m_attribs.set(attr, true)
          break
        case ThingAttr.Light:
          this.m_attribs.set(attr, { intensity: fin.u16(), color: fin.u16() })
          break
        case ThingAttr.Market:
          this.m_attribs.set(attr, {
            category: fin.u16(),
            tradeAs: fin.u16(),
            showAs: fin.u16(),
            name: fin.str(),
            restrictVocation: fin.u16(),
            requiredLevel: fin.u16(),
          })
          break
        case ThingAttr.Elevation:
          this.m_elevation = fin.u16()
          this.m_attribs.set(attr, this.m_elevation)
          break
        case ThingAttr.Usable:
        case ThingAttr.Ground:
        case ThingAttr.Writable:
        case ThingAttr.WritableOnce:
        case ThingAttr.MinimapColor:
        case ThingAttr.Cloth:
        case ThingAttr.LensHelp:
        case ThingAttr.DefaultAction:
          this.m_attribs.set(attr, fin.u16())
          break
        default:
          this.m_attribs.set(attr, true)
          break
      }
    }

    if (!done) throw new Error(`corrupt data (id: ${this.m_id}, category: ${category}, count: ${count}, lastAttr: ${attr})`)

    const hasFrameGroups = category === ThingCategory.Creature && isFeatureEnabled(FEATURES.GameIdleAnimations)
    const groupCount = hasFrameGroups ? fin.u8() : 1
    this.m_animationPhases = 0
    let totalSpritesCount = 0
    this.m_frameGroups = []

    for (let i = 0; i < groupCount; i++) {
      let frameGroupType = FrameGroupType.Default
      if (hasFrameGroups) frameGroupType = fin.u8()

      const width = fin.u8()
      const height = fin.u8()
      this.m_size = { width, height }
      let realSize = 0
      if (width > 1 || height > 1) {
        realSize = fin.u8()
        this.m_exactSize = Math.min(realSize, Math.max(width * 32, height * 32))
      } else {
        this.m_exactSize = 32
      }

      this.m_layers = fin.u8()
      this.m_numPatternX = fin.u8()
      this.m_numPatternY = fin.u8()
      this.m_numPatternZ = (clientVersion >= 755 ? fin.u8() : 1)
      const groupAnimationsPhases = fin.u8()
      this.m_animationPhases += groupAnimationsPhases

      if (groupAnimationsPhases > 1 && isFeatureEnabled(FEATURES.GameEnhancedAnimations)) {
        this.m_animator = { phases: groupAnimationsPhases }
        this._readAnimator(fin, groupAnimationsPhases)
      }

      const phasesForCount = Math.max(1, groupAnimationsPhases)
      const totalSprites = this.m_size.width * this.m_size.height * this.m_layers * this.m_numPatternX * this.m_numPatternY * this.m_numPatternZ * phasesForCount
      if (totalSpritesCount + totalSprites > 4096) throw new Error('a thing type has more than 4096 sprites')

      const useU32 = isFeatureEnabled(FEATURES.GameSpritesU32)
      for (let j = totalSpritesCount; j < totalSpritesCount + totalSprites; j++) {
        this.m_spritesIndex[j] = useU32 ? fin.u32() : fin.u16()
      }
      totalSpritesCount += totalSprites

      this.m_frameGroups.push({
        type: frameGroupType,
        width,
        height,
        layers: this.m_layers,
        patternX: this.m_numPatternX,
        patternY: this.m_numPatternY,
        patternZ: this.m_numPatternZ,
        phases: groupAnimationsPhases,
      })
    }
    this.m_textureData = Array.from({ length: Math.max(1, this.m_animationPhases) }, () => ({ source: null }))
  }

  _readAnimator(fin, phases) {
    for (let i = 0; i < phases; i++) {
      fin.u8()
      fin.u8()
    }
  }
}
