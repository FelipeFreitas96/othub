/**
 * SkillsService - classe com constantes e lógica do módulo Skills (OTClient).
 * Constantes estáticas + métodos estáticos para cálculos, formatação e exibição por row.
 */
export class SkillsService {
  // --- Constantes estáticas (antes em skillsLogic) ---

  static SKILL_ICONS = {
    iconMagic: '/images/icons/icon_magic.png',
    iconFist: '/images/icons/icon_fist.png',
    iconClub: '/images/icons/icon_club.png',
    iconSword: '/images/icons/icon_sword.png',
    iconAxe: '/images/icons/icon_axe.png',
    iconDistance: '/images/icons/icon_distance.png',
    iconShielding: '/images/icons/icon_shielding.png',
    iconFishing: '/images/icons/icon_fishing.png',
  }

  static BAR_OPTIONS = [
    { id: 'level', key: 'showLevel' },
    { id: 'stamina', key: 'showStamina' },
    { id: 'offlineTraining', key: 'showOfflineTraining' },
    { id: 'magiclevel', key: 'showMagic' },
    { id: 'skillId0', key: 'showFist' },
    { id: 'skillId1', key: 'showClub' },
    { id: 'skillId2', key: 'showSword' },
    { id: 'skillId3', key: 'showAxe' },
    { id: 'skillId4', key: 'showDistance' },
    { id: 'skillId5', key: 'showShielding' },
    { id: 'skillId6', key: 'showFishing' },
  ]

  static ROW_ID_TO_KEY = Object.fromEntries(SkillsService.BAR_OPTIONS.map((o) => [o.id, o.key]))

  static MENU_KEYS = [
    'showLevel', 'showStamina', 'showOfflineTraining', 'showMagic',
    'showFist', 'showClub', 'showSword', 'showAxe', 'showDistance', 'showShielding', 'showFishing',
    'showOffenceStats', 'showDefenceStats', 'showMiscStats', 'showAllSkillBars',
  ]

  static DEFAULT_VISIBILITY = Object.fromEntries([
    ['showAllSkillBars', true],
    ['showOffenceStats', false],
    ['showDefenceStats', false],
    ['showMiscStats', false],
    ...SkillsService.BAR_OPTIONS.map((o) => [o.key, true]),
  ])

  static STORAGE_KEY = 'otclient-skills-bar-visibility'

  static MENU_LABELS = {
    showLevel: 'Level',
    showStamina: 'Stamina',
    showOfflineTraining: 'Offline Training',
    showMagic: 'Magic',
    showFist: 'Fist',
    showClub: 'Club',
    showSword: 'Sword',
    showAxe: 'Axe',
    showDistance: 'Distance',
    showShielding: 'Shielding',
    showFishing: 'Fishing',
    showOffenceStats: 'Offence Stats',
    showDefenceStats: 'Defence Stats',
    showMiscStats: 'Misc. Stats',
    showAllSkillBars: 'Show all Skill Bars',
  }

