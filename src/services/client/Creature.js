/**
 * Creature – 1:1 port of OTClient src/client/creature.h + creature.cpp
 * Copyright (c) 2010-2026 OTClient <https://github.com/edubart/otclient>; ported to JS.
 * OTC: walk(), stopWalk(), terminateWalk(), nextWalkUpdate(), updateWalk(), updateWalkOffset(), updateWalkingTile(), updateWalkAnimation(), onAppear(), onWalking().
 * Types: OTC usa g_things (ThingTypeManager) global; aqui importamos g_things.
 */

import { Tile } from './Tile.js'
import { g_things } from '../things/thingTypeManager.js'

const TILE_PIXELS = 32

// OTC Otc::Direction
const DirInvalid = -1
const DirNorth = 0
const DirEast = 1
const DirSouth = 2
const DirWest = 3
const DirNorthEast = 4
const DirNorthWest = 5
const DirSouthEast = 6
const DirSouthWest = 7

export class Creature {
  /** OTC: Creature::speedA, speedB, speedC – setados em parseLogin quando GameNewSpeedLaw. */
  static speedA = 0
  static speedB = 0
  static speedC = 0

  constructor(entry) {
    const e = entry || {}
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
    this.m_walkTurnDirection = DirInvalid
    this.m_healthPercent = typeof e.health === 'number' ? e.health : 101
    /** OTC: Creature::m_allowAppearWalk – permite desenhar animação de walk ao aparecer (parseCreatureMove). */
    this.m_allowAppearWalk = false
    /** OTC: Creature::m_cameraFollowing – true se a câmera segue esta criatura (local player). */
    this.m_cameraFollowing = false
    /** OTC: m_lastStepDirection, m_walkingTile, m_removed, m_oldPosition (creature.h). */
    this.m_lastStepDirection = DirInvalid
    this.m_walkingTile = null
    this.m_removed = true
    this.m_oldPosition = null
    this.m_position = null
    /** OTC: m_walkUpdateEvent – evento agendado para nextWalkUpdate. */
    this.m_walkUpdateEvent = null
    /** OTC: m_disappearEvent – cancelado em onAppear (creature.cpp L601-604). */
    this.m_disappearEvent = null
  }

  /** OTC: Creature::setHealthPercent(uint8_t) – used by parseCreatureHealth. */
  setHealthPercent(healthPercent) {
    if (this.m_healthPercent === healthPercent) return
    this.m_healthPercent = healthPercent
  }

  getHealthPercent() {
    return this.m_healthPercent
  }

  /** Id da criatura (para lookup no map). */
  getId() {
    return this.m_entry?.creatureId ?? this.m_entry?.id ?? null
  }

  /** OTC: Creature::isCameraFollowing() – retorna m_cameraFollowing. */
  isCameraFollowing() {
    return !!this.m_cameraFollowing
  }

  /**
   * OTC Creature::walk(oldPos, newPos) – m_lastStepDirection, m_lastStepFrom/To, setDirection, m_walking=true, m_walkTimer.restart(), m_walkedPixels=0, m_walkTurnDirection=Invalid, nextWalkUpdate().
   */
  walk(fromPos, toPos) {
    if (!fromPos || !toPos || (fromPos.x === toPos.x && fromPos.y === toPos.y && fromPos.z === toPos.z)) return
    this.m_lastStepDirection = Creature.getDirectionFromPosition(fromPos, toPos)
    this.m_fromPos = { ...fromPos }
    this.m_toPos = { ...toPos }
    this.m_direction = this.m_lastStepDirection
    this.m_walking = true
    this.m_startTime = typeof performance !== 'undefined' ? performance.now() : Date.now()
    this.m_stepDuration = Creature.getStepDuration(this.m_entry, fromPos, toPos)
    this.m_walkOffsetX = 0
    this.m_walkOffsetY = 0
    this.m_walkedPixels = 0
    this.m_walkAnimationPhase = 0
    this.m_footStep = 0
    this.m_lastFootTime = 0
    this.m_walkTurnDirection = DirInvalid
    this.nextWalkUpdate(typeof performance !== 'undefined' ? performance.now() : Date.now())
  }

  /** OTC: Creature::allowAppearWalk() – seta m_allowAppearWalk=true para desenhar animação de walk ao aparecer (parseCreatureMove). */
  allowAppearWalk() {
    this.m_allowAppearWalk = true
  }

  /** OTC: Creature::isAllowAppearWalk() – retorna m_allowAppearWalk. */
  isAllowAppearWalk() {
    return !!this.m_allowAppearWalk
  }

