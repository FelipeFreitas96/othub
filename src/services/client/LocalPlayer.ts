/**
 * LocalPlayer – 1:1 port of OTClient src/client/localplayer.h + localplayer.cpp
 * Copyright (c) 2010-2026 OTClient <https://github.com/edubart/otclient>; ported to JS.
 *
 * OTC: walk related: m_preWalks (deque), m_serverWalk, m_autoWalkDestination, m_walkLockExpiration.
 * preWalk: m_preWalks.emplace_back(oldPos.translatedToDirection(direction)); Creature::walk(oldPos, back); registerAdjustInvalidPosEvent().
 * walk: if (isPreWalking() && newPos == m_preWalks.front()) { m_preWalks.pop_front(); return; } cancelAdjustInvalidPosEvent(); m_preWalks.clear(); m_serverWalk = true; Creature::walk(oldPos, newPos).
 * cancelWalk: if (isWalking() && isPreWalking()) stopWalk(); lockWalk(); retryAutoWalk(); setDirection(direction).
 * terminateWalk: Creature::terminateWalk(); m_serverWalk = false.
 */
import { Creature } from '../client/Creature'
import { g_map } from '../client/ClientMap'
import { Position, PositionLike, ensurePosition } from './types'
import { Item } from './Item'

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

export class LocalPlayer {
  _id: number | string | null
  _creature: Creature | null
  m_states: number
  m_vocation: number
  m_blessings: number
  m_walkLockExpiration: number
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
  m_preWalks: Position[]
  m_lastAutoWalkPosition: Position | null
  m_autoWalkDestination: Position | null
  m_adjustInvalidPosEvent: ReturnType<typeof setTimeout> | null
  m_autoWalkContinueEvent: ReturnType<typeof setTimeout> | null
  m_serverWalkEndEvent: any
  m_knownCompletePath: boolean
  m_autoWalkRetries: number
  m_premium: boolean
  m_known: boolean
  m_pending: boolean
  m_serverWalk: boolean
  m_inventoryItems: Record<number, Item | null>
  m_idleTimer: number
  m_walkTimerStart: number

  constructor() {
    this._id = null
    this._creature = null
    this.m_states = 0
    this.m_vocation = 0
    this.m_blessings = 0
    this.m_walkLockExpiration = 0

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

    // OTC: std::deque<Position> m_preWalks; Position m_lastAutoWalkPosition; Position m_autoWalkDestination
    this.m_preWalks = []
    this.m_lastAutoWalkPosition = null
    this.m_autoWalkDestination = null
    this.m_adjustInvalidPosEvent = null
    this.m_autoWalkContinueEvent = null
    this.m_serverWalkEndEvent = null
    this.m_knownCompletePath = false
    this.m_autoWalkRetries = 0
    this.m_premium = false
    this.m_known = false
    this.m_pending = false
    this.m_serverWalk = false
    this.m_inventoryItems = {}
    this.m_idleTimer = 0
    // OTC: LocalPlayer extends Creature → m_walkTimer; we use m_walkTimerStart (ms) and restart on each step
    this.m_walkTimerStart = 0
  }

  getId() {
    return this._id
  }

  setId(id: number | string | null) {
    this._id = id
  }

  getCreature() {
    return this._creature ?? null
  }

  setCreature(creature: Creature | null) {
    this._creature = creature
  }

  isLocalPlayer(creatureId: number | string | null) {
    const id = this.getId()
    return id != null && Number(creatureId) === Number(id)
  }

  unlockWalk() {
    this.m_walkLockExpiration = 0
  }

  lockWalk(millis = 250) {
    this.m_walkLockExpiration = Math.max(this.m_walkLockExpiration, clockMillis() + millis)
  }

  /** OTC: getPosition() override – isPreWalking() ? m_preWalks.back() : m_position (center). */
  getPosition(): Position {
    if (this.isPreWalking() && this.m_preWalks.length) {
      const last = this.m_preWalks[this.m_preWalks.length - 1]
      return last instanceof Position ? last : Position.from(last)
    }
    if (g_map?.center) {
      return g_map.center instanceof Position ? g_map.center : Position.from(g_map.center)
    }
    return new Position(0, 0, 0)
  }

  /** OTC: isWalkLocked() */
  isWalkLocked() {
    return this.m_walkLockExpiration !== 0 && clockMillis() < this.m_walkLockExpiration
  }

