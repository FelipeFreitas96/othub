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
import { g_map, PathFindResultEnum } from './ClientMap'
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
  m_manaShield: number
  m_maxManaShield: number
  m_soul: number
  m_stamina: number
  m_regenerationTime: number
  m_offlineTrainingTime: number
  m_storeExpBoostTime: number
  m_experienceRates: Record<number, number>
  m_flatDamageHealing: number
  m_attackValue: number
  m_attackElement: number
  m_convertedDamage: number
  m_convertedElement: number
  m_lifeLeech: number
  m_manaLeech: number
  m_critChance: number
  m_critDamage: number
  m_onslaught: number
  m_defense: number
  m_armor: number
  m_mitigation: number
  m_dodge: number
  m_damageReflection: number
  m_combatAbsorbValues: Record<number, number>
  m_momentum: number
  m_transcendence: number
  m_amplification: number
  m_harmony: number
  m_serene: boolean
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
    this.m_manaShield = 0
    this.m_maxManaShield = 0
    this.m_soul = -1
    this.m_stamina = -1
    this.m_regenerationTime = -1
    this.m_offlineTrainingTime = -1
    this.m_storeExpBoostTime = 0
    this.m_experienceRates = {}
    this.m_flatDamageHealing = 0
    this.m_attackValue = 0
    this.m_attackElement = 0
    this.m_convertedDamage = 0
    this.m_convertedElement = 0
    this.m_lifeLeech = 0
    this.m_manaLeech = 0
    this.m_critChance = 0
    this.m_critDamage = 0
    this.m_onslaught = 0
    this.m_defense = 0
    this.m_armor = 0
    this.m_mitigation = 0
    this.m_dodge = 0
    this.m_damageReflection = 0
    this.m_combatAbsorbValues = {}
    this.m_momentum = 0
    this.m_transcendence = 0
    this.m_amplification = 0
    this.m_harmony = 0
    this.m_serene = false
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

  private emit(event: string, ...args: any[]) {
    if (typeof window === 'undefined') return
    window.dispatchEvent(
      new CustomEvent(`localPlayer:${event}`, {
        detail: { player: this, args },
      })
    )
  }

  override getId(): number | string { return this.m_id }
  override setId(id: number | string | null) {
    this.m_id = id as number | string
  }

  override isLocalPlayer(): boolean { return true }

  override setSpeed(speed: number) {
    const oldSpeed = this.getSpeed()
    super.setSpeed(speed)
    if (oldSpeed !== this.getSpeed()) {
      this.emit('onSpeedChange', this.getSpeed(), oldSpeed)
    }
  }

  override setBaseSpeed(baseSpeed: number) {
    const oldBaseSpeed = this.getBaseSpeed()
    if (oldBaseSpeed === baseSpeed) return
    super.setBaseSpeed(baseSpeed)
    this.emit('onBaseSpeedChange', baseSpeed, oldBaseSpeed)
  }

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
    g_game.stop()
    if (this.m_autoWalkRetries <= 3) {
      if (this.m_autoWalkContinueEvent) clearTimeout(this.m_autoWalkContinueEvent)
      const dest = this.m_autoWalkDestination.clone()
      this.m_autoWalkContinueEvent = setTimeout(() => {
        this.m_autoWalkContinueEvent = null
        this.autoWalk(dest, true)
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

  autoWalk(destination: PositionLike, retry = false) {
    this.m_autoWalkDestination = null
    this.m_lastAutoWalkPosition = null
    if (this.m_autoWalkContinueEvent) {
      clearTimeout(this.m_autoWalkContinueEvent)
      this.m_autoWalkContinueEvent = null
    }

    if (!retry) this.m_autoWalkRetries = 0
    if (!g_map || !positionIsValid(destination)) return false

    const destinationPos = destination instanceof Position ? destination.clone() : Position.from(destination)
    const startPos = this.getServerPosition()
    if (positionEquals(destinationPos, startPos)) return true

    this.m_autoWalkDestination = destinationPos
    g_map.findPathAsync(startPos, destinationPos, (result) => {
      if (!result) return
      if (!positionEquals(this.m_autoWalkDestination, result.destination)) return

      if (result.status !== PathFindResultEnum.PathFindResultOk) {
        if (this.m_autoWalkRetries > 0 && this.m_autoWalkRetries <= 3) {
          if (this.m_autoWalkContinueEvent) clearTimeout(this.m_autoWalkContinueEvent)
          const retryDestination = result.destination.clone()
          const retryDelay = 200 + this.m_autoWalkRetries * 100
          this.m_autoWalkContinueEvent = setTimeout(() => {
            this.m_autoWalkContinueEvent = null
            this.autoWalk(retryDestination, true)
          }, retryDelay)
          return
        }

        this.m_autoWalkDestination = null
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('onAutoWalkFail', { detail: result.status }))
          window.dispatchEvent(new CustomEvent('ot:autoWalkFail', { detail: result.status }))
        }
        return
      }

      const path = result.path.slice(0, 127)
      if (path.length === 0) {
        this.m_autoWalkDestination = null
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('onAutoWalkFail', { detail: result.status }))
          window.dispatchEvent(new CustomEvent('ot:autoWalkFail', { detail: result.status }))
        }
        return
      }

      if (!positionEquals(this.m_autoWalkDestination, result.destination)) {
        this.m_lastAutoWalkPosition = result.destination.clone()
      }

      g_game.autoWalk(path, result.start)
    })

    if (!retry) this.lockWalk()
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

  setStates(states: number) {
    if (this.m_states === states) return
    const oldStates = this.m_states
    this.m_states = states
    this.emit('onStatesChange', states, oldStates)
  }

  setSkill(skill: number, level: number, levelPercent: number) {
    const oldLevel = this.m_skillsLevel[skill] ?? 0
    const oldLevelPercent = this.m_skillsLevelPercent[skill] ?? 0
    if (oldLevel === level && oldLevelPercent === levelPercent) return
    this.m_skillsLevel[skill] = level
    this.m_skillsLevelPercent[skill] = levelPercent
    this.emit('onSkillChange', skill, level, levelPercent, oldLevel, oldLevelPercent)
  }

  setBaseSkill(skill: number, baseLevel: number) {
    const oldBaseLevel = this.m_skillsBaseLevel[skill] ?? 0
    if (oldBaseLevel === baseLevel) return
    this.m_skillsBaseLevel[skill] = baseLevel
    this.emit('onBaseSkillChange', skill, baseLevel, oldBaseLevel)
  }

  setHealth(health: number, maxHealth: number) {
    if (this.m_health === health && this.m_maxHealth === maxHealth) return
    const oldHealth = this.m_health
    const oldMaxHealth = this.m_maxHealth
    this.m_health = health
    this.m_maxHealth = maxHealth
    this.emit('onHealthChange', health, maxHealth, oldHealth, oldMaxHealth)
    if (this.isDead()) {
      if (this.isPreWalking()) this.stopWalk()
      this.lockWalk()
    }
  }

  setFreeCapacity(freeCapacity: number) {
    if (this.m_freeCapacity === freeCapacity) return
    const oldFreeCapacity = this.m_freeCapacity
    this.m_freeCapacity = freeCapacity
    this.emit('onFreeCapacityChange', freeCapacity, oldFreeCapacity)
  }

  setTotalCapacity(totalCapacity: number) {
    if (this.m_totalCapacity === totalCapacity) return
    const oldTotalCapacity = this.m_totalCapacity
    this.m_totalCapacity = totalCapacity
    this.emit('onTotalCapacityChange', totalCapacity, oldTotalCapacity)
  }

  setExperience(experience: number) {
    if (this.m_experience === experience) return
    const oldExperience = this.m_experience
    this.m_experience = experience
    this.emit('onExperienceChange', experience, oldExperience)
  }

  setLevel(level: number, levelPercent: number) {
    if (this.m_level === level && this.m_levelPercent === levelPercent) return
    const oldLevel = this.m_level
    const oldLevelPercent = this.m_levelPercent
    this.m_level = level
    this.m_levelPercent = levelPercent
    this.emit('onLevelChange', level, levelPercent, oldLevel, oldLevelPercent)
  }

  setMana(mana: number, maxMana: number) {
    if (this.m_mana === mana && this.m_maxMana === maxMana) return
    const oldMana = this.m_mana
    const oldMaxMana = this.m_maxMana
    this.m_mana = mana
    this.m_maxMana = maxMana
    this.emit('onManaChange', mana, maxMana, oldMana, oldMaxMana)
  }

  setManaShield(manaShield: number, maxManaShield: number) {
    if (this.m_manaShield === manaShield && this.m_maxManaShield === maxManaShield) return
    const oldManaShield = this.m_manaShield
    const oldMaxManaShield = this.m_maxManaShield
    this.m_manaShield = manaShield
    this.m_maxManaShield = maxManaShield
    this.emit('onManaShieldChange', manaShield, maxManaShield, oldManaShield, oldMaxManaShield)
  }

  setMagicLevel(magicLevel: number, magicLevelPercent: number) {
    if (this.m_magicLevel === magicLevel && this.m_magicLevelPercent === magicLevelPercent) return
    const oldMagicLevel = this.m_magicLevel
    const oldMagicLevelPercent = this.m_magicLevelPercent
    this.m_magicLevel = magicLevel
    this.m_magicLevelPercent = magicLevelPercent
    this.emit('onMagicLevelChange', magicLevel, magicLevelPercent, oldMagicLevel, oldMagicLevelPercent)
  }

  setBaseMagicLevel(baseMagicLevel: number) {
    if (this.m_baseMagicLevel === baseMagicLevel) return
    const oldBaseMagicLevel = this.m_baseMagicLevel
    this.m_baseMagicLevel = baseMagicLevel
    this.emit('onBaseMagicLevelChange', baseMagicLevel, oldBaseMagicLevel)
  }

  setSoul(soul: number) {
    if (this.m_soul === soul) return
    const oldSoul = this.m_soul
    this.m_soul = soul
    this.emit('onSoulChange', soul, oldSoul)
  }

  setStamina(stamina: number) {
    if (this.m_stamina === stamina) return
    const oldStamina = this.m_stamina
    this.m_stamina = stamina
    this.emit('onStaminaChange', stamina, oldStamina)
  }

  setRegenerationTime(regenerationTime: number) {
    if (this.m_regenerationTime === regenerationTime) return
    const oldRegenerationTime = this.m_regenerationTime
    this.m_regenerationTime = regenerationTime
    this.emit('onRegenerationChange', regenerationTime, oldRegenerationTime)
  }

  setOfflineTrainingTime(offlineTrainingTime: number) {
    if (this.m_offlineTrainingTime === offlineTrainingTime) return
    const oldOfflineTrainingTime = this.m_offlineTrainingTime
    this.m_offlineTrainingTime = offlineTrainingTime
    this.emit('onOfflineTrainingChange', offlineTrainingTime, oldOfflineTrainingTime)
  }

  setSpells(spells: number[]) {
    const next = spells || []
    const same =
      this.m_spells.length === next.length &&
      this.m_spells.every((value, index) => value === next[index])
    if (same) return
    const oldSpells = [...this.m_spells]
    this.m_spells = [...next]
    this.emit('onSpellsChange', this.m_spells, oldSpells)
  }

  setBlessings(blessings: number) {
    if (this.m_blessings === blessings) return
    const oldBlessings = this.m_blessings
    this.m_blessings = blessings
    this.emit('onBlessingsChange', blessings, oldBlessings)
  }

  setKnown(known: boolean) { this.m_known = known }

  setPendingGame(pending: boolean) { this.m_pending = pending }

  setInventoryItem(slot: number, item: Item | null) {
    const oldItem = this.m_inventoryItems[slot] ?? null
    if (oldItem === item) return
    if (item?.setPosition) {
      item.setPosition(new Position(0xffff, slot, 0), 0)
    }
    this.m_inventoryItems[slot] = item
    this.emit('onInventoryChange', slot, item, oldItem)
  }

  setPremium(premium: boolean) {
    if (this.m_premium === premium) return
    this.m_premium = premium
    this.emit('onPremiumChange', premium)
  }

  setFlatDamageHealing(flatBonus: number) {
    if (this.m_flatDamageHealing === flatBonus) return
    this.m_flatDamageHealing = flatBonus
    this.emit('onFlatDamageHealingChange', flatBonus)
  }

  setAttackInfo(attackValue: number, attackElement: number) {
    if (this.m_attackValue === attackValue && this.m_attackElement === attackElement) return
    this.m_attackValue = attackValue
    this.m_attackElement = attackElement
    this.emit('onAttackInfoChange', attackValue, attackElement)
  }

  setConvertedDamage(convertedDamage: number, convertedElement: number) {
    if (this.m_convertedDamage === convertedDamage && this.m_convertedElement === convertedElement) return
    this.m_convertedDamage = convertedDamage
    this.m_convertedElement = convertedElement
    this.emit('onConvertedDamageChange', convertedDamage, convertedElement)
  }

  setImbuements(lifeLeech: number, manaLeech: number, critChance: number, critDamage: number, onslaught: number) {
    if (
      this.m_lifeLeech === lifeLeech &&
      this.m_manaLeech === manaLeech &&
      this.m_critChance === critChance &&
      this.m_critDamage === critDamage &&
      this.m_onslaught === onslaught
    ) return
    this.m_lifeLeech = lifeLeech
    this.m_manaLeech = manaLeech
    this.m_critChance = critChance
    this.m_critDamage = critDamage
    this.m_onslaught = onslaught
    this.emit('onImbuementsChange', lifeLeech, manaLeech, critChance, critDamage, onslaught)
  }

  setDefenseInfo(defense: number, armor: number, mitigation: number, dodge: number, damageReflection: number) {
    if (
      this.m_defense === defense &&
      this.m_armor === armor &&
      this.m_mitigation === mitigation &&
      this.m_dodge === dodge &&
      this.m_damageReflection === damageReflection
    ) return
    this.m_defense = defense
    this.m_armor = armor
    this.m_mitigation = mitigation
    this.m_dodge = dodge
    this.m_damageReflection = damageReflection
    this.emit('onDefenseInfoChange', defense, armor, mitigation, dodge, damageReflection)
  }

  setCombatAbsorbValues(absorbValues: Record<number, number>) {
    const normalized = absorbValues || {}
    const oldKeys = Object.keys(this.m_combatAbsorbValues)
    const newKeys = Object.keys(normalized)
    const same =
      oldKeys.length === newKeys.length &&
      newKeys.every((key) => this.m_combatAbsorbValues[Number(key)] === normalized[Number(key)])
    if (same) return
    this.m_combatAbsorbValues = { ...normalized }
    this.emit('onCombatAbsorbValuesChange', { ...this.m_combatAbsorbValues })
  }

  setForgeBonuses(momentum: number, transcendence: number, amplification: number) {
    if (
      this.m_momentum === momentum &&
      this.m_transcendence === transcendence &&
      this.m_amplification === amplification
    ) return
    this.m_momentum = momentum
    this.m_transcendence = transcendence
    this.m_amplification = amplification
    this.emit('onForgeBonusesChange', momentum, transcendence, amplification)
  }

  setExperienceRate(type: number, value: number) {
    if (this.m_experienceRates[type] === value) return
    this.m_experienceRates[type] = value
    this.emit('onExperienceRateChange', type, value)
  }

  setStoreExpBoostTime(value: number) {
    if (this.m_storeExpBoostTime === value) return
    const oldValue = this.m_storeExpBoostTime
    this.m_storeExpBoostTime = value
    this.emit('onStoreExpBoostTimeChange', value, oldValue)
  }

  setHarmony(harmony: number) {
    if (this.m_harmony === harmony) return
    const oldHarmony = this.m_harmony
    this.m_harmony = harmony
    this.emit('onHarmonyChange', harmony, oldHarmony)
  }

  setSerene(serene: boolean) {
    if (this.m_serene === serene) return
    const oldSerene = this.m_serene
    this.m_serene = serene
    this.emit('onSereneChange', serene, oldSerene)
  }

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
  getManaShield() { return this.m_manaShield }
  getMaxManaShield() { return this.m_maxManaShield }
  getMagicLevel() { return this.m_magicLevel }
  getMagicLevelPercent() { return this.m_magicLevelPercent }
  getBaseMagicLevel() { return this.m_baseMagicLevel }
  getSoul() { return this.m_soul }
  getStamina() { return this.m_stamina }
  getRegenerationTime() { return this.m_regenerationTime }
  getOfflineTrainingTime() { return this.m_offlineTrainingTime }
  getStoreExpBoostTime() { return this.m_storeExpBoostTime }
  getExperienceRate(type: number) { return this.m_experienceRates[type] ?? 0 }
  getExperienceRates() { return { ...this.m_experienceRates } }
  getFlatDamageHealing() { return this.m_flatDamageHealing }
  getAttackInfo() { return { attackValue: this.m_attackValue, attackElement: this.m_attackElement } }
  getConvertedDamage() { return { convertedDamage: this.m_convertedDamage, convertedElement: this.m_convertedElement } }
  getImbuements() {
    return {
      lifeLeech: this.m_lifeLeech,
      manaLeech: this.m_manaLeech,
      critChance: this.m_critChance,
      critDamage: this.m_critDamage,
      onslaught: this.m_onslaught,
    }
  }
  getDefenseInfo() {
    return {
      defense: this.m_defense,
      armor: this.m_armor,
      mitigation: this.m_mitigation,
      dodge: this.m_dodge,
      damageReflection: this.m_damageReflection,
    }
  }
  getCombatAbsorbValues() { return { ...this.m_combatAbsorbValues } }
  getForgeBonuses() {
    return {
      momentum: this.m_momentum,
      transcendence: this.m_transcendence,
      amplification: this.m_amplification,
    }
  }
  getHarmony() { return this.m_harmony }
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
  isSerene() { return this.m_serene }

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