  static ROWS = [
    { id: 'level', label: 'Level', value: '8', bar: 'red', rowHeight: 21, marginTop: 5, marginBottom: 2 },
    { id: 'experience', label: 'Experience', value: '0 / 4200', rowHeight: 15, marginBottom: 2 },
    { id: 'xpGainRate', label: 'XP Gain Rate', value: '0%', rowHeight: 15, marginBottom: 2 },
    { id: 'xpBoostButton', label: '', value: '', rowHeight: 30, marginBottom: 0, isXpBoost: true },
    { id: 'health', label: 'Hit Points', value: '155 / 155', rowHeight: 15, marginTop: -12, marginBottom: 2 },
    { id: 'mana', label: 'Mana', value: '60 / 60', rowHeight: 15, marginBottom: 2 },
    { id: 'soul', label: 'Soul Points', value: '100', rowHeight: 15, marginBottom: 2 },
    { id: 'capacity', label: 'Capacity', value: '1000 / 1000', rowHeight: 15, marginBottom: 2 },
    { id: 'speed', label: 'Speed', value: '110', rowHeight: 15, marginBottom: 2 },
    { id: 'regenerationTime', label: 'Regeneration Time', value: '--', rowHeight: 15, marginBottom: 2 },
    { id: 'stamina', label: 'Stamina', value: '42:00', bar: 'red', rowHeight: 21, marginBottom: 2 },
    { id: 'offlineTraining', label: 'Offline Training', value: '--', bar: 'red', rowHeight: 21, marginBottom: 2 },
    { id: 'separator1', separator: true, marginTop: 5, marginBottom: 5 },
    { id: 'magiclevel', label: 'Magic Level', value: '1', bar: 'red', icon: SkillsService.SKILL_ICONS.iconMagic, percent: 10, rowHeight: 21, marginBottom: 2 },
    { id: 'skillId0', label: 'Fist Fighting', value: '10', bar: 'green', icon: SkillsService.SKILL_ICONS.iconFist, percent: 0, rowHeight: 21, marginBottom: 2 },
    { id: 'skillId1', label: 'Club Fighting', value: '10', bar: 'green', icon: SkillsService.SKILL_ICONS.iconClub, percent: 0, rowHeight: 21, marginBottom: 2 },
    { id: 'skillId2', label: 'Sword Fighting', value: '10', bar: 'green', icon: SkillsService.SKILL_ICONS.iconSword, percent: 0, rowHeight: 21, marginBottom: 2 },
    { id: 'skillId3', label: 'Axe Fighting', value: '10', bar: 'green', icon: SkillsService.SKILL_ICONS.iconAxe, percent: 0, rowHeight: 21, marginBottom: 2 },
    { id: 'skillId4', label: 'Distance Fighting', value: '10', bar: 'green', icon: SkillsService.SKILL_ICONS.iconDistance, percent: 0, rowHeight: 21, marginBottom: 2 },
    { id: 'skillId5', label: 'Shielding', value: '10', bar: 'green', icon: SkillsService.SKILL_ICONS.iconShielding, percent: 0, rowHeight: 21, marginBottom: 2 },
    { id: 'skillId6', label: 'Fishing', value: '10', bar: 'green', icon: SkillsService.SKILL_ICONS.iconFishing, percent: 0, rowHeight: 21, marginBottom: 5 },
    { id: 'separator2', separator: true, marginBottom: 5 },
    { id: 'skillId7', label: 'Critical Hit Chance', value: '0%', rowHeight: 14, marginBottom: 2, small: true },
    { id: 'skillId8', label: 'Critical Hit Damage', value: '+0%', rowHeight: 14, marginBottom: 2, small: true },
    { id: 'skillId9', label: 'Life Leech Chance', value: '0%', rowHeight: 14, marginBottom: 2, small: true },
    { id: 'skillId10', label: 'Life Leech Amount', value: '0%', rowHeight: 14, marginBottom: 2, small: true },
    { id: 'skillId11', label: 'Mana Leech Chance', value: '0%', rowHeight: 14, marginBottom: 2, small: true },
    { id: 'skillId12', label: 'Mana Leech Amount', value: '0%', rowHeight: 14, marginBottom: 2, small: true },
    { id: 'skillId13', label: 'Fatal', value: '0%', rowHeight: 14, marginBottom: 2, small: true },
    { id: 'skillId14', label: 'Dodge', value: '0%', rowHeight: 14, marginBottom: 2, small: true },
    { id: 'skillId15', label: 'Momentum', value: '0%', rowHeight: 14, marginBottom: 2, small: true },
    { id: 'skillId16', label: 'Transcendence', value: '0%', rowHeight: 14, marginBottom: 5, small: true },
  ]

  static SKILL_GROUPS = {
    offence: [
      'damageHealing', 'attackValue', 'convertedDamage', 'convertedElement',
      'lifeLeech', 'manaLeech', 'criticalChance', 'criticalExtraDamage', 'onslaught',
    ],
    defence: [
      'physicalResist', 'fireResist', 'earthResist', 'energyResist', 'IceResist', 'HolyResist',
      'deathResist', 'HealingResist', 'drowResist', 'lifedrainResist', 'manadRainResist',
      'defenceValue', 'armorValue', 'mitigation', 'dodge', 'damageReflection',
    ],
    misc: ['momentum', 'transcendence', 'amplification'],
    individual: [
      'level', 'stamina', 'offlineTraining', 'magiclevel',
      'skillId0', 'skillId1', 'skillId2', 'skillId3', 'skillId4', 'skillId5', 'skillId6',
    ],
    GameAdditionalSkills: ['skillId7', 'skillId8', 'skillId9', 'skillId10', 'skillId11', 'skillId12'],
    GameForgeSkillStats: ['skillId13', 'skillId14', 'skillId15'],
    GameForgeSkillStats1332: ['skillId16'],
  }

