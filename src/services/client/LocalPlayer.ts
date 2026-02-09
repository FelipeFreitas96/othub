/**
 * LocalPlayer – 1:1 port of OTClient src/client/localplayer.h + localplayer.cpp
 * Copyright (c) 2010-2026 OTClient <https://github.com/edubart/otclient>; ported to JS.
 * OTC: class LocalPlayer final : public Player
 * preWalk: m_preWalks.emplace_back(...); Creature::walk(oldPos, back); onPositionChange(...); registerAdjustInvalidPosEvent().
 * walk: if (isPreWalking() && newPos == m_preWalks.front()) pop_front return; cancelAdjustInvalidPosEvent(); m_preWalks.clear(); m_serverWalk = true; Creature::walk(oldPos, newPos).
 * terminateWalk: Creature::terminateWalk(); m_serverWalk = false.
 */
import { Creature } from './Creature'
import { Player } from './Player'
import { g_map } from './ClientMap'
import { Position, PositionLike } from './Position'
import { Item } from './Item'
import { g_game } from './Game'

const DirInvalid = -1

function clockMillis() {
  return typeof performance !== 'undefined' ? performance.now() : Date.now()
}

function positionIsValid(pos: any): pos is Position {
  return pos != null && Number.isFinite(pos.x) && Number.isFinite(pos.y) && Number.isFinite(pos.z)
}

function positionEquals(a: Position | null, b: Position | null) {
  return a && b && a.x === b.x && a.y === b.y && a.z === b.z
}

export class LocalPlayer extends Player {
  // OTC: walk related (localplayer.h)
  m_preWalks: Position[]
  m_lastAutoWalkPosition: Position | null
  m_autoWalkDestination: Position | null
  m_adjustInvalidPosEvent: ReturnType<typeof setTimeout> | null
  m_autoWalkContinueEvent: ReturnType<typeof setTimeout> | null
  m_walkLockExpiration: number
  m_knownCompletePath: boolean
  m_autoWalkRetries: number
  m_serverWalk: boolean

  m_states: number
  m_blessings: number
  m_skillsLevel: Record<number, number>
  m_skillsBaseLevel: Record<number, number>
  m_skillsLevelPercent: Record<number, number>
  m_spells: number[]
  m_health: number
  m_maxHealth: number
  m_freeCapacity: number
  m_experience: number
  m_level: number
  m_levelPercent: number
  m_mana: number
  m_maxMana: number
  m_magicLevel: number
  m_magicLevelPercent: number
  m_baseMagicLevel: number
  m_soul: number
  m_stamina: number
  m_regenerationTime: number
  m_offlineTrainingTime: number
  m_totalCapacity: number
  m_premium: boolean
  m_known: boolean
  m_pending: boolean
  m_inventoryItems: Record<number, Item | null>
  m_idleTimer: number
  /** OTC: LocalPlayer::m_attackTarget – clear target opcode 163. */
  m_attackTarget: Creature | null

  constructor() {
    super({ id: 0 })
    this.m_preWalks = []
    this.m_lastAutoWalkPosition = null
    this.m_autoWalkDestination = null
    this.m_adjustInvalidPosEvent = null
    this.m_autoWalkContinueEvent = null
    this.m_walkLockExpiration = 0
    this.m_knownCompletePath = false
    this.m_autoWalkRetries = 0
    this.m_serverWalk = false

    this.m_states = 0
    this.m_blessings = 0
    this.m_skillsLevel = {}
    this.m_skillsBaseLevel = {}
    this.m_skillsLevelPercent = {}
    this.m_spells = []

    this.m_health = -1
    this.m_maxHealth = -1
    this.m_freeCapacity = -1
    this.m_experience = -1
    this.m_level = -1
    this.m_levelPercent = -1
    this.m_mana = -1
    this.m_maxMana = -1
    this.m_magicLevel = -1
    this.m_magicLevelPercent = -1
    this.m_baseMagicLevel = -1
    this.m_soul = -1
    this.m_stamina = -1
    this.m_regenerationTime = -1
    this.m_offlineTrainingTime = -1
    this.m_totalCapacity = -1
    this.m_premium = false
    this.m_known = false
    this.m_pending = false
    this.m_inventoryItems = {}
    this.m_idleTimer = 0
    this.m_attackTarget = null
  }

  /** OTC: LocalPlayer::setAttackTarget(creature) – clear target opcode 163. */
  setAttackTarget(target: Creature | null) {
    this.m_attackTarget = target
  }
  getAttackTarget(): Creature | null {
    return this.m_attackTarget
  }

