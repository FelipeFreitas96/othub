/**
 * Creature – 1:1 com OTClient src/client/creature.cpp
 * Thing que desenha a si mesmo via draw().
 * Walk state: m_walking, m_walkOffset (dentro da própria Creature, como no OTC).
 */

const TILE_PIXELS = 32
// OTC Otc::Direction
const DirNorth = 0
const DirEast = 1
const DirSouth = 2
const DirWest = 3
const DirNorthEast = 4
const DirNorthWest = 5
const DirSouthEast = 6
const DirSouthWest = 7

export class Creature {
  constructor(entry) {
    this.m_entry = entry || {}
    // OTC: walk state dentro da Creature (m_walking, m_walkOffset, etc.)
    this.m_walking = false
    this.m_walkOffsetX = 0
    this.m_walkOffsetY = 0
    this.m_fromPos = null
    this.m_toPos = null
    this.m_startTime = 0
    this.m_stepDuration = 300
    this.m_direction = DirSouth
    this.m_walkedPixels = 0
    this.m_walkAnimationPhase = 0
    this.m_footStep = 0
    this.m_lastFootTime = 0
  }

  /** Id da criatura (para lookup no map). */
  getId() {
    return this.m_entry?.creatureId ?? this.m_entry?.id ?? null
  }

  /**
   * OTC Creature::walk() – inicia walk de fromPos para toPos.
   */
  walk(fromPos, toPos) {
    if (!fromPos || !toPos || (fromPos.x === toPos.x && fromPos.y === toPos.y && fromPos.z === toPos.z)) return
    this.m_walking = true
    this.m_fromPos = { ...fromPos }
    this.m_toPos = { ...toPos }
    this.m_startTime = typeof performance !== 'undefined' ? performance.now() : Date.now()
    this.m_stepDuration = Creature.getStepDuration(this.m_entry, fromPos, toPos)
    this.m_direction = Creature.getDirectionFromPosition(fromPos, toPos)
    this.m_walkOffsetX = 0
    this.m_walkOffsetY = 0
    this.m_walkedPixels = 0
    this.m_walkAnimationPhase = 0
    this.m_footStep = 0
    this.m_lastFootTime = 0
  }

  /**
   * OTC Creature::stopWalk() – para o walk.
   */
  stopWalk() {
    this.m_walking = false
    this.m_walkOffsetX = 0
    this.m_walkOffsetY = 0
    this.m_walkedPixels = 0
    this.m_walkAnimationPhase = 0
    this.m_fromPos = null
    this.m_toPos = null
  }

  /**
   * OTC Creature::updateWalk() – atualiza offset e animação; retorna true se o walk terminou neste frame.
   */
  updateWalk(now, types) {
    if (!this.m_walking || !this.m_fromPos || !this.m_toPos) return false
    const tt = types?.getCreature?.(this.m_entry?.outfit?.lookType ?? this.m_entry?.lookType ?? 0)
    const phases = tt?.getAnimationPhases?.() ?? tt?.phases ?? 1
    const state = {
      startTime: this.m_startTime,
      stepDuration: this.m_stepDuration,
      direction: this.m_direction,
      walking: this.m_walking,
      walkedPixels: this.m_walkedPixels,
      walkAnimationPhase: this.m_walkAnimationPhase,
      walkOffsetX: this.m_walkOffsetX,
      walkOffsetY: this.m_walkOffsetY,
      footStep: this.m_footStep,
      lastFootTime: this.m_lastFootTime,
    }
    Creature.updateWalkState(state, now, phases)
    this.m_walkedPixels = state.walkedPixels
    this.m_walkAnimationPhase = state.walkAnimationPhase ?? 0
    this.m_walkOffsetX = state.walkOffsetX ?? 0
    this.m_walkOffsetY = state.walkOffsetY ?? 0
    this.m_walking = state.walking
    this.m_footStep = state.footStep ?? 0
    this.m_lastFootTime = state.lastFootTime ?? 0
    return !this.m_walking
  }

  /** Retorna offset em pixels para desenho (OTC: getWalkOffset). */
  getWalkOffset() {
    return { x: this.m_walkOffsetX, y: this.m_walkOffsetY }
  }

