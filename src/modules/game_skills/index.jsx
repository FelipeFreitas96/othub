import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import MiniWindow from '../../components/MiniWindow'
import SkillRow from './ui/SkillRow'
import ContextMenu, { ContextMenuItem, ContextMenuSeparator } from '../../components/ContextMenu'
import { g_game } from '../../services/client/Game'
import { g_player } from '../../services/client/LocalPlayer'
import { isFeatureEnabled } from '../../services/protocol/features'
import { useGameTextMessage } from '../game_textmessage'

const WINDOW_CONFIG = {
  title: 'Skills',
  icon: '/images/topbuttons/skills.png',
}

const STORAGE_KEY = 'skills-hide'
const HOTKEY = 's'

const ExperienceRate = {
  BASE: 0,
  VOUCHER: 1,
  LOW_LEVEL: 2,
  XP_BOOST: 3,
  STAMINA_MULTIPLIER: 4,
}

const Skill = {
  Fist: 0,
  Club: 1,
  Sword: 2,
  Axe: 3,
  Distance: 4,
  Shielding: 5,
  Fishing: 6,
  ManaLeechAmount: 12,
  Transcendence: 16,
}

const combatIcons = {
  0: '/images/icons/icon_fist.png',
  1: '/images/icons/icon_fire.png',
  2: '/images/icons/icon_earth.png',
  3: '/images/icons/icon_energy.png',
  4: '/images/icons/icon_ice.png',
  5: '/images/icons/icon_holy.png',
  6: '/images/icons/icon_death.png',
  7: '/images/icons/icon_healing.png',
  8: '/images/icons/icon_drown.png',
  9: '/images/icons/icon_lifedrain.png',
  10: '/images/icons/icon_manadrain.png',
}

const INDIVIDUAL_BARS = ['level', 'stamina', 'offlineTraining', 'magiclevel', 'skillId0', 'skillId1', 'skillId2', 'skillId3', 'skillId4', 'skillId5', 'skillId6']

const GROUPS = {
  offence: ['damageHealing', 'attackValue', 'convertedDamage', 'convertedElement', 'lifeLeech', 'manaLeech', 'criticalChance', 'criticalExtraDamage', 'onslaught'],
  defence: ['physicalResist', 'fireResist', 'earthResist', 'energyResist', 'IceResist', 'HolyResist', 'deathResist', 'HealingResist', 'drowResist', 'lifedrainResist', 'manadRainResist', 'defenceValue', 'armorValue', 'mitigation', 'dodge', 'damageReflection'],
  misc: ['momentum', 'transcendence', 'amplification'],
}