  /** OTC: LocalPlayer::canWalk(bool ignoreLock) – localplayer.cpp 1:1. */
  canWalk(ignoreLock = false) {
    if (this.isDead()) return false
    if (this.isWalkLocked() && !ignoreLock) return false

    // OTC: Ensure movement synchronization with the server
    if (this.getPosition().x !== this.getServerPosition().x || 
        this.getPosition().y !== this.getServerPosition().y || 
        this.getPosition().z !== this.getServerPosition().z) {
      return false
    }

    const id = this.getId()
    const creature = g_map?.getCreatureById?.(id)
    
    if (creature && creature.m_walking) {
      if (this.isAutoWalking()) return true
      if (this.isPreWalking()) return false
    }

    // OTC: return m_walkTimer.ticksElapsed() >= getStepDuration();
    const elapsed = creature ? creature.getWalkTicksElapsed() : 999999
    return elapsed >= this.getStepDuration()
  }

  /** OTC: g_game.getWalkMaxSteps() – 0 = sync by position only. */
  getWalkMaxSteps() {
    return 0
  }

  getServerPosition() {
    return g_map?.center ? { ...g_map.center } : { x: 0, y: 0, z: 0 }
  }

  /** OTC: Creature::getStepDuration() – used for canWalk step-done check. */
  getStepDuration() {
    const id = this.getId()
    const creature = g_map?.getCreatureById?.(id)
    
    if (creature) {
      return creature.getStepDuration()
    }
    
    return 150
  }

  /** OTC: preWalk(Otc::Direction direction) – m_preWalks.emplace_back(oldPos.translatedToDirection(direction)); Creature::walk(oldPos, back); registerAdjustInvalidPosEvent(). */
  preWalk(direction: number) {
    const id = this.getId()
    if (id == null) return
    const oldPos = this.getPosition()
    const newPos = Creature.positionTranslatedToDirection(oldPos, direction)
    if (!positionIsValid(newPos)) return
    
    this.m_preWalks.push(newPos)
    
    let creature = g_map.getCreatureById?.(id)
    if (!creature) {
      creature = new Creature({ id })
      g_map.addCreature?.(creature)
    }
    
    creature.m_cameraFollowing = true
    creature.walk(oldPos, newPos)
    
    // OTC: Creature::onPositionChange(getLastStepToPosition(), getLastStepFromPosition());
    this.onPositionChange(creature.m_lastStepToPosition!, creature.m_lastStepFromPosition!)
    
    this.registerAdjustInvalidPosEvent()
  }

  walk(oldPos: Position, newPos: Position) {
    const id = this.getId()
    if (id == null) return
    this.m_autoWalkRetries = 0
    
    if (this.isPreWalking() && this.m_preWalks.length && positionEquals(newPos, this.m_preWalks[0])) {
      this.m_preWalks.shift()
      return
    }
    
    this.cancelAdjustInvalidPosEvent()
    this.m_preWalks = []
    this.m_serverWalk = true
    
    let creature = g_map.getCreatureById(id)
    if (!creature) {
      creature = new Creature({ id })
      g_map.addCreature(creature)
    }
    
    creature.m_cameraFollowing = true
    creature.walk(oldPos, newPos)
  }

  onPositionChange(newPos: Position, oldPos: Position) {
    if (this.isPreWalking()) return
    
    // OTC: Creature::onPositionChange(newPos, oldPos);
    // (In our case, the creature instance handles its own state, but we might need to sync something)
    
    if (positionEquals(newPos, this.m_autoWalkDestination)) {
      this.stopAutoWalk()
    } else if (positionIsValid(this.m_autoWalkDestination) && positionEquals(newPos, this.m_lastAutoWalkPosition)) {
      this.autoWalk(this.m_autoWalkDestination)
    }
    
    this.m_serverWalk = false
  }

  /** OTC: registerAdjustInvalidPosEvent() – schedule clear m_preWalks after stepDuration + ping + 100 (max 1000). */
  registerAdjustInvalidPosEvent() {
    this.cancelAdjustInvalidPosEvent()
    const creature = g_map?.getCreatureById?.(this.getId())
    const stepDuration = creature ? creature.getStepDuration() : 300
    const delay = Math.min(Math.max(stepDuration, 100) + 100, 1000)
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

  /** OTC: retryAutoWalk() – if m_autoWalkDestination, schedule autoWalk in 200ms, m_autoWalkRetries++; return true (max 3). */
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

  /** OTC: cancelWalk(Otc::Direction) – if (isWalking() && isPreWalking()) stopWalk(); lockWalk(); retryAutoWalk(); setDirection(direction); callLuaField("onCancelWalk"). */
  cancelWalk(direction = DirInvalid) {
    if (this.isWalking() && this.isPreWalking()) {
      const id = this.getId()
      const creature = g_map.getCreatureById(id) as Creature | null
      if (creature) {
        const source = creature.m_lastStepFromPosition
        creature.stopWalk()
        // Reverter criatura para o tile de origem (ex.: parede) para câmera e mapa ficarem corretos
        if (source) {
          g_map.removeThing(creature)
          g_map.addThing(creature, source, -1)
        }
      }
    }
    this.m_preWalks = []
    this.cancelAdjustInvalidPosEvent()
    this.m_idleTimer = clockMillis()
    this.lockWalk()
    if (this.retryAutoWalk()) return
    // @ts-ignore
    if (direction !== DirInvalid) this.setDirection?.(direction)
    if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('onCancelWalk', { detail: direction }))
  }

