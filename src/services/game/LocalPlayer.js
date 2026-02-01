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
import { Creature } from '../client/Creature.js'
import { g_map } from '../client/ClientMap.js'
import { Tile } from '../client/Tile.js'

const DirInvalid = -1

function clockMillis() {
  return typeof performance !== 'undefined' ? performance.now() : Date.now()
}

function positionIsValid(pos) {
  return pos != null && Number.isFinite(pos.x) && Number.isFinite(pos.y) && Number.isFinite(pos.z)
}

function positionEquals(a, b) {
  return a && b && a.x === b.x && a.y === b.y && a.z === b.z
}

export class LocalPlayer {
  constructor() {
    this._id = null
    this._creature = null
    if (typeof window !== 'undefined') window.__otPlayerId = undefined

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
    if (typeof window !== 'undefined' && window.__otPlayerId != null) return window.__otPlayerId
    return this._id
  }

  setId(id) {
    this._id = id ?? null
    if (typeof window !== 'undefined') window.__otPlayerId = id ?? undefined
  }

  getCreature() {
    return this._creature ?? null
  }

  setCreature(data) {
    this._creature = data ?? null
  }

  isLocalPlayer(creatureId) {
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
  getPosition() {
    if (this.isPreWalking() && this.m_preWalks.length) return { ...this.m_preWalks[this.m_preWalks.length - 1] }
    return g_map?.center ? { ...g_map.center } : {}
  }

  /** OTC: isWalkLocked() */
  isWalkLocked() {
    return this.m_walkLockExpiration !== 0 && clockMillis() < this.m_walkLockExpiration
  }

  /** OTC: LocalPlayer::canWalk(bool ignoreLock) – localplayer.cpp 1:1. */
  canWalk(ignoreLock = false) {
    if (this.isDead()) return false
    if (this.isWalkLocked() && !ignoreLock) return false

    const maxSteps = this.getWalkMaxSteps()
    if (maxSteps > 0) {
      if (this.m_preWalks.length > maxSteps) return false
    } else if (!positionEquals(this.getPosition(), this.getServerPosition())) {
      return false
    }

    if (this.isWalking()) {
      if (this.isAutoWalking()) return true
      if (this.isPreWalking()) return false
    }

    const elapsed = this.m_walkTimerStart > 0 ? clockMillis() - this.m_walkTimerStart : 999999
    return elapsed >= this.getStepDuration()
  }

  /** OTC: g_game.getWalkMaxSteps() – 0 = sync by position only. */
  getWalkMaxSteps() {
    return 0
  }

  getServerPosition() {
    return g_map?.center ? { ...g_map.center } : {}
  }

  /** OTC: Creature::getStepDuration() – used for canWalk step-done check. */
  getStepDuration() {
    const center = g_map?.center ?? {}
    return Creature.getStepDuration(this.getCreature() ?? {}, center, center)
  }

  /** OTC: preWalk(Otc::Direction direction) – m_preWalks.emplace_back(oldPos.translatedToDirection(direction)); Creature::walk(oldPos, back); registerAdjustInvalidPosEvent(). */
  preWalk(direction) {
    const id = this.getId()
    if (id == null) return
    const oldPos = this.getPosition()
    const newPos = Creature.positionTranslatedToDirection(oldPos, direction)
    if (!positionIsValid(newPos)) return
    this.m_preWalks.push(newPos)
    let creature = g_map.getCreatureById?.(id)
    if (!creature) {
      creature = new Creature({ ...(this.getCreature() ?? {}), creatureId: id, id })
      g_map.addCreature?.(creature)
    }
    creature.m_cameraFollowing = true
    creature._onTerminateWalk = () => this.terminateWalk()
    creature.walk(oldPos, newPos, () => this.m_thingsRef?.current?.types ?? null)
    this.m_walkTimerStart = clockMillis()
    this.registerAdjustInvalidPosEvent()
  }

  /** OTC: walk(oldPos, newPos) – if (isPreWalking() && newPos == m_preWalks.front()) pop_front; return; cancelAdjustInvalidPosEvent(); m_preWalks.clear(); m_serverWalk = true; Creature::walk(oldPos, newPos). */
  walk(oldPos, newPos, mapStore) {
    if (!mapStore) return
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
    this._doWalk(mapStore, id, oldPos, newPos)
  }

  /** OTC: registerAdjustInvalidPosEvent() – schedule clear m_preWalks after stepDuration + ping + 100 (max 1000). */
  registerAdjustInvalidPosEvent(mapStore) {
    this.cancelAdjustInvalidPosEvent()
    const creature = mapStore?.getCreatureById?.(this.getId())
    const stepDuration = creature?.m_stepDuration ?? 300
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

  /** OTC: criatura fica no tile antigo durante o walk; só move para toPos quando a animação termina (Creature.terminateWalk). */
  _doWalk(mapStore, creatureId, fromPos, toPos) {
    if (fromPos.x === toPos.x && fromPos.y === toPos.y && fromPos.z === toPos.z) return
    let creature = mapStore.getCreatureById(creatureId)
    if (!creature) {
      creature = new Creature({ ...(this.getCreature() ?? {}), creatureId, id: creatureId })
      mapStore.addCreature(creature)
    } else {
      creature.m_entry = { ...creature.m_entry, ...(this.getCreature() ?? {}) }
    }
    creature.m_cameraFollowing = true
    creature.walk(fromPos, toPos, mapStore)
    this.m_walkTimerStart = clockMillis()
  }

  /** OTC: cancelWalk(Otc::Direction) – if (isWalking() && isPreWalking()) stopWalk(); lockWalk(); retryAutoWalk(); setDirection(direction); callLuaField("onCancelWalk"). */
  cancelWalk(direction = DirInvalid) {
    if (this.isWalking?.() && this.isPreWalking()) {
      const id = this.getId()
      const creature = g_map.getCreatureById(id)
      if (creature) creature.stopWalk()
    }
    this.m_preWalks = []
    this.cancelAdjustInvalidPosEvent()
    this.m_idleTimer = clockMillis()
    this.lockWalk()
    if (this.retryAutoWalk()) return
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
  autoWalk(destination, mapStore) {
    this.m_autoWalkDestination = null
    this.m_lastAutoWalkPosition = null
    if (this.m_autoWalkContinueEvent) {
      clearTimeout(this.m_autoWalkContinueEvent)
      this.m_autoWalkContinueEvent = null
    }
    if (!mapStore || !positionIsValid(destination)) return false
    if (positionEquals(destination, mapStore.center)) return true
    this.m_autoWalkDestination = { ...destination }
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

  isDead() {
    return this.m_health != null && this.m_health <= 0
  }

  onAppear() {}

  /** OTC: onPositionChange(newPos, oldPos) – if newPos == m_autoWalkDestination stopAutoWalk(); else if m_autoWalkDestination && newPos == m_lastAutoWalkPosition autoWalk(dest); m_serverWalk = false. */
  onPositionChange(newPos, oldPos) {
    if (this.isPreWalking()) return
    this.m_serverWalk = false
    if (positionEquals(newPos, this.m_autoWalkDestination)) this.stopAutoWalk()
    else if (positionIsValid(this.m_autoWalkDestination) && positionEquals(newPos, this.m_lastAutoWalkPosition)) this.autoWalk(this.m_autoWalkDestination, mapStore)
  }

  setStates(states) {
    if (this.m_states !== states) {
      const oldStates = this.m_states
      this.m_states = states
    }
  }

  setSkill(skill, level, levelPercent) {
    if (this.m_skillsLevel[skill] !== level || this.m_skillsLevelPercent[skill] !== levelPercent) {
      this.m_skillsLevel[skill] = level
      this.m_skillsLevelPercent[skill] = levelPercent
    }
  }

  setBaseSkill(skill, baseLevel) {
    if (this.m_skillsBaseLevel[skill] !== baseLevel) {
      this.m_skillsBaseLevel[skill] = baseLevel
    }
  }

  setHealth(health, maxHealth) {
    if (this.m_health !== health || this.m_maxHealth !== maxHealth) {
      this.m_health = health
      this.m_maxHealth = maxHealth
      if (this.isDead()) {
        if (this.isPreWalking()) this.stopWalk()
        this.lockWalk()
      }
    }
  }

  setFreeCapacity(freeCapacity) {
    this.m_freeCapacity = freeCapacity
  }

  setTotalCapacity(totalCapacity) {
    this.m_totalCapacity = totalCapacity
  }

  setExperience(experience) {
    this.m_experience = experience
  }

  setLevel(level, levelPercent) {
    this.m_level = level
    this.m_levelPercent = levelPercent
  }

  setMana(mana, maxMana) {
    this.m_mana = mana
    this.m_maxMana = maxMana
  }

  setMagicLevel(magicLevel, magicLevelPercent) {
    this.m_magicLevel = magicLevel
    this.m_magicLevelPercent = magicLevelPercent
  }

  setBaseMagicLevel(baseMagicLevel) {
    this.m_baseMagicLevel = baseMagicLevel
  }

  setSoul(soul) {
    this.m_soul = soul
  }

  setStamina(stamina) {
    this.m_stamina = stamina
  }

  setKnown(known) {
    this.m_known = known
  }

  setPendingGame(pending) {
    this.m_pending = pending
  }

  setInventoryItem(slot, item) {
    this.m_inventoryItems[slot] = item
  }

  setVocation(vocation) {
    this.m_vocation = vocation
  }

  setPremium(premium) {
    this.m_premium = premium
  }

  setRegenerationTime(regenerationTime) {
    this.m_regenerationTime = regenerationTime
  }

  setOfflineTrainingTime(offlineTrainingTime) {
    this.m_offlineTrainingTime = offlineTrainingTime
  }

  setSpells(spells) {
    this.m_spells = spells || []
  }

  setBlessings(blessings) {
    this.m_blessings = blessings
  }

  getStates() {
    return this.m_states
  }

  getSkillLevel(skill) {
    return this.m_skillsLevel[skill] ?? -1
  }

  getSkillBaseLevel(skill) {
    return this.m_skillsBaseLevel[skill] ?? -1
  }

  getSkillLevelPercent(skill) {
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

  getInventoryItem(slot) {
    return this.m_inventoryItems[slot]
  }

  getBlessings() {
    return this.m_blessings
  }

  hasSight(pos) {
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

export const localPlayer = new LocalPlayer()
export { DirInvalid }