  static ExperienceRate = {
    BASE: 'base',
    VOUCHER: 'voucher',
    XP_BOOST: 'xpBoost',
    STAMINA_MULTIPLIER: 'staminaMultiplier',
    LOW_LEVEL: 'lowLevel',
  }

  // --- Métodos estáticos (funções puras) ---

  /** Experiência total para atingir o nível (fórmula Tibia: E(x) = (50/3)(x³ - 6x² + 17x - 12)) */
  static expForLevel(level) {
    if (level <= 1) return 0
    const x = Math.floor(level)
    return Math.floor((50 / 3) * (x * x * x - 6 * x * x + 17 * x - 12))
  }

  /** Formata segundos em "HH:MM" ou "H:MM" */
  static formatTime(seconds) {
    const s = Math.max(0, Math.floor(seconds))
    const m = Math.floor(s / 60)
    const h = Math.floor(m / 60)
    const mins = m % 60
    if (h > 0) return `${h}:${mins < 10 ? '0' : ''}${mins}`
    return `${mins}:${s % 60 < 10 ? '0' : ''}${s % 60}`
  }

  static commaValue(n) {
    return String(Math.floor(Number(n))).replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  }

  static getExperienceTooltip(p) {
    if (!p) return null
    const level = p.level ?? 8
    const exp = p.experience ?? SkillsService.expForLevel(level)
    const current = exp - SkillsService.expForLevel(level)
    const needed = SkillsService.expForLevel(level + 1) - SkillsService.expForLevel(level)
    const pct = needed > 0 ? Math.floor(100 * current / needed) : 0
    const expSpeed = p.expSpeed != null ? p.expSpeed : 0
    return `Experience: ${current} / ${needed} (${pct}%)\n${expSpeed > 0 ? `Gain: ~${expSpeed} exp/min` : ''}`
  }

  static getStaminaTooltip(staminaSeconds, isPremium) {
    const mins = Math.floor(staminaSeconds / 60)
    const hours = Math.floor(mins / 60)
    const remainder = mins % 60
    const regen = isPremium ? '1 min per 3 min' : '1 min per 6 min'
    return `Stamina: ${hours}:${remainder < 10 ? '0' : ''}${remainder}\nRegeneration: ${regen}`
  }

  /** Retorna cor de alerta se valor/max < thresh (percentual) ou se max é false e val > thresh (absoluto). */
  static checkAlert(val, max, thresh) {
    if (max === false) return val > thresh ? '#b22222' : null
    if (max == null || max <= 0) return null
    const pct = (100 * val) / max
    return pct <= thresh ? '#b22222' : null
  }

  /** Cor ao comparar valor com base: verde se > base, vermelho se < base. */
  static getBaseCompareColor(val, base) {
    if (base == null || val == null) return null
    if (val > base) return '#00cc00'
    if (val < base) return '#ff9429'
    return null
  }

  static getTotalExpRateMultiplier(expRating) {
    if (!expRating) return 100
    const rate = SkillsService.ExperienceRate
    const base = expRating[rate.BASE] ?? 100
    const voucher = expRating[rate.VOUCHER] ?? 0
    const xpBoost = expRating[rate.XP_BOOST] ?? 0
    const stamina = expRating[rate.STAMINA_MULTIPLIER] ?? 100
    const lowLevel = expRating[rate.LOW_LEVEL] ?? 0
    return Math.floor(base * (1 + voucher / 100) * (1 + xpBoost / 100) * (stamina / 100) + lowLevel)
  }

  /** Formata valor de skill adicional: skillId8 = "+X%", demais = "X%" */
  static formatAdditionalSkillValue(rowId, value, usePct = true) {
    const v = Number(value)
    if (rowId === 'skillId8') return `${v >= 0 ? '+' : ''}${v}%`
    return usePct ? `${v}%` : String(v)
  }