  /** OTC: turn(Otc::Direction) – if m_walking set m_walkTurnDirection; else setDirection(direction). */
  turn(direction) {
    if (this.m_walking) {
      this.m_walkTurnDirection = direction
      return
    }
    this.m_direction = direction
  }

  /**
   * OTC Creature::stopWalk() – if (!m_walking) return; terminateWalk().
   */
  stopWalk() {
    if (!this.m_walking) return
    this.terminateWalk()
  }

  /**
   * OTC Creature::nextWalkUpdate() – remove m_walkUpdateEvent; updateWalk(); onWalking(); if (!m_walking) return; schedule next.
   */
  nextWalkUpdate(now) {
    if (this.m_walkUpdateEvent != null) {
      clearTimeout(this.m_walkUpdateEvent)
      if (typeof cancelAnimationFrame === 'function' && typeof this.m_walkUpdateEvent === 'number') cancelAnimationFrame(this.m_walkUpdateEvent)
      this.m_walkUpdateEvent = null
    }
    this.updateWalk(now)
    this.onWalking()
    if (!this.m_walking) return
    const stepDuration = this.m_stepDuration || 300
    const walkDuration = Math.min(Math.max(16, Math.floor(stepDuration / TILE_PIXELS)), 1000)
    const self = this
    const run = () => {
      self.m_walkUpdateEvent = null
      self.nextWalkUpdate(typeof performance !== 'undefined' ? performance.now() : Date.now())
    }
    this.m_walkUpdateEvent = this.isCameraFollowing()
      ? (typeof requestAnimationFrame !== 'undefined' ? requestAnimationFrame(run) : setTimeout(run, 16))
      : setTimeout(run, walkDuration)
  }

  /** OTC: virtual void onWalking() {} */
  onWalking() {}

  /**
   * OTC Creature::updateWalkOffset(uint8_t totalPixelsWalked) – m_walkOffset por direção.
   */
  updateWalkOffset(totalPixelsWalked) {
    const off = Creature.getWalkOffset(totalPixelsWalked, this.m_direction)
    this.m_walkOffsetX = off.x
    this.m_walkOffsetY = off.y
  }

  /**
   * OTC Creature::updateWalkingTile() – determina newWalkingTile por rect; remove de m_walkingTile, add em newWalkingTile; notificateTileUpdate se cameraFollowing.
   */
  updateWalkingTile() {
    if (!this.m_fromPos || !this.m_toPos) return
    const progress = Math.min(1, this.m_walkedPixels / TILE_PIXELS)
    const x = Math.floor(this.m_fromPos.x + (this.m_toPos.x - this.m_fromPos.x) * progress)
    const y = Math.floor(this.m_fromPos.y + (this.m_toPos.y - this.m_fromPos.y) * progress)
    const z = this.m_fromPos.z
    const newWalkingTile = g_map.getOrCreateTile?.({ x, y, z })
    if (newWalkingTile === this.m_walkingTile) return
    if (this.m_walkingTile) {
      Tile.removeWalkingCreature(this.m_walkingTile, this)
    }
    if (newWalkingTile) {
      Tile.addWalkingCreature(newWalkingTile, this)
      if (this.isCameraFollowing() && g_map.notificateTileUpdate) {
        g_map.notificateTileUpdate(newWalkingTile.pos ?? { x, y, z }, this, 'clean')
      }
    }
    this.m_walkingTile = newWalkingTile
  }

  /**
   * OTC Creature::updateWalkAnimation() – foot animation phase (creature.cpp L416-442). OTC usa g_things para thing type.
   */
  updateWalkAnimation() {
    const tt = g_things.getCreature?.(this.m_entry?.outfit?.lookType ?? this.m_entry?.lookType ?? 0)
    const footAnimPhases = tt?.getAnimationPhases?.() ?? tt?.phases ?? 1
    if (footAnimPhases <= 0) return
    if (this.m_walkedPixels >= TILE_PIXELS) {
      this.m_walkAnimationPhase = 0
      return
    }
    const footDelay = Math.max(20, Math.min(205, Math.floor((this.m_stepDuration ?? 300) / (footAnimPhases || 1))))
    const now = typeof performance !== 'undefined' ? performance.now() : Date.now()
    if ((now - (this.m_lastFootTime ?? 0)) >= footDelay) {
      this.m_walkAnimationPhase = this.m_walkAnimationPhase >= footAnimPhases ? 1 : (this.m_walkAnimationPhase + 1)
      this.m_lastFootTime = now
    }
  }