  /** OTC: equivalente ao creature type (outfit). Retorna o ThingType do lookType. */
  getThingType(pipeline) {
    const types = pipeline?.thingsRef?.current?.types
    const lookType = this.m_entry?.outfit?.lookType ?? this.m_entry?.lookType ?? 0
    return lookType && types ? types.getCreature(lookType) : null
  }

  getElevation() { return 0 }
  hasElevation() { return false }
  isFullGround() { return false }
  isItem() { return false }
  isCreature() { return true }
  /** OTC: m_walking – criatura está em passo de movimento. */
  isWalking() { return !!this.m_walking }
  getWidth(pipeline) { return this.getThingType(pipeline)?.getWidth?.() ?? 1 }
  getHeight(pipeline) { return this.getThingType(pipeline)?.getHeight?.() ?? 1 }

  /** OTC Position::translatedToDirection(direction) – nova posição um tile na direção. */
  static positionTranslatedToDirection(pos, direction) {
    const dx = [0, 1, 0, -1, 1, -1, 1, -1][direction] ?? 0
    const dy = [-1, 0, 1, 0, -1, -1, 1, 1][direction] ?? 0
    return { x: pos.x + dx, y: pos.y + dy, z: pos.z }
  }

  /**
   * OTC Position::getDirectionFromPosition() – direção de from para to.
   */
  static getDirectionFromPosition(fromPos, toPos) {
    const dx = toPos.x - fromPos.x
    const dy = toPos.y - fromPos.y
    if (dx === 0 && dy === -1) return DirNorth
    if (dx === 1 && dy === -1) return DirNorthEast
    if (dx === 1 && dy === 0) return DirEast
    if (dx === 1 && dy === 1) return DirSouthEast
    if (dx === 0 && dy === 1) return DirSouth
    if (dx === -1 && dy === 1) return DirSouthWest
    if (dx === -1 && dy === 0) return DirWest
    if (dx === -1 && dy === -1) return DirNorthWest
    return DirSouth
  }

  /**
   * OTC Creature::getStepDuration() – duração do passo em ms (groundSpeed 150, diagonal factor 3 para client > 810).
   */
  static getStepDuration(entry, fromPos, toPos) {
    const speed = entry?.speed ?? 110
    if (speed < 1) return 0
    const groundSpeed = 150
    let interval = (1000 * groundSpeed) / speed
    const dir = Creature.getDirectionFromPosition(fromPos, toPos)
    const diagonal = dir === DirNorthEast || dir === DirNorthWest || dir === DirSouthEast || dir === DirSouthWest
    if (diagonal) interval *= 3
    return Math.max(100, Math.floor(interval))
  }

  /**
   * OTC Creature::updateWalkOffset() – offset em pixels (walkedPixels, direction).
   */
  static getWalkOffset(walkedPixels, direction) {
    let x = 0
    let y = 0
    if (direction === DirNorth || direction === DirNorthEast || direction === DirNorthWest) y = TILE_PIXELS - walkedPixels
    else if (direction === DirSouth || direction === DirSouthEast || direction === DirSouthWest) y = walkedPixels - TILE_PIXELS
    if (direction === DirEast || direction === DirNorthEast || direction === DirSouthEast) x = walkedPixels - TILE_PIXELS
    else if (direction === DirWest || direction === DirNorthWest || direction === DirSouthWest) x = TILE_PIXELS - walkedPixels
    return { x, y }
  }

  /**
   * OTC Creature::updateWalkAnimation() – footAnimPhases = getAnimationPhases()-1, footDelay = stepDuration/3.
   */
  static updateWalkAnimation(state, animationPhases) {
    const footAnimPhases = Math.max(0, (animationPhases ?? 1) - 1)
    const footDelay = Math.floor((state.stepDuration || 300) / 3)
    const now = typeof performance !== 'undefined' ? performance.now() : Date.now()
    const elapsed = now - (state.startTime ?? 0)
    const walkedPixels = Math.min(TILE_PIXELS, Math.floor((elapsed * TILE_PIXELS) / (state.stepDuration || 1)))
    state.walkedPixels = walkedPixels

    if (footAnimPhases === 0) {
      state.walkAnimationPhase = 0
      return
    }
    if (walkedPixels >= TILE_PIXELS) {
      state.walkAnimationPhase = 0
      return
    }
    const lastFoot = state.lastFootTime ?? 0
    if (lastFoot === 0) state.lastFootTime = now
    if (now - (state.lastFootTime ?? 0) >= footDelay) {
      state.footStep = (state.footStep ?? 0) + 1
      state.walkAnimationPhase = 1 + ((state.footStep ?? 0) % footAnimPhases)
      state.lastFootTime = now
    } else if (state.walkAnimationPhase === 0) {
      state.walkAnimationPhase = 1 + ((state.footStep ?? 0) % footAnimPhases)
    }
  }