  /**
   * Retorna { value, percent?, color?, tooltip? } para uma row pelo id e player/offline.
   */
  static getRowDisplay(rowId, player, isOnline) {
    if (!isOnline || !player) {
      return SkillsService.#getOfflineRowDisplay(rowId)
    }
    return SkillsService.#getOnlineRowDisplay(rowId, player)
  }

  static #getOfflineRowDisplay(rowId) {
    const zeros = { value: '0', percent: 0, color: null, tooltip: null }
    const dashes = { value: '--', percent: 0, color: null, tooltip: null }
    switch (rowId) {
      case 'level':
        return { value: '0', percent: 0, color: null, tooltip: null }
      case 'experience':
        return { value: '0', percent: 0, color: null, tooltip: null }
      case 'xpGainRate':
        return { value: '0%', color: null, tooltip: null }
      case 'health':
        return { value: '0 / 0', color: null, tooltip: null }
      case 'mana':
        return { value: '0 / 0', color: null, tooltip: null }
      case 'soul':
        return zeros
      case 'capacity':
        return { value: '0 / 0', color: null, tooltip: null }
      case 'speed':
        return zeros
      case 'regenerationTime':
        return dashes
      case 'stamina':
        return { value: '0:00', percent: 0, color: null, tooltip: null }
      case 'offlineTraining':
        return { value: '--', percent: 0, color: null, tooltip: null }
      case 'magiclevel':
        return { ...zeros, percent: 0 }
      default:
        if (rowId?.startsWith('skillId')) {
          const idx = parseInt(rowId.replace('skillId', ''), 10)
          if (idx >= 7) return { value: idx === 8 ? '+0%' : '0%', color: null, tooltip: null }
          return { value: '0', percent: 0, color: null, tooltip: null }
        }
        return zeros
    }
  }

  static #getOnlineRowDisplay(rowId, player) {
    const p = player
    const alertColor = (val, max, thresh) => SkillsService.checkAlert(val, max, thresh) || null
    const baseColor = (val, base) => SkillsService.getBaseCompareColor(val, base)

    switch (rowId) {
      case 'level': {
        const color = baseColor(p.level, p.baseLevel ?? p.level)
        return { value: SkillsService.commaValue(p.level), percent: p.levelPercent ?? 0, color, tooltip: p.levelTooltip ?? null }
      }
      case 'experience':
        return { value: `${SkillsService.commaValue(p.experience)} / ${SkillsService.commaValue(SkillsService.expForLevel(p.level + 1))}`, percent: 0, color: null, tooltip: SkillsService.getExperienceTooltip(p) }
      case 'xpGainRate':
        return { value: `${Math.floor(p.expRateTotal ?? 100)}%`, color: p.expRateColor ?? null, tooltip: p.expRateTooltip ?? null }
      case 'health': {
        const color = alertColor(p.health, p.maxHealth, 30)
        return { value: `${SkillsService.commaValue(p.health)} / ${SkillsService.commaValue(p.maxHealth)}`, color, tooltip: null }
      }
      case 'mana': {
        const color = alertColor(p.mana, p.maxMana, 30)
        return { value: `${SkillsService.commaValue(p.mana)} / ${SkillsService.commaValue(p.maxMana)}`, color, tooltip: null }
      }
      case 'soul':
        return { value: String(p.soul ?? 0), color: null, tooltip: null }
      case 'capacity': {
        const color = alertColor(p.freeCapacity, p.totalCapacity, 20)
        return { value: `${SkillsService.commaValue(p.freeCapacity)} / ${SkillsService.commaValue(p.totalCapacity)}`, color, tooltip: null }
      }
      case 'speed': {
        const color = baseColor(p.speed, p.baseSpeed)
        return { value: SkillsService.commaValue(p.speed), color, tooltip: null }
      }
      case 'regenerationTime': {
        const regen = p.regenerationTime
        if (regen == null || regen < 0) return { value: '--', percent: 0, color: null, tooltip: null }
        const h = Math.floor(regen / 3600)
        const m = Math.floor((regen % 3600) / 60)
        const s = regen % 60
        const fmt = `${h < 10 ? '0' : ''}${h}:${m < 10 ? '0' : ''}${m}:${s < 10 ? '0' : ''}${s}`
        const color = SkillsService.checkAlert(regen, false, 300) || null
        return { value: fmt, color, tooltip: null }
      }
      case 'stamina': {
        const stamina = p.stamina ?? 0
        const percent = Math.floor(100 * stamina / (42 * 60))
        const color = stamina > 2400 ? (p.isPremium ? '#008b00' : '#89F013') : stamina <= 840 && stamina > 0 ? '#b22222' : stamina === 0 ? '#000' : null
        return { value: SkillsService.formatTime(stamina), percent, color, tooltip: SkillsService.getStaminaTooltip(stamina, p.isPremium) }
      }
      case 'offlineTraining': {
        const time = p.offlineTrainingTime ?? 0
        const percent = (100 * time) / (12 * 60)
        return { value: time > 0 ? SkillsService.formatTime(time) : '--', percent, color: null, tooltip: null }
      }
      case 'magiclevel': {
        const ml = p.magicLevel ?? 0
        const pct = p.magicLevelPercent ?? 0
        const color = baseColor(ml, p.baseMagicLevel ?? ml)
        return { value: String(ml), percent: pct, color, tooltip: null }
      }
      default:
        if (rowId?.startsWith('skillId')) {
          const idx = parseInt(rowId.replace('skillId', ''), 10)
          const sk = p.skills?.[idx]
          if (idx <= 6 && sk) {
            const color = baseColor(sk.level, sk.baseLevel ?? sk.level)
            return { value: String(sk.level), percent: sk.percent ?? 0, color, tooltip: null }
          }
          if (idx >= 7 && idx <= 16) {
            const v = typeof sk === 'number' ? sk : sk?.value ?? 0
            return { value: SkillsService.formatAdditionalSkillValue(rowId, v, true), color: v < 0 ? '#FF9854' : null, tooltip: null }
          }
        }
        return { value: '0', percent: 0, color: null, tooltip: null }
    }
  }

  /**
   * Enriquece player com levelPercent, expRateTotal, expRateColor para exibição.
   */
  static enrichPlayerForDisplay(p, expRating) {
    if (!p) return null
    const level = p.level ?? 8
    const experience = p.experience ?? SkillsService.expForLevel(level)
    const nextExp = SkillsService.expForLevel(level + 1)
    const levelPercent = Math.min(100, Math.max(0, Math.floor(100 * (experience - SkillsService.expForLevel(level)) / Math.max(1, nextExp - SkillsService.expForLevel(level)))))
    const expRateTotal = SkillsService.getTotalExpRateMultiplier(expRating)
    const expRateColor = expRateTotal > 100 ? '#00cc00' : expRateTotal < 100 ? '#ff9429' : '#ffffff'
    return {
      ...p,
      experience,
      levelPercent,
      baseLevel: p.baseLevel ?? level,
      levelTooltip: SkillsService.getExperienceTooltip({ ...p, experience, level, expSpeed: p.expSpeed }),
      expRateTotal,
      expRateColor,
      expRateTooltip: null,
    }
  }

  /**
   * Constrói player exibível a partir de mock (levelPercent, levelTooltip, expRateTotal, etc.).
   */
  static buildPlayerFromMock(mock) {
    const level = mock.level ?? 8
    const experience = mock.experience ?? SkillsService.expForLevel(level)
    const nextExp = SkillsService.expForLevel(level + 1)
    const levelPercent = Math.min(100, Math.max(0, Math.floor(100 * (experience - SkillsService.expForLevel(level)) / Math.max(1, nextExp - SkillsService.expForLevel(level)))))
    return {
      ...mock,
      experience,
      levelPercent,
      baseLevel: mock.baseLevel ?? level,
      levelTooltip: SkillsService.getExperienceTooltip({ ...mock, experience, level, expSpeed: mock.expSpeed }),
      expRateTotal: 100,
      expRateColor: null,
      expRateTooltip: null,
    }
  }
}

/** Singleton para uso opcional: skillsService.getRowDisplay(...) */
export const skillsService = SkillsService