  /**
   * OTC Creature::updateWalk() – creature.cpp L787-801: oldWalkOffset; updateWalkAnimation; updateWalkOffset; updateWalkingTile; isCameraFollowing && oldWalkOffset!=m_walkOffset → notificateCameraMove(m_walkOffset); m_walkedPixels==spriteSize → terminateWalk().
   */
  updateWalk(now) {
    if (!this.m_walking || !this.m_fromPos || !this.m_toPos) return false
    const stepDuration = this.m_stepDuration || 300
    const walkTicksPerPixel = stepDuration / TILE_PIXELS
    const elapsed = now - this.m_startTime
    const totalPixelsWalked = Math.min(TILE_PIXELS, Math.floor(elapsed / walkTicksPerPixel))
    this.m_walkedPixels = Math.max(this.m_walkedPixels, totalPixelsWalked)
    const oldWalkOffset = { x: this.m_walkOffsetX, y: this.m_walkOffsetY }
    this.updateWalkAnimation()
    this.updateWalkOffset(this.m_walkedPixels)
    this.updateWalkingTile()
    if (this.isCameraFollowing() && g_map?.notificateCameraMove && (oldWalkOffset.x !== this.m_walkOffsetX || oldWalkOffset.y !== this.m_walkOffsetY)) {
      g_map.notificateCameraMove(this.getWalkOffset())
    }
    if (this.m_walkedPixels >= TILE_PIXELS) {
      this.terminateWalk()
      return true
    }
    return false
  }

  /**
   * OTC Creature::terminateWalk() – cancel m_walkUpdateEvent; m_walkTurnDirection→setDirection; remove from m_walkingTile; m_walkedPixels=0, m_walkOffset={}, m_walking=false; schedule m_walkAnimationPhase=0.
   */
  terminateWalk() {
    if (this.m_walkUpdateEvent != null) {
      clearTimeout(this.m_walkUpdateEvent)
      if (typeof cancelAnimationFrame === 'function' && typeof this.m_walkUpdateEvent === 'number') cancelAnimationFrame(this.m_walkUpdateEvent)
      this.m_walkUpdateEvent = null
    }
    if (this.m_walkTurnDirection != null && this.m_walkTurnDirection !== DirInvalid) {
      this.m_direction = this.m_walkTurnDirection
      this.m_walkTurnDirection = DirInvalid
    }
    if (this.m_walkingTile) {
      Tile.removeWalkingCreature(this.m_walkingTile, this)
      this.m_walkingTile = null
    }
    this.m_walkedPixels = 0
    this.m_walkOffsetX = 0
    this.m_walkOffsetY = 0
    this.m_walking = false
    this.m_walkAnimationPhase = 0
    this.m_fromPos = null
    this.m_toPos = null
    this.m_allowAppearWalk = false
    g_map?.notificateWalkTerminated?.(this)
  }

  /**
   * OTC Creature::onAppear() – creature.cpp L598-625: cancel m_disappearEvent; isCameraFollowing && m_position!=m_oldPosition → notificateCameraMove(m_walkOffset); m_removed → stopWalk, m_removed=false, callLuaField; walk inRange → allowAppearWalk=false, walk(), callLuaField; teleport → stopWalk, callLuaField onDisappear/onAppear.
   */
  onAppear(position = null, oldPosition = null) {
    if (position) this.m_position = position
    if (oldPosition) this.m_oldPosition = oldPosition
    if (this.m_disappearEvent) {
      this.m_disappearEvent.cancel?.()
      this.m_disappearEvent = null
    }
    const op = this.m_oldPosition || oldPosition
    const pos = this.m_position || position
    const positionChanged = op && pos && (op.x !== pos.x || op.y !== pos.y || op.z !== pos.z)
    if (this.isCameraFollowing() && positionChanged && g_map?.notificateCameraMove) {
      g_map.notificateCameraMove(this.getWalkOffset())
    }
    if (this.m_removed) {
      this.stopWalk()
      this.m_removed = false
      return
    }
    if (positionChanged) {
      const dx = Math.abs(pos.x - op.x)
      const dy = Math.abs(pos.y - op.y)
      if (dx <= 1 && dy <= 1 && this.m_allowAppearWalk) {
        this.m_allowAppearWalk = false
        this.walk(op, pos, )
        return
      }
      this.stopWalk()
    }
  }

  /** OTC: getWalkOffset() */
  getWalkOffset() {
    return { x: this.m_walkOffsetX, y: this.m_walkOffsetY }
  }

  /** OTC: getLastStepFromPosition() / getLastStepToPosition() */
  getLastStepFromPosition() {
    return this.m_fromPos ? { ...this.m_fromPos } : null
  }

  getLastStepToPosition() {
    return this.m_toPos ? { ...this.m_toPos } : null
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
  isSingleGround() { return false }
  isSingleGroundBorder() { return false }
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