  override getId(): number | string { return this.m_id }
  override setId(id: number | string | null) {
    this.m_id = id as number | string
  }

  override isLocalPlayer(): boolean { return true }

  unlockWalk() { this.m_walkLockExpiration = 0 }

  lockWalk(millis = 250) {
    this.m_walkLockExpiration = Math.max(this.m_walkLockExpiration, clockMillis() + millis)
  }

  /** OTC: Position getPosition() override – isPreWalking() ? m_preWalks.back() : m_position */
  override getPosition(): Position {
    if (this.isPreWalking() && this.m_preWalks.length) {
      const last = this.m_preWalks[this.m_preWalks.length - 1]
      return last instanceof Position ? last : Position.from(last)
    }
    if (this.m_position) return this.m_position
    if (g_map?.center) return g_map.center instanceof Position ? g_map.center : Position.from(g_map.center)
    return new Position(0, 0, 0)
  }

  isWalkLocked() {
    return this.m_walkLockExpiration !== 0 && clockMillis() < this.m_walkLockExpiration
  }

  /** OTC: LocalPlayer::canWalk(bool ignoreLock) */
  canWalk(ignoreLock = false) {
    if (this.isDead()) return false
    if (this.isWalkLocked() && !ignoreLock) return false
    const walkMaxSteps = Math.max(0, g_game.getWalkMaxSteps?.() ?? 0)
    if (walkMaxSteps > 0) {
      if (this.m_preWalks.length > walkMaxSteps) return false
    } else if (this.getPosition().x !== this.getServerPosition().x ||
        this.getPosition().y !== this.getServerPosition().y ||
        this.getPosition().z !== this.getServerPosition().z) {
      return false
    }
    if (this.m_walking) {
      if (this.isAutoWalking()) return true
      if (this.isPreWalking()) return false
    }
    return this.m_walkTimer.ticksElapsed() >= this.getStepDuration()
  }

  getWalkMaxSteps() { return Math.max(0, g_game.getWalkMaxSteps?.() ?? 0) }

  getServerPosition() {
    return this.m_position ? this.m_position.clone() : new Position(0, 0, 0)
  }

  /** OTC: void LocalPlayer::preWalk(Otc::Direction direction) */
  preWalk(direction: number) {
    const oldPos = this.getPosition()
    const newPos = Creature.positionTranslatedToDirection(oldPos, direction)
    if (!positionIsValid(newPos)) return

    this.m_preWalks.push(newPos)
    super.walk(oldPos, newPos)

    const toP = this.getLastStepToPosition()
    const fromP = this.getLastStepFromPosition()
    if (toP && fromP) this.onPositionChange(Position.from(toP), Position.from(fromP))
    this.registerAdjustInvalidPosEvent()
  }

  /** OTC: void LocalPlayer::walk(const Position& oldPos, const Position& newPos) override */
  override walk(oldPos: Position, newPos: Position) {
    this.m_autoWalkRetries = 0

    if (this.isPreWalking() && this.m_preWalks.length && positionEquals(newPos, this.m_preWalks[0])) {
      this.m_preWalks.shift()
      return
    }

    this.cancelAdjustInvalidPosEvent()
    this.m_preWalks = []
    this.m_serverWalk = true

    super.walk(oldPos, newPos)
  }

  /** OTC: void LocalPlayer::onWalking() override */
  override onWalking() {
    // OTC: cancel pre-walk if local player tries to walk on unwalkable tile (optional)
  }

