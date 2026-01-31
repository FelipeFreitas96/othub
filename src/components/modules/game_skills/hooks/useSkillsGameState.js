/**
 * Estado de jogo para o módulo Skills - reimaginado de skills.lua (LocalPlayer, g_game, refresh, online/offline).
 * Se options.game (de useGame()) for passado, usa g_game: isOnline e player vêm do contexto.
 * Caso contrário usa player mock interno.
 * Usa skillsService para getRowDisplay, enrichPlayerForDisplay, buildPlayerFromMock.
 */
import { useState, useCallback, useRef, useEffect } from 'react'
import { SkillsService } from '../service/skillsService'

/** Player mock padrão quando não há g_game (fallback) */
const DEFAULT_PLAYER = {
  level: 8,
  baseLevel: 8,
  experience: 4200,
  expSpeed: 0,
  health: 155,
  maxHealth: 155,
  mana: 60,
  maxMana: 60,
  soul: 100,
  freeCapacity: 1000,
  totalCapacity: 1000,
  speed: 110,
  baseSpeed: 110,
  stamina: 42 * 60,
  offlineTrainingTime: 0,
  regenerationTime: 0,
  magicLevel: 1,
  magicLevelPercent: 10,
  baseMagicLevel: 1,
  isPremium: false,
  skills: {
    0: { level: 10, percent: 0 },
    1: { level: 10, percent: 0 },
    2: { level: 10, percent: 0 },
    3: { level: 10, percent: 0 },
    4: { level: 10, percent: 0 },
    5: { level: 10, percent: 0 },
    6: { level: 10, percent: 0 },
    7: 0,
    8: 0,
    9: 0,
    10: 0,
    11: 0,
    12: 0,
    13: 0,
    14: 0,
    15: 0,
    16: 0,
  },
  offence: {},
  defence: {},
  misc: {},
}

/** Cache para stats quando UI está oculta (como statsCache no Lua) */
const initialStatsCache = () => ({
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

/**
 * Hook: estado do jogo para Skills (online/offline, player, refresh, ExpRating, statsCache).
 * Se options.game (de useGame()) for passado, usa g_game: isOnline e player vêm do contexto.
 * Caso contrário usa estado interno (mock).
 */
export function useSkillsGameState(options = {}) {
  const { initialOnline = true, mockPlayer = DEFAULT_PLAYER, game = null } = options
  const useGGame = !!game

  const [internalOnline, setInternalOnline] = useState(initialOnline)
  const [internalPlayer, setInternalPlayer] = useState(() => (initialOnline ? SkillsService.buildPlayerFromMock(mockPlayer) : null))
  const [expRating, setExpRating] = useState(() => ({
    [SkillsService.ExperienceRate.BASE]: 100,
    [SkillsService.ExperienceRate.VOUCHER]: 0,
    [SkillsService.ExperienceRate.XP_BOOST]: 0,
    [SkillsService.ExperienceRate.STAMINA_MULTIPLIER]: 100,
    [SkillsService.ExperienceRate.LOW_LEVEL]: 0,
  }))
  const statsCacheRef = useRef(initialStatsCache())
  const expSpeedIntervalRef = useRef(null)

  const isOnline = useGGame ? game.isOnline : internalOnline
  const rawPlayer = useGGame ? game.player : internalPlayer
  const player = useGGame && rawPlayer ? SkillsService.enrichPlayerForDisplay(rawPlayer, expRating) : rawPlayer

  const refresh = useCallback(() => {
    if (useGGame) return
    setInternalPlayer((prev) => {
      if (!prev) return SkillsService.buildPlayerFromMock(mockPlayer)
      const level = prev.level ?? 8
      const exp = prev.experience ?? SkillsService.expForLevel(level)
      const nextExp = SkillsService.expForLevel(level + 1)
      const levelPercent = Math.min(100, Math.max(0, Math.floor(100 * (exp - SkillsService.expForLevel(level)) / Math.max(1, nextExp - SkillsService.expForLevel(level)))))
      const next = { ...prev, experience: exp, levelPercent }
      next.expRateTotal = SkillsService.getTotalExpRateMultiplier(expRating)
      next.expRateColor = next.expRateTotal > 100 ? '#00cc00' : next.expRateTotal < 100 ? '#ff9429' : '#ffffff'
      return next
    })
  }, [expRating, mockPlayer, useGGame])

  const online = useCallback(() => {
    if (useGGame) return
    setInternalOnline(true)
    setInternalPlayer(SkillsService.buildPlayerFromMock(mockPlayer))
    if (expSpeedIntervalRef.current) clearInterval(expSpeedIntervalRef.current)
    expSpeedIntervalRef.current = setInterval(() => {
      setInternalPlayer((p) => {
        if (!p || p.expSpeed == null) return p
        const next = { ...p, experience: (p.experience ?? 0) + p.expSpeed * 30 }
        next.levelPercent = Math.min(100, Math.floor(100 * (next.experience - SkillsService.expForLevel(next.level)) / Math.max(1, SkillsService.expForLevel(next.level + 1) - SkillsService.expForLevel(next.level))))
        return next
      })
    }, 30 * 1000)
  }, [mockPlayer, useGGame])

  const offline = useCallback(() => {
    if (useGGame) return
    setInternalOnline(false)
    setInternalPlayer(null)
    if (expSpeedIntervalRef.current) {
      clearInterval(expSpeedIntervalRef.current)
      expSpeedIntervalRef.current = null
    }
    statsCacheRef.current = initialStatsCache()
  }, [useGGame])

  useEffect(() => {
    return () => {
      if (expSpeedIntervalRef.current) clearInterval(expSpeedIntervalRef.current)
    }
  }, [])

  const setExpRatingByType = useCallback((type, value) => {
    setExpRating((prev) => ({ ...prev, [type]: value }))
  }, [])

  const getRowDisplayFor = useCallback(
    (rowId) => SkillsService.getRowDisplay(rowId, player, isOnline),
    [player, isOnline]
  )

  return {
    isOnline,
    player,
    refresh,
    online,
    offline,
    expRating,
    setExpRatingByType,
    statsCache: statsCacheRef.current,
    getRowDisplayFor,
  }
}