const ROWS = [
  { id: 'level', label: 'Level', bar: 'red', h: 21, mt: 5, mb: 2 },
  { id: 'experience', label: 'Experience', h: 15, mb: 2 },
  { id: 'xpGainRate', label: 'XP Gain Rate', h: 15, mb: 2 },
  { id: 'xpBoostButton', label: '', xpButton: true, h: 30 },
  { id: 'health', label: 'Hit Points', h: 15, mt: -12, mb: 2 },
  { id: 'mana', label: 'Mana', h: 15, mb: 2 },
  { id: 'soul', label: 'Soul Points', h: 15, mb: 2 },
  { id: 'capacity', label: 'Capacity', h: 15, mb: 2 },
  { id: 'speed', label: 'Speed', h: 15, mb: 2 },
  { id: 'regenerationTime', label: 'Regeneration Time', h: 15, mb: 2 },
  { id: 'stamina', label: 'Stamina', bar: 'red', h: 21, mb: 2 },
  { id: 'offlineTraining', label: 'Offline Training', bar: 'red', h: 21, mb: 2 },
  { id: 'sep1', separator: true },
  { id: 'magiclevel', label: 'Magic Level', bar: 'red', h: 21, mb: 2, icon: '/images/icons/icon_magic.png' },
  { id: 'skillId0', label: 'Fist Fighting', bar: 'green', h: 21, mb: 2, icon: '/images/icons/icon_fist.png' },
  { id: 'skillId1', label: 'Club Fighting', bar: 'green', h: 21, mb: 2, icon: '/images/icons/icon_club.png' },
  { id: 'skillId2', label: 'Sword Fighting', bar: 'green', h: 21, mb: 2, icon: '/images/icons/icon_sword.png' },
  { id: 'skillId3', label: 'Axe Fighting', bar: 'green', h: 21, mb: 2, icon: '/images/icons/icon_axe.png' },
  { id: 'skillId4', label: 'Distance Fighting', bar: 'green', h: 21, mb: 2, icon: '/images/icons/icon_distance.png' },
  { id: 'skillId5', label: 'Shielding', bar: 'green', h: 21, mb: 2, icon: '/images/icons/icon_shielding.png' },
  { id: 'skillId6', label: 'Fishing', bar: 'green', h: 21, mb: 5, icon: '/images/icons/icon_fishing.png' },
  { id: 'sepOffence', separator: true },
  { id: 'skillId7', label: 'Critical Hit Chance', h: 14, small: true },
  { id: 'skillId8', label: 'Critical Hit Damage', h: 14, small: true },
  { id: 'skillId9', label: 'Life Leech Chance', h: 14, small: true },
  { id: 'skillId10', label: 'Life Leech Amount', h: 14, small: true },
  { id: 'skillId11', label: 'Mana Leech Chance', h: 14, small: true },
  { id: 'skillId12', label: 'Mana Leech Amount', h: 14, small: true },
  { id: 'skillId13', label: 'Fatal', h: 14, small: true },
  { id: 'skillId14', label: 'Dodge', h: 14, small: true },
  { id: 'skillId15', label: 'Momentum', h: 14, small: true },
  { id: 'skillId16', label: 'Transcendence', h: 14, small: true },
  { id: 'damageHealing', label: 'Damage/Healing', h: 14, small: true, advanced: 'offence' },
  { id: 'attackValue', label: 'Attack Value', h: 14, small: true, advanced: 'offence' },
  { id: 'convertedDamage', label: 'Converted Damage', h: 14, small: true, advanced: 'offence' },
  { id: 'convertedElement', label: 'Converted Element', h: 14, small: true, advanced: 'offence' },
  { id: 'lifeLeech', label: 'Life Leech', h: 14, small: true, advanced: 'offence' },
  { id: 'manaLeech', label: 'Mana Leech', h: 14, small: true, advanced: 'offence' },
  { id: 'criticalChance', label: 'Chance', h: 14, small: true, advanced: 'offence' },
  { id: 'criticalExtraDamage', label: 'Extra Damage', h: 14, small: true, advanced: 'offence' },
  { id: 'onslaught', label: 'Onslaught', h: 14, small: true, advanced: 'offence' },
  { id: 'sepDefense', separator: true, advanced: 'defence' },
  { id: 'physicalResist', label: 'Physical', h: 14, small: true, advanced: 'defence' },
  { id: 'fireResist', label: 'Fire', h: 14, small: true, advanced: 'defence' },
  { id: 'earthResist', label: 'Earth', h: 14, small: true, advanced: 'defence' },
  { id: 'energyResist', label: 'Energy', h: 14, small: true, advanced: 'defence' },
  { id: 'IceResist', label: 'Ice', h: 14, small: true, advanced: 'defence' },
  { id: 'HolyResist', label: 'Holy', h: 14, small: true, advanced: 'defence' },
  { id: 'deathResist', label: 'Death', h: 14, small: true, advanced: 'defence' },
  { id: 'HealingResist', label: 'Healing', h: 14, small: true, advanced: 'defence' },
  { id: 'drowResist', label: 'Drown', h: 14, small: true, advanced: 'defence' },
  { id: 'lifedrainResist', label: 'Lifedrain', h: 14, small: true, advanced: 'defence' },
  { id: 'manadRainResist', label: 'Manadrain', h: 14, small: true, advanced: 'defence' },
  { id: 'defenceValue', label: 'Defence Value', h: 14, small: true, advanced: 'defence' },
  { id: 'armorValue', label: 'Armor Value', h: 14, small: true, advanced: 'defence' },
  { id: 'mitigation', label: 'Mitigation', h: 14, small: true, advanced: 'defence' },
  { id: 'dodge', label: 'Dodge', h: 14, small: true, advanced: 'defence' },
  { id: 'damageReflection', label: 'Damage Reflection', h: 14, small: true, advanced: 'defence' },
  { id: 'sepMisc', separator: true, advanced: 'misc' },
  { id: 'momentum', label: 'Momentum', h: 14, small: true, advanced: 'misc' },
  { id: 'transcendence', label: 'Transcendence', h: 14, small: true, advanced: 'misc' },
  { id: 'amplification', label: 'Amplification', h: 14, small: true, advanced: 'misc' },
]