  /** OTC: stopAutoWalk() */
  stopAutoWalk() {
    this.m_autoWalkDestination = null
    this.m_lastAutoWalkPosition = null
    this.m_knownCompletePath = false
    if (this.m_autoWalkContinueEvent) {
      clearTimeout(this.m_autoWalkContinueEvent)
      this.m_autoWalkContinueEvent = null
    }
  }

  /** OTC: autoWalk(destination, retry) – reset state; m_autoWalkDestination = destination; g_map.findPathAsync(...); lockWalk() if !retry. */
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

  /** OTC: Creature::stopWalk() – only on creature; LocalPlayer has no stopWalk state beyond creature. */
  stopWalk() {
    const id = this.getId()
    const creature = g_map.getCreatureById(id)
    if (creature) creature.stopWalk()
    this.m_preWalks = []
  }

  /** OTC: não existe LocalPlayer::updateWalk que chama map – cada Creature agenda seu nextWalkUpdate. */

  /** OTC: terminateWalk() – Creature::terminateWalk(); m_serverWalk = false; callLuaField("onWalkFinish"). */
  terminateWalk() {
    this.m_serverWalk = false
    this.m_idleTimer = clockMillis()
    if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('onWalkFinish'))
  }

  /** OTC: isWalking() – creature is in walk state. */
  isWalking() {
    const creature = g_map.getCreatureById?.(this.getId())
    return !!creature?.m_walking
  }

  /** OTC: getDirection() – delegated to creature */
  getDirection(): number {
    const creature = g_map.getCreatureById?.(this.getId())
    return creature?.getDirection?.() ?? 2 // Default South
  }

  /**
   * Sistema de segurança: Verifica se o jogador está em qualquer estado de movimento.
   * Inclui verificações de m_walking, walkOffset, preWalks e serverWalk.
   * @returns {boolean} true se o jogador está em movimento, false caso contrário
   */
  isCreatureWalking() {
    const id = this.getId()
    const creature = g_map?.getCreatureById?.(id)
    
    // Verifica estados da criatura
    if (creature) {
      if (creature.m_walking) return true
      if (creature.m_walkOffset.x !== 0 || creature.m_walkOffset.y !== 0) return true
      if (creature.m_walkedPixels > 0) return true
    }
    
    // Verifica estados do LocalPlayer
    if (this.m_preWalks.length > 0) return true
    if (this.m_serverWalk) return true
    
    // Verifica pelo timer de walk
    if (creature) {
      const elapsed = creature.getWalkTicksElapsed()
      const stepDuration = creature.getStepDuration()
      if (elapsed < stepDuration) return true
    }
    
    return false
  }

  /**
   * Sistema de segurança: Retorna o progresso atual do walk (0-100%).
   * @returns {number} Porcentagem do walk atual (0 se não estiver andando)
   */
  getWalkProgress() {
    const id = this.getId()
    const creature = g_map?.getCreatureById?.(id)
    if (!creature) return 0
    
    const elapsed = creature.getWalkTicksElapsed()
    const stepDuration = creature.getStepDuration()
    if (stepDuration <= 0) return 0
    return Math.min(100, Math.floor((elapsed / stepDuration) * 100))
  }

  isDead() {
    return this.m_health != null && this.m_health <= 0
  }

  onAppear() {}

  /** OTC: onPositionChange(newPos, oldPos) – if newPos == m_autoWalkDestination stopAutoWalk(); else if m_autoWalkDestination && newPos == m_lastAutoWalkPosition autoWalk(dest); m_serverWalk = false. */
  onPositionChangeServer(newPos: Position, oldPos: Position) {
    if (this.isPreWalking()) return
    this.m_serverWalk = false
    if (positionEquals(newPos, this.m_autoWalkDestination)) this.stopAutoWalk()
    else if (positionIsValid(this.m_autoWalkDestination) && positionEquals(newPos, this.m_lastAutoWalkPosition)) this.autoWalk(this.m_autoWalkDestination)
  }

  setStates(states: number) {
    if (this.m_states !== states) {
      this.m_states = states
    }
  }

  setSkill(skill: number, level: number, levelPercent: number) {
    if (this.m_skillsLevel[skill] !== level || this.m_skillsLevelPercent[skill] !== levelPercent) {
      this.m_skillsLevel[skill] = level
      this.m_skillsLevelPercent[skill] = levelPercent
    }
  }

  setBaseSkill(skill: number, baseLevel: number) {
    if (this.m_skillsBaseLevel[skill] !== baseLevel) {
      this.m_skillsBaseLevel[skill] = baseLevel
    }
  }

  setHealth(health: number, maxHealth: number) {
    if (this.m_health !== health || this.m_maxHealth !== maxHealth) {
      this.m_health = health
      this.m_maxHealth = maxHealth
      if (this.isDead()) {
        if (this.isPreWalking()) this.stopWalk()
        this.lockWalk()
      }
    }
  }

  setFreeCapacity(freeCapacity: number) {
    this.m_freeCapacity = freeCapacity
  }

  setTotalCapacity(totalCapacity: number) {
    this.m_totalCapacity = totalCapacity
  }

  setExperience(experience: number) {
    this.m_experience = experience
  }

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

  setBaseMagicLevel(baseMagicLevel: number) {
    this.m_baseMagicLevel = baseMagicLevel
  }

  setSoul(soul: number) {
    this.m_soul = soul
  }

  setStamina(stamina: number) {
    this.m_stamina = stamina
  }

  setKnown(known: boolean) {
    this.m_known = known
  }

  setPendingGame(pending: boolean) {
    this.m_pending = pending
  }

  setInventoryItem(slot: number, item: Item | null) {
    this.m_inventoryItems[slot] = item
  }

  setVocation(vocation: number) {
    this.m_vocation = vocation
  }

  setPremium(premium: boolean) {
    this.m_premium = premium
  }

  setRegenerationTime(regenerationTime: number) {
    this.m_regenerationTime = regenerationTime
  }

  setOfflineTrainingTime(offlineTrainingTime: number) {
    this.m_offlineTrainingTime = offlineTrainingTime
  }

  setSpells(spells: number[]) {
    this.m_spells = spells || []
  }

  setBlessings(blessings: number) {
    this.m_blessings = blessings
  }

  getStates() {
    return this.m_states
  }

  getSkillLevel(skill: number) {
    return this.m_skillsLevel[skill] ?? -1
  }

  getSkillBaseLevel(skill: number) {
    return this.m_skillsBaseLevel[skill] ?? -1
  }

  getSkillLevelPercent(skill: number) {
    return this.m_skillsLevelPercent[skill] ?? -1
  }

  getVocation() {
    return this.m_vocation
  }

  getHealth() {
    return this.m_health
  }

  getMaxHealth() {
    return this.m_maxHealth
  }

  getFreeCapacity() {
    return this.m_freeCapacity
  }

  getTotalCapacity() {
    return this.m_totalCapacity
  }

  getExperience() {
    return this.m_experience
  }

  getLevel() {
    return this.m_level
  }

  getLevelPercent() {
    return this.m_levelPercent
  }

  getMana() {
    return this.m_mana
  }

  getMaxMana() {
    return this.m_maxMana
  }

  getMagicLevel() {
    return this.m_magicLevel
  }

  getMagicLevelPercent() {
    return this.m_magicLevelPercent
  }

  getBaseMagicLevel() {
    return this.m_baseMagicLevel
  }

  getSoul() {
    return this.m_soul
  }

  getStamina() {
    return this.m_stamina
  }

  getRegenerationTime() {
    return this.m_regenerationTime
  }

  getOfflineTrainingTime() {
    return this.m_offlineTrainingTime
  }

  getSpells() {
    return this.m_spells
  }

  getInventoryItem(slot: number) {
    return this.m_inventoryItems[slot]
  }

  getBlessings() {
    return this.m_blessings
  }

  hasSight(pos: Position) {
    if (!g_map?.center) return false
    const c = g_map.center
    const left = g_map.range?.left ?? 8
    const top = g_map.range?.top ?? 6
    return Math.abs(pos.x - c.x) <= left - 1 && Math.abs(pos.y - c.y) <= top - 1
  }

  isKnown() {
    return this.m_known
  }

  /** OTC: isPreWalking() – !m_preWalks.empty() */
  isPreWalking() {
    return this.m_preWalks.length > 0
  }

  getPreWalkingSize() {
    return this.m_preWalks.length
  }

  resetPreWalk() {
    this.m_preWalks = []
  }

  isAutoWalking() {
    return positionIsValid(this.m_autoWalkDestination)
  }

  /** OTC: isServerWalking() – m_serverWalk */
  isServerWalking() {
    return this.m_serverWalk
  }

  isPremium() {
    return this.m_premium
  }

  isPendingGame() {
    return this.m_pending
  }
}

export const g_player = new LocalPlayer()
export { DirInvalid }