  /**
   * Atualiza um estado de walk (chamado por MapStore.updateWalk). OTC: updateWalk() → updateWalkAnimation, updateWalkOffset.
   */
  static updateWalkState(state, now, animationPhases) {
    const startTime = state.startTime ?? 0
    const stepDuration = state.stepDuration ?? 300
    const elapsed = now - startTime
    const walkedPixels = Math.min(TILE_PIXELS, Math.floor((elapsed * TILE_PIXELS) / stepDuration))
    state.walkedPixels = walkedPixels
    Creature.updateWalkAnimation(state, animationPhases)
    const off = Creature.getWalkOffset(walkedPixels, state.direction ?? DirSouth)
    state.walkOffsetX = off.x
    state.walkOffsetY = off.y
    if (elapsed >= stepDuration) {
      state.walking = false
      state.walkAnimationPhase = 0
      state.walkOffsetX = 0
      state.walkOffsetY = 0
    }
  }

  /**
   * OTC: Creature::internalDrawOutfit – animationPhase = animateWalk ? m_walkAnimationPhase : 0;
   * if (isAnimateAlways() && animateIdle) phase = (g_clock.millis() % (ticksPerFrame * phases)) / ticksPerFrame; ticksPerFrame = 1000/phases.
   * So: só anima andando (walkAnimationPhase) ou, parado, só anima se isAnimateAlways (idle com ciclo 1000ms).
   */
  calculateAnimationPhase(pipeline, animate) {
    const ct = this.getThingType(pipeline)
    const phases = ct?.getAnimationPhases?.() ?? ct?.phases ?? 1
    if (phases <= 1) return 0
    if (this.m_walking) {
      return Math.min(this.m_walkAnimationPhase, phases - 1)
    }
    if (this.m_entry?.walking) {
      return Math.min(this.m_entry.walkAnimationPhase ?? 0, phases - 1)
    }
    if (!animate) return 0
    if (!ct?.isAnimateAlways?.()) return 0
    const ms = typeof performance !== 'undefined' ? performance.now() : Date.now()
    const cycleMs = 1000
    const ticksPerPhase = cycleMs / phases
    return Math.floor((ms % cycleMs) / ticksPerPhase) % phases
  }

  /**
   * OTC: Creature::draw(dest, scaleFactor, animate, lightView) → getThingType()->draw(dest, 0, xPattern, yPattern, zPattern, animationPhase, color, drawThings, lightView).
   * pixelOffsetX/Y: offset de walk em pixels (OTC: dest + animationOffset).
   */
  draw(pipeline, tileX, tileY, drawElevationPx, zOff, tileZ, pixelOffsetX = 0, pixelOffsetY = 0) {
    const ct = this.getThingType(pipeline)
    if (!ct) return
    const things = pipeline.thingsRef?.current
    if (!things?.types) return
    const off = this.m_walking ? this.getWalkOffset() : { x: 0, y: 0 }
    const dest = { tileX, tileY, drawElevationPx, zOff, tileZ, pixelOffsetX: pixelOffsetX + off.x, pixelOffsetY: pixelOffsetY + off.y }
    const dir = this.m_walking ? this.m_direction : (this.m_entry?.direction ?? 0)
    const px = ct.patternX ?? ct.m_numPatternX ?? 1
    const xPattern = px >= 4 ? (dir & 3) : 0
    const yPattern = 0
    const zPattern = 0
    const animationPhase = this.calculateAnimationPhase(pipeline, true)
    ct.draw(pipeline, dest, 0, xPattern, yPattern, zPattern, animationPhase, null, true, null)
  }
}