function loadAllSettings() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}')
  } catch {
    return {}
  }
}

function saveAllSettings(value) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(value))
}

function commaValue(n) {
  return String(Math.floor(Number(n) || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, ',')
}

function formatTime(minutes) {
  const h = Math.floor(minutes / 60)
  const m = Math.floor(minutes % 60)
  return `${h}:${m < 10 ? '0' : ''}${m}`
}

function getSkillSettings(charName) {
  const all = loadAllSettings()
  if (!all[charName]) all[charName] = {}
  return { all, settings: all[charName] }
}

export default function Skills(props) {
  const { displayGameMessage } = useGameTextMessage()
  const [menuPos, setMenuPos] = useState(null)
  const [refreshTick, setRefreshTick] = useState(0)
  const [expRating, setExpRating] = useState({ [ExperienceRate.BASE]: 100 })
  const [expSpeed, setExpSpeed] = useState(0)
  const [statsCache, setStatsCache] = useState({
    flatDamageHealing: 0,
    attackValue: 0,
    attackElement: 0,
    convertedDamage: 0,
    convertedElement: 0,
    lifeLeech: 0,
    manaLeech: 0,
    critChance: 0,
    critDamage: 0,
    onslaught: 0,
    defense: 0,
    armor: 0,
    mitigation: 0,
    dodge: 0,
    damageReflection: 0,
    combatAbsorbValues: {},
    momentum: 0,
    transcendence: 0,
    amplification: 0,
  })
  const expHistoryRef = useRef([])

  const charName = g_game.getCharacterName?.() || 'default'
  const { all, settings } = useMemo(() => getSkillSettings(charName), [charName, refreshTick])

  const forceRefresh = useCallback(() => setRefreshTick((v) => v + 1), [])

  const setSetting = useCallback((key, value) => {
    const obj = loadAllSettings()
    if (!obj[charName]) obj[charName] = {}
    obj[charName][key] = value
    saveAllSettings(obj)
    forceRefresh()
  }, [charName, forceRefresh])

  const showPercentBar = useCallback((skillId) => settings[skillId] !== 1, [settings])

  const areStatsVisible = useCallback((groupName) => {
    if ((g_game.getClientVersion?.() ?? 860) < 1412 && groupName !== 'individual') return false
    const key = `${groupName}Stats_visible`
    return settings[key] !== false
  }, [settings])

  const toggleGroupVisibility = useCallback((groupName) => {
    const current = areStatsVisible(groupName)
    setSetting(`${groupName}Stats_visible`, !current)
  }, [areStatsVisible, setSetting])

  const areAllSkillBarsVisible = useCallback(() => INDIVIDUAL_BARS.every((id) => showPercentBar(id)), [showPercentBar])

  const toggleAllSkillBars = useCallback(() => {
    const shouldShow = !areAllSkillBarsVisible()
    const obj = loadAllSettings()
    if (!obj[charName]) obj[charName] = {}
    for (const id of INDIVIDUAL_BARS) obj[charName][id] = shouldShow ? 0 : 1
    saveAllSettings(obj)
    forceRefresh()
  }, [areAllSkillBarsVisible, charName, forceRefresh])

  const toggleSkillProgressBar = useCallback((skillId) => {
    setSetting(skillId, showPercentBar(skillId) ? 1 : 0)
  }, [setSetting, showPercentBar])

  const getRowData = useCallback((rowId) => {
    const player = g_player
    if (!g_game.isOnline?.()) {
      return { value: rowId === 'offlineTraining' ? '--' : '0', percent: 0, color: '#C0C0C0' }
    }

    switch (rowId) {
      case 'level': return { value: commaValue(player.getLevel?.() ?? 0), percent: player.getLevelPercent?.() ?? 0 }
      case 'experience': return { value: commaValue(player.getExperience?.() ?? 0), tooltip: expSpeed > 0 ? `${commaValue(Math.floor(expSpeed * 3600))} of experience per hour` : null }
      case 'xpGainRate': {
        let total = expRating[ExperienceRate.BASE] ?? 100
        total += expRating[ExperienceRate.VOUCHER] ?? 0
        total += expRating[ExperienceRate.LOW_LEVEL] ?? 0
        total += expRating[ExperienceRate.XP_BOOST] ?? 0
        total = total * ((expRating[ExperienceRate.STAMINA_MULTIPLIER] ?? 100) / 100)
        const color = total === 0 ? '#ff4a4a' : total > 100 ? '#00cc00' : total < 100 ? '#ff9429' : '#ffffff'
        return { value: `${Math.floor(total)}%`, color }
      }
      case 'health': return { value: commaValue(player.getHealth?.() ?? 0), color: (player.getHealth?.() ?? 0) * 100 / Math.max(1, player.getMaxHealth?.() ?? 1) < 30 ? '#b22222' : '#C0C0C0' }
      case 'mana': return { value: commaValue(player.getMana?.() ?? 0), color: (player.getMana?.() ?? 0) * 100 / Math.max(1, player.getMaxMana?.() ?? 1) < 30 ? '#b22222' : '#C0C0C0' }
      case 'soul': return { value: `${player.getSoul?.() ?? 0}` }
      case 'capacity': {
        const free = player.getFreeCapacity?.() ?? 0
        const total = player.getTotalCapacity?.() ?? 1
        return { value: commaValue(free), color: free * 100 / Math.max(1, total) < 20 ? '#b22222' : '#C0C0C0' }
      }
      case 'speed': return { value: commaValue(player.getSpeed?.() ?? 0) }
      case 'regenerationTime': {
        const v = player.getRegenerationTime?.() ?? -1
        if (v < 0) return { value: '--' }
        return { value: formatTime(Math.floor(v / 60)), color: v < 300 ? '#b22222' : '#C0C0C0' }
      }
      case 'stamina': {
        const stamina = player.getStamina?.() ?? 0
        const percent = Math.floor(100 * stamina / (42 * 60))
        let color = '#C0C0C0'
        if (stamina > 2400) color = player.isPremium?.() ? '#008b00' : '#89F013'
        else if (stamina <= 840 && stamina > 0) color = '#b22222'
        else if (stamina === 0) color = '#000000'
        return { value: formatTime(stamina), percent, color }
      }
      case 'offlineTraining': {
        const v = player.getOfflineTrainingTime?.() ?? 0
        return { value: v > 0 ? formatTime(v) : '--', percent: (100 * v) / (12 * 60) }
      }
      case 'magiclevel': return { value: `${player.getMagicLevel?.() ?? 0}`, percent: player.getMagicLevelPercent?.() ?? 0 }
      case 'damageHealing': return { value: `${statsCache.flatDamageHealing}` }
      case 'attackValue': return { value: `${statsCache.attackValue}`, icon: combatIcons[statsCache.attackElement] }
      case 'convertedDamage': return { value: `${(statsCache.convertedDamage * 100).toFixed(2)}%` }
      case 'convertedElement': return { value: `${(statsCache.convertedElement * 100).toFixed(2)}%` }
      case 'lifeLeech': return { value: `${(statsCache.lifeLeech * 100).toFixed(2)}%` }
      case 'manaLeech': return { value: `${(statsCache.manaLeech * 100).toFixed(2)}%` }
      case 'criticalChance': return { value: `${(statsCache.critChance * 100).toFixed(2)}%` }
      case 'criticalExtraDamage': return { value: `${(statsCache.critDamage * 100).toFixed(2)}%` }
      case 'onslaught': return { value: `${(statsCache.onslaught * 100).toFixed(2)}%` }
      case 'defenceValue': return { value: `${statsCache.defense}` }
      case 'armorValue': return { value: `${statsCache.armor}` }
      case 'mitigation': return { value: `${(statsCache.mitigation * 100).toFixed(2)}%` }
      case 'dodge': return { value: `${(statsCache.dodge * 100).toFixed(2)}%` }
      case 'damageReflection': return { value: `${(statsCache.damageReflection * 100).toFixed(2)}%` }
      case 'momentum': return { value: `${(statsCache.momentum * 100).toFixed(2)}%` }
      case 'transcendence': return { value: `${(statsCache.transcendence * 100).toFixed(2)}%` }
      case 'amplification': return { value: `${(statsCache.amplification * 100).toFixed(2)}%` }
      default: {
        if (rowId.startsWith('skillId')) {
          const id = Number(rowId.replace('skillId', ''))
          if (id <= Skill.Fishing) {
            return {
              value: `${g_player.getSkillLevel?.(id) ?? 0}`,
              percent: g_player.getSkillLevelPercent?.(id) ?? 0,
            }
          }
          const raw = g_player.getSkillLevel?.(id) ?? 0
          const formatted = id === 8 ? `${raw > 0 ? '+' : ''}${raw}%` : `${raw}%`
          return { value: formatted, color: raw < 0 ? '#FF9854' : '#C0C0C0' }
        }
        if (rowId.endsWith('Resist')) {
          const map = {
            physicalResist: 0,
            fireResist: 1,
            earthResist: 2,
            energyResist: 3,
            IceResist: 4,
            HolyResist: 5,
            deathResist: 6,
            HealingResist: 7,
            drowResist: 8,
            lifedrainResist: 9,
            manadRainResist: 10,
          }
          const val = statsCache.combatAbsorbValues?.[map[rowId]] ?? 0
          return { value: `${(val * 100).toFixed(2)}%`, color: '#44AD25' }
        }
      }
    }
    return { value: '0' }
  }, [expRating, expSpeed, statsCache])

  useEffect(() => {
    const onGameStart = () => forceRefresh()
    const onGameEnd = () => {
      setStatsCache({
        flatDamageHealing: 0,
        attackValue: 0,
        attackElement: 0,
        convertedDamage: 0,
        convertedElement: 0,
        lifeLeech: 0,
        manaLeech: 0,
        critChance: 0,
        critDamage: 0,
        onslaught: 0,
        defense: 0,
        armor: 0,
        mitigation: 0,
        dodge: 0,
        damageReflection: 0,
        combatAbsorbValues: {},
        momentum: 0,
        transcendence: 0,
        amplification: 0,
      })
      forceRefresh()
    }

    const eventRefresh = () => forceRefresh()
    const onSkill = (e) => {
      const args = e?.detail?.args ?? []
      const id = Number(args[0])
      if (id > Skill.ManaLeechAmount) forceRefresh()
      else eventRefresh()
    }
    const onExpRate = (e) => {
      const args = e?.detail?.args ?? []
      const type = Number(args[0]); const value = Number(args[1])
      setExpRating((prev) => ({ ...prev, [type]: value }))
    }

    const onFlat = (e) => {
      const args = e?.detail?.args ?? []
      setStatsCache((prev) => ({ ...prev, flatDamageHealing: Number(args[0] ?? 0) }))
    }
    const onAttack = (e) => {
      const args = e?.detail?.args ?? []
      setStatsCache((prev) => ({ ...prev, attackValue: Number(args[0] ?? 0), attackElement: Number(args[1] ?? 0) }))
    }
    const onConverted = (e) => {
      const args = e?.detail?.args ?? []
      setStatsCache((prev) => ({ ...prev, convertedDamage: Number(args[0] ?? 0), convertedElement: Number(args[1] ?? 0) }))
    }
    const onImbuements = (e) => {
      const args = e?.detail?.args ?? []
      setStatsCache((prev) => ({ ...prev, lifeLeech: Number(args[0] ?? 0), manaLeech: Number(args[1] ?? 0), critChance: Number(args[2] ?? 0), critDamage: Number(args[3] ?? 0), onslaught: Number(args[4] ?? 0) }))
    }
    const onDefense = (e) => {
      const args = e?.detail?.args ?? []
      setStatsCache((prev) => ({ ...prev, defense: Number(args[0] ?? 0), armor: Number(args[1] ?? 0), mitigation: Number(args[2] ?? 0), dodge: Number(args[3] ?? 0), damageReflection: Number(args[4] ?? 0) }))
    }
    const onAbsorb = (e) => {
      const args = e?.detail?.args ?? []
      setStatsCache((prev) => ({ ...prev, combatAbsorbValues: args[0] ?? {} }))
    }
    const onForge = (e) => {
      const args = e?.detail?.args ?? []
      setStatsCache((prev) => ({ ...prev, momentum: Number(args[0] ?? 0), transcendence: Number(args[1] ?? 0), amplification: Number(args[2] ?? 0) }))
    }

    window.addEventListener('g_game:onGameStart', onGameStart)
    window.addEventListener('g_game:onGameEnd', onGameEnd)
    window.addEventListener('localPlayer:onExperienceChange', eventRefresh)
    window.addEventListener('localPlayer:onLevelChange', eventRefresh)
    window.addEventListener('localPlayer:onHealthChange', eventRefresh)
    window.addEventListener('localPlayer:onManaChange', eventRefresh)
    window.addEventListener('localPlayer:onSoulChange', eventRefresh)
    window.addEventListener('localPlayer:onFreeCapacityChange', eventRefresh)
    window.addEventListener('localPlayer:onTotalCapacityChange', eventRefresh)
    window.addEventListener('localPlayer:onStaminaChange', eventRefresh)
    window.addEventListener('localPlayer:onOfflineTrainingChange', eventRefresh)
    window.addEventListener('localPlayer:onRegenerationChange', eventRefresh)
    window.addEventListener('localPlayer:onSpeedChange', eventRefresh)
    window.addEventListener('localPlayer:onBaseSpeedChange', eventRefresh)
    window.addEventListener('localPlayer:onMagicLevelChange', eventRefresh)
    window.addEventListener('localPlayer:onBaseMagicLevelChange', eventRefresh)
    window.addEventListener('localPlayer:onSkillChange', onSkill)
    window.addEventListener('localPlayer:onExperienceRateChange', onExpRate)
    window.addEventListener('localPlayer:onFlatDamageHealingChange', onFlat)
    window.addEventListener('localPlayer:onAttackInfoChange', onAttack)
    window.addEventListener('localPlayer:onConvertedDamageChange', onConverted)
    window.addEventListener('localPlayer:onImbuementsChange', onImbuements)
    window.addEventListener('localPlayer:onDefenseInfoChange', onDefense)
    window.addEventListener('localPlayer:onCombatAbsorbValuesChange', onAbsorb)
    window.addEventListener('localPlayer:onForgeBonusesChange', onForge)

    return () => {
      window.removeEventListener('g_game:onGameStart', onGameStart)
      window.removeEventListener('g_game:onGameEnd', onGameEnd)
      window.removeEventListener('localPlayer:onExperienceChange', eventRefresh)
      window.removeEventListener('localPlayer:onLevelChange', eventRefresh)
      window.removeEventListener('localPlayer:onHealthChange', eventRefresh)
      window.removeEventListener('localPlayer:onManaChange', eventRefresh)
      window.removeEventListener('localPlayer:onSoulChange', eventRefresh)
      window.removeEventListener('localPlayer:onFreeCapacityChange', eventRefresh)
      window.removeEventListener('localPlayer:onTotalCapacityChange', eventRefresh)
      window.removeEventListener('localPlayer:onStaminaChange', eventRefresh)
      window.removeEventListener('localPlayer:onOfflineTrainingChange', eventRefresh)
      window.removeEventListener('localPlayer:onRegenerationChange', eventRefresh)
      window.removeEventListener('localPlayer:onSpeedChange', eventRefresh)
      window.removeEventListener('localPlayer:onBaseSpeedChange', eventRefresh)
      window.removeEventListener('localPlayer:onMagicLevelChange', eventRefresh)
      window.removeEventListener('localPlayer:onBaseMagicLevelChange', eventRefresh)
      window.removeEventListener('localPlayer:onSkillChange', onSkill)
      window.removeEventListener('localPlayer:onExperienceRateChange', onExpRate)
      window.removeEventListener('localPlayer:onFlatDamageHealingChange', onFlat)
      window.removeEventListener('localPlayer:onAttackInfoChange', onAttack)
      window.removeEventListener('localPlayer:onConvertedDamageChange', onConverted)
      window.removeEventListener('localPlayer:onImbuementsChange', onImbuements)
      window.removeEventListener('localPlayer:onDefenseInfoChange', onDefense)
      window.removeEventListener('localPlayer:onCombatAbsorbValuesChange', onAbsorb)
      window.removeEventListener('localPlayer:onForgeBonusesChange', onForge)
    }
  }, [forceRefresh])

  useEffect(() => {
    const timer = setInterval(() => {
      if (!g_game.isOnline?.()) return
      const currentExp = g_player.getExperience?.() ?? 0
      const now = Date.now() / 1000
      const history = expHistoryRef.current
      history.push([currentExp, now])
      if (history.length > 30) history.shift()
      if (history.length >= 2) {
        const [oldExp, oldTime] = history[0]
        const gained = currentExp - oldExp
        const elapsed = now - oldTime
        setExpSpeed(elapsed > 0 ? gained / elapsed : 0)
      }
    }, 30000)
    return () => clearInterval(timer)
  }, [])

  useEffect(() => {
    const onKeyDown = (e) => {
      if (!e.altKey || e.key.toLowerCase() !== HOTKEY) return
      e.preventDefault()
      if (props?.onOpenChange && props?.id) props.onOpenChange(props.id, !props.open)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [props])

  const onResetExperienceCounter = useCallback(() => {
    displayGameMessage('Experience counter has been reset.')
    setMenuPos(null)
  }, [displayGameMessage])

  const onMenuAction = useCallback((actionId) => {
    const map = {
      showLevel: 'level', showStamina: 'stamina', showOfflineTraining: 'offlineTraining', showMagic: 'magiclevel',
      showFist: 'skillId0', showClub: 'skillId1', showSword: 'skillId2', showAxe: 'skillId3', showDistance: 'skillId4', showShielding: 'skillId5', showFishing: 'skillId6',
    }
    if (actionId === 'showOffenceStats') toggleGroupVisibility('offence')
    else if (actionId === 'showDefenceStats') toggleGroupVisibility('defence')
    else if (actionId === 'showMiscStats') toggleGroupVisibility('misc')
    else if (actionId === 'showAllSkillBars') toggleAllSkillBars()
    else if (map[actionId]) toggleSkillProgressBar(map[actionId])
    setMenuPos(null)
  }, [toggleAllSkillBars, toggleGroupVisibility, toggleSkillProgressBar])

  const isVisibleRow = useCallback((row) => {
    if (row.id === 'offlineTraining' && !isFeatureEnabled('GameOfflineTrainingTime')) return false
    if (row.id === 'xpBoostButton' || row.id === 'xpGainRate') {
      return isFeatureEnabled('GameExperienceBonus')
    }
    if (row.advanced === 'offence') return areStatsVisible('offence')
    if (row.advanced === 'defence') return areStatsVisible('defence')
    if (row.advanced === 'misc') return areStatsVisible('misc')
    if (row.id?.startsWith('skillId')) {
      const idx = Number(row.id.replace('skillId', ''))
      if ((g_game.getClientVersion?.() ?? 860) < 1410 && idx >= 7) return false
    }
    return true
  }, [areStatsVisible])

  const menuChecks = {
    showLevel: showPercentBar('level'),
    showStamina: showPercentBar('stamina'),
    showOfflineTraining: showPercentBar('offlineTraining'),
    showMagic: showPercentBar('magiclevel'),
    showFist: showPercentBar('skillId0'),
    showClub: showPercentBar('skillId1'),
    showSword: showPercentBar('skillId2'),
    showAxe: showPercentBar('skillId3'),
    showDistance: showPercentBar('skillId4'),
    showShielding: showPercentBar('skillId5'),
    showFishing: showPercentBar('skillId6'),
    showOffenceStats: areStatsVisible('offence'),
    showDefenceStats: areStatsVisible('defence'),
    showMiscStats: areStatsVisible('misc'),
    showAllSkillBars: areAllSkillBarsVisible(),
  }

  return (
    <>
      <MiniWindow {...props} title={WINDOW_CONFIG.title} icon={WINDOW_CONFIG.icon}>
        <div className="flex flex-col min-h-0 py-0" style={{ paddingLeft: 5, paddingRight: 5 }} onContextMenu={(e) => { e.preventDefault(); setMenuPos({ x: e.clientX, y: e.clientY }) }}>
          {ROWS.map((row) => {
            if (!isVisibleRow(row)) return null
            if (row.separator) return <div key={row.id} className="border-t border-ot-border my-1 mx-1" />
            if (row.xpButton) {
              return <div key={row.id} className="h-[30px] flex items-center justify-center"><img src="/images/ui/button-storexp.png" alt="XP" className="h-[22px]" /></div>
            }
            const data = getRowData(row.id)
            const showBar = row.bar ? showPercentBar(row.id) : false
            return (
              <SkillRow
                key={row.id}
                label={row.label}
                value={data.value ?? '0'}
                bar={row.bar}
                icon={data.icon ?? row.icon}
                percent={data.percent ?? 0}
                rowHeight={row.h}
                marginBottom={row.mb ?? 2}
                marginTop={row.mt ?? 0}
                showBar={showBar}
                valueColor={data.color}
                title={data.tooltip}
              />
            )
          })}
          <div className="flex-shrink-0 mt-1 mx-0.5 mb-0.5 w-3.5 h-3.5 bg-no-repeat bg-center" style={{ backgroundImage: "url('/images/ui/miniborder.png')", backgroundSize: '14px 14px' }} />
        </div>
      </MiniWindow>

      <ContextMenu open={menuPos} onClose={() => setMenuPos(null)}>
        <ContextMenuItem onClick={onResetExperienceCounter}>Reset Experience Counter</ContextMenuItem>
        <ContextMenuSeparator />
        {[
          ['showLevel', 'Level'], ['showStamina', 'Stamina'], ['showOfflineTraining', 'Offline Training'], ['showMagic', 'Magic'],
          ['showFist', 'Fist'], ['showClub', 'Club'], ['showSword', 'Sword'], ['showAxe', 'Axe'], ['showDistance', 'Distance'], ['showShielding', 'Shielding'], ['showFishing', 'Fishing'],
        ].map(([id, label]) => (
          <ContextMenuItem key={id} checkbox checked={menuChecks[id]} onClick={() => onMenuAction(id)}>{label}</ContextMenuItem>
        ))}
        {(g_game.getClientVersion?.() ?? 860) >= 1412 && (
          <>
            <ContextMenuSeparator />
            <ContextMenuItem checkbox checked={menuChecks.showOffenceStats} onClick={() => onMenuAction('showOffenceStats')}>Offence Stats</ContextMenuItem>
            <ContextMenuItem checkbox checked={menuChecks.showDefenceStats} onClick={() => onMenuAction('showDefenceStats')}>Defence Stats</ContextMenuItem>
            <ContextMenuItem checkbox checked={menuChecks.showMiscStats} onClick={() => onMenuAction('showMiscStats')}>Misc. Stats</ContextMenuItem>
          </>
        )}
        <ContextMenuSeparator />
        <ContextMenuItem checkbox checked={menuChecks.showAllSkillBars} onClick={() => onMenuAction('showAllSkillBars')}>Show all Skill Bars</ContextMenuItem>
      </ContextMenu>
    </>
  )
}