  /** OTC: void LocalPlayer::terminateWalk() override */
  override terminateWalk() {
    super.terminateWalk()
    this.m_serverWalk = false
    this.m_idleTimer = clockMillis()
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('onWalkFinish'))
      window.dispatchEvent(new CustomEvent('ot:walkFinish'))
    }
  }

  onPositionChange(newPos: Position, oldPos: Position) {
    if (this.isPreWalking()) return
    if (positionEquals(newPos, this.m_autoWalkDestination)) this.stopAutoWalk()
    else if (positionIsValid(this.m_autoWalkDestination) && positionEquals(newPos, this.m_lastAutoWalkPosition)) {
      this.autoWalk(this.m_autoWalkDestination)
    }
    this.m_serverWalk = false
  }

  registerAdjustInvalidPosEvent() {
    this.cancelAdjustInvalidPosEvent()
    const stepDuration = this.getStepDuration()
    const ping = g_game.getPing?.() ?? -1
    const delay = Math.min(Math.max(stepDuration, ping) + 100, 1000)
    this.m_adjustInvalidPosEvent = setTimeout(() => {
      this.m_preWalks = []
      this.m_adjustInvalidPosEvent = null
    }, delay)
  }

  cancelAdjustInvalidPosEvent() {
    if (!this.m_adjustInvalidPosEvent) return
    clearTimeout(this.m_adjustInvalidPosEvent)
    this.m_adjustInvalidPosEvent = null
  }

  retryAutoWalk() {
    if (!positionIsValid(this.m_autoWalkDestination)) return false
    if (this.m_autoWalkRetries <= 3) {
      if (this.m_autoWalkContinueEvent) clearTimeout(this.m_autoWalkContinueEvent)
      const dest = { ...this.m_autoWalkDestination }
      this.m_autoWalkContinueEvent = setTimeout(() => {
        this.m_autoWalkContinueEvent = null
        this.autoWalk(dest)
      }, 200)
      this.m_autoWalkRetries += 1
      return true
    }
    this.m_autoWalkDestination = null
    return false
  }

  /** OTC: void LocalPlayer::cancelWalk(Otc::Direction direction) */
  cancelWalk(direction = DirInvalid) {
    // OTC: only cancel client-side prewalk movement; do not teleport/remove-add creature here.
    if (this.m_walking && this.isPreWalking()) this.stopWalk()

    g_map.notificateCameraMove(this.m_walkOffset)

    if (this.m_adjustInvalidPosEvent) {
      this.cancelAdjustInvalidPosEvent()
      this.m_preWalks = []
    }

    this.m_idleTimer = clockMillis()
    this.lockWalk()
    if (this.retryAutoWalk()) return
    if (direction !== DirInvalid) this.setDirection(direction)
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('onCancelWalk', { detail: direction }))
      window.dispatchEvent(new CustomEvent('ot:cancelWalk', { detail: direction }))
    }
  }

  stopAutoWalk() {
    this.m_autoWalkDestination = null
    this.m_lastAutoWalkPosition = null
    this.m_knownCompletePath = false
    if (this.m_autoWalkContinueEvent) {
      clearTimeout(this.m_autoWalkContinueEvent)
      this.m_autoWalkContinueEvent = null
    }
  }

  autoWalk(destination: PositionLike) {
    this.m_autoWalkDestination = null
    this.m_lastAutoWalkPosition = null
    if (this.m_autoWalkContinueEvent) {
      clearTimeout(this.m_autoWalkContinueEvent)
      this.m_autoWalkContinueEvent = null
    }
    if (!g_map || !positionIsValid(destination)) return false
    if (positionEquals(destination, g_map.center)) return true
    this.m_autoWalkDestination = destination instanceof Position ? destination.clone() : Position.from(destination)
    this.lockWalk()
    return true
  }

  isCreatureWalking() {
    if (this.m_walking) return true
    if (this.m_walkOffset.x !== 0 || this.m_walkOffset.y !== 0) return true
    if (this.m_walkedPixels > 0) return true
    if (this.m_preWalks.length > 0) return true
    if (this.m_serverWalk) return true
    if (this.m_walkTimer.ticksElapsed() < this.getStepDuration(true)) return true
    return false
  }

  getWalkProgress() {
    const elapsed = this.m_walkTimer.ticksElapsed()
    const stepDuration = this.getStepDuration(true)
    if (stepDuration <= 0) return 0
    return Math.min(100, Math.floor((elapsed / stepDuration) * 100))
  }

  isDead() { return this.m_health != null && this.m_health <= 0 }

  onPositionChangeServer(newPos: Position, oldPos: Position) {
    if (this.isPreWalking()) return
    this.m_serverWalk = false
    if (positionEquals(newPos, this.m_autoWalkDestination)) this.stopAutoWalk()
    else if (positionIsValid(this.m_autoWalkDestination) && positionEquals(newPos, this.m_lastAutoWalkPosition)) {
      this.autoWalk(this.m_autoWalkDestination)
    }
  }

  setStates(states: number) { this.m_states = states }

  setSkill(skill: number, level: number, levelPercent: number) {
    this.m_skillsLevel[skill] = level
    this.m_skillsLevelPercent[skill] = levelPercent
  }

  setBaseSkill(skill: number, baseLevel: number) {
    this.m_skillsBaseLevel[skill] = baseLevel
  }

  setHealth(health: number, maxHealth: number) {
    this.m_health = health
    this.m_maxHealth = maxHealth
    if (this.isDead()) {
      if (this.isPreWalking()) this.stopWalk()
      this.lockWalk()
    }
  }

  setFreeCapacity(freeCapacity: number) { this.m_freeCapacity = freeCapacity }
  setTotalCapacity(totalCapacity: number) { this.m_totalCapacity = totalCapacity }
  setExperience(experience: number) { this.m_experience = experience }
  setLevel(level: number, levelPercent: number) {
    this.m_level = level
    this.m_levelPercent = levelPercent
  }
  setMana(mana: number, maxMana: number) {
    this.m_mana = mana
    this.m_maxMana = maxMana
  }
  setMagicLevel(magicLevel: number, magicLevelPercent: number) {
    this.m_magicLevel = magicLevel
    this.m_magicLevelPercent = magicLevelPercent
  }
  setBaseMagicLevel(baseMagicLevel: number) { this.m_baseMagicLevel = baseMagicLevel }
  setSoul(soul: number) { this.m_soul = soul }
  setStamina(stamina: number) { this.m_stamina = stamina }
  setRegenerationTime(regenerationTime: number) { this.m_regenerationTime = regenerationTime }
  setOfflineTrainingTime(offlineTrainingTime: number) { this.m_offlineTrainingTime = offlineTrainingTime }
  setSpells(spells: number[]) { this.m_spells = spells || [] }
  setBlessings(blessings: number) { this.m_blessings = blessings }
  setKnown(known: boolean) { this.m_known = known }
  setPendingGame(pending: boolean) { this.m_pending = pending }
  setInventoryItem(slot: number, item: Item | null) { this.m_inventoryItems[slot] = item }
  setPremium(premium: boolean) { this.m_premium = premium }

  getStates() { return this.m_states }
  getSkillLevel(skill: number) { return this.m_skillsLevel[skill] ?? -1 }
  getSkillBaseLevel(skill: number) { return this.m_skillsBaseLevel[skill] ?? -1 }
  getSkillLevelPercent(skill: number) { return this.m_skillsLevelPercent[skill] ?? -1 }
  getHealth() { return this.m_health }
  getMaxHealth() { return this.m_maxHealth }
  getFreeCapacity() { return this.m_freeCapacity }
  getTotalCapacity() { return this.m_totalCapacity }
  getExperience() { return this.m_experience }
  getLevel() { return this.m_level }
  getLevelPercent() { return this.m_levelPercent }
  getMana() { return this.m_mana }
  getMaxMana() { return this.m_maxMana }
  getMagicLevel() { return this.m_magicLevel }
  getMagicLevelPercent() { return this.m_magicLevelPercent }
  getBaseMagicLevel() { return this.m_baseMagicLevel }
  getSoul() { return this.m_soul }
  getStamina() { return this.m_stamina }
  getRegenerationTime() { return this.m_regenerationTime }
  getOfflineTrainingTime() { return this.m_offlineTrainingTime }
  getSpells() { return this.m_spells }
  getInventoryItem(slot: number) { return this.m_inventoryItems[slot] ?? null }
  getBlessings() { return this.m_blessings }
  hasSight(pos: Position) {
    if (!g_map?.center) return false
    const c = g_map.center
    const left = g_map.m_awareRange?.left ?? 8
    const top = g_map.m_awareRange?.top ?? 6
    return Math.abs(pos.x - c.x) <= left - 1 && Math.abs(pos.y - c.y) <= top - 1
  }
  isKnown() { return this.m_known }
  isPreWalking() { return this.m_preWalks.length > 0 }
  getPreWalkingSize() { return this.m_preWalks.length }
  resetPreWalk() { this.m_preWalks = [] }
  isAutoWalking() { return positionIsValid(this.m_autoWalkDestination) }
  isServerWalking() { return this.m_serverWalk }
  isPremium() { return this.m_premium }
  isPendingGame() { return this.m_pending }

  /**
   * Session reset (OTC-style behavior where a new LocalPlayer is created on login).
   * We keep the singleton reference and copy fields from a fresh instance.
   */
  resetForLogin(characterName = ''): void {
    const fresh = new LocalPlayer()
    Object.assign(this, fresh)
    if (characterName) this.setName(characterName)
  }
}

export const g_player = new LocalPlayer()
export { DirInvalid }
