/**
 * LocalPlayer – 1:1 port of OTClient src/client/localplayer.h + localplayer.cpp
 * Copyright (c) 2010-2020 OTClient; ported to JS for this project.
 *
 * Walk: lockWalk, canWalk, preWalk, walk (server confirm), cancelWalk, stopWalk.
 * AutoWalk: stopAutoWalk, autoWalk (stub; pathfind not ported).
 * State/skills/health/mana etc. setters and getters.
 */
import { Creature } from '../things/Creature.js'
import { getMapStore } from '../protocol/mapStore.js'

const PREWALK_TIMEOUT = 1000
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

    this.m_lastPrewalkDestination = null
    this.m_autoWalkDestination = null
    this.m_lastAutoWalkPosition = null
    this.m_serverWalkEndEvent = null
    this.m_autoWalkContinueEvent = null
    this.m_preWalking = false
    this.m_lastPrewalkDone = true
    this.m_secondPreWalk = false
    this.m_serverWalking = false
    this.m_knownCompletePath = false
    this.m_premium = false
    this.m_known = false
    this.m_pending = false
    this.m_inventoryItems = {}
    this.m_idleTimer = 0
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

  canWalk(mapStore, direction = DirInvalid) {
    if (!mapStore) return false
    const id = this.getId()
    if (id == null) return false
    const now = clockMillis()

    if (this.m_walkLockExpiration !== 0 && now < this.m_walkLockExpiration) return false

    const creature = mapStore.getCreature?.(id)
    const entry = creature?.m_entry ?? this.getCreature() ?? {}
    if ((entry.speed ?? 110) === 0) return false

    const stepDuration = creature?.m_stepDuration ?? Creature.getStepDuration(entry, mapStore.center, mapStore.center)
    const elapsed = creature?.m_walking ? now - (creature.m_startTime ?? 0) : 0
    const walkNotDone = creature?.m_walking && elapsed < stepDuration
    const prewalkTimeouted = creature?.m_walking && this.m_preWalking && elapsed >= stepDuration + PREWALK_TIMEOUT

    if (walkNotDone && !this.isAutoWalking()) return false
    if (!this.m_lastPrewalkDone && this.m_preWalking && !prewalkTimeouted) return false
    if (creature?.m_walking && !this.isAutoWalking() && (!prewalkTimeouted || this.m_secondPreWalk)) return false

    return true
  }

  preWalk(direction) {
    const mapStore = getMapStore()
    if (!mapStore) return
    const id = this.getId()
    if (id == null) return
    const pos = { ...mapStore.center }
    const newPos = Creature.positionTranslatedToDirection(pos, direction)
    if (!positionIsValid(newPos)) return

    if (this.m_preWalking) {
      this.m_secondPreWalk = true
      return
    }

    this.m_preWalking = true
    if (this.m_serverWalkEndEvent) {
      clearTimeout(this.m_serverWalkEndEvent)
      this.m_serverWalkEndEvent = null
    }
    this.m_lastPrewalkDone = false
    this.m_lastPrewalkDestination = { ...newPos }
    let creature = mapStore.getCreatureById?.(id)
    if (!creature) {
      creature = new Creature({ ...(this.getCreature() ?? {}), creatureId: id, id })
      mapStore.addCreature?.(creature)
    }
    creature.walk(pos, newPos)
  }

  walk(oldPos, newPos, mapStore) {
    if (!mapStore) return
    const id = this.getId()
    if (id == null) return

    if (this.m_preWalking) {
      this.m_preWalking = false
      this.m_secondPreWalk = false
      this.m_lastPrewalkDone = true
      if (!positionEquals(newPos, this.m_lastPrewalkDestination)) {
        this._doWalk(mapStore, id, oldPos, newPos)
      }
      return
    }

    this.m_serverWalking = true
    if (this.m_serverWalkEndEvent) {
      clearTimeout(this.m_serverWalkEndEvent)
      this.m_serverWalkEndEvent = null
    }
    this._doWalk(mapStore, id, oldPos, newPos)
  }

  /** Atualiza tiles (remove de fromPos, adiciona em toPos) e chama creature.walk. OTC: tile update no protocol/game; walk na Creature. */
  _doWalk(mapStore, creatureId, fromPos, toPos) {
    if (fromPos.x === toPos.x && fromPos.y === toPos.y && fromPos.z === toPos.z) return
    let creature = mapStore.getCreatureById(creatureId)
    if (!creature) {
      creature = new Creature({ ...(this.getCreature() ?? {}), creatureId, id: creatureId })
      mapStore.addCreature(creature)
    } else {
      creature.m_entry = { ...creature.m_entry, ...(this.getCreature() ?? {}) }
    }
    const found = mapStore.findCreaturePosition(creatureId)
    if (found?.pos && found.stackPos != null) {
      mapStore.removeThingByPos(found.pos, found.stackPos)
    }
    const dir = Creature.getDirectionFromPosition(fromPos, toPos)
    const entry = creature.m_entry || {}
    const thing = {
      kind: 'creature',
      creatureId,
      id: entry.outfit?.lookType ?? entry.lookType ?? 0,
      outfit: entry.outfit ?? null,
      direction: dir,
      name: entry.name ?? '',
    }
    mapStore.addThing(thing, toPos)
    creature.walk(fromPos, toPos)
  }

  cancelWalk(direction = DirInvalid) {
    const mapStore = typeof window !== 'undefined' ? window.__otMapStore : null
    if (this.m_preWalking && mapStore) {
      const id = this.getId()
      const creature = id != null ? mapStore.getCreatureById(id) : null
      if (creature) creature.stopWalk()
      this.stopWalk()
    }
    this.m_lastPrewalkDone = true
    this.m_idleTimer = clockMillis()
    this.lockWalk()
    if (this.m_autoWalkDestination && positionIsValid(this.m_autoWalkDestination)) {
      if (this.m_autoWalkContinueEvent) {
        clearTimeout(this.m_autoWalkContinueEvent)
        this.m_autoWalkContinueEvent = null
      }
      const self = this
      const dest = { ...this.m_autoWalkDestination }
      this.m_autoWalkContinueEvent = setTimeout(() => {
        self.m_autoWalkContinueEvent = null
        const ms = typeof window !== 'undefined' ? window.__otMapStore : null
        if (positionIsValid(dest)) self.autoWalk(dest, ms)
      }, 500)
    }
    if (direction !== DirInvalid) {
      this.setDirection?.(direction)
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

  autoWalk(destination, mapStore) {
    if (!mapStore || !positionIsValid(destination)) return false
    if (positionEquals(destination, mapStore.center)) return true
    this.stopAutoWalk()
    this.m_autoWalkDestination = { ...destination }
    return true
  }

  stopWalk() {
    const mapStore = typeof window !== 'undefined' ? window.__otMapStore : null
    const id = this.getId()
    const creature = mapStore && id != null ? mapStore.getCreatureById(id) : null
    if (creature) creature.stopWalk()
    this.m_lastPrewalkDone = true
    this.m_lastPrewalkDestination = null
  }

  updateWalk(mapStore) {
    const id = this.getId()
    if (!mapStore || id == null) return
    const creature = mapStore.getCreature?.(id)
    if (!creature?.m_walking) return
    const thingsRef = typeof window !== 'undefined' && window.__otThingsRef ? window.__otThingsRef.current : null
    const now = clockMillis()
    mapStore.updateWalk(now, thingsRef)
  }

  terminateWalk() {
    this.m_preWalking = false
    this.m_secondPreWalk = false
    this.m_idleTimer = clockMillis()
    if (this.m_serverWalking) {
      if (this.m_serverWalkEndEvent) {
        clearTimeout(this.m_serverWalkEndEvent)
        this.m_serverWalkEndEvent = null
      }
      const self = this
      this.m_serverWalkEndEvent = setTimeout(() => {
        self.m_serverWalking = false
        self.m_serverWalkEndEvent = null
      }, 100)
    }
  }

  onAppear() {
    // OTC: Creature::onAppear();
  }

  onPositionChange(newPos, oldPos, mapStore) {
    if (positionEquals(newPos, this.m_autoWalkDestination)) this.stopAutoWalk()
    else if (positionIsValid(this.m_autoWalkDestination) && positionEquals(newPos, this.m_lastAutoWalkPosition)) {
      this.autoWalk(this.m_autoWalkDestination, mapStore)
    }
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
      if (health === 0) {
        if (this.m_preWalking) this.stopWalk()
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

  hasSight(pos, mapStore) {
    if (!mapStore?.center) return false
    const c = mapStore.center
    const left = mapStore.range?.left ?? 8
    const top = mapStore.range?.top ?? 6
    return Math.abs(pos.x - c.x) <= left - 1 && Math.abs(pos.y - c.y) <= top - 1
  }

  isKnown() {
    return this.m_known
  }

  isPreWalking() {
    return this.m_preWalking
  }

  isAutoWalking() {
    return positionIsValid(this.m_autoWalkDestination)
  }

  isServerWalking() {
    return this.m_serverWalking
  }

  isPremium() {
    return this.m_premium
  }

  isPendingGame() {
    return this.m_pending
  }
}

export const localPlayer = new LocalPlayer()
export { PREWALK_TIMEOUT, DirInvalid }
