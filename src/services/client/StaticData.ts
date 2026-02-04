/*
 * Copyright (c) 2010-2026 OTClient <https://github.com/edubart/otclient>
 * Port of src/client/staticdata.h – structs and data types.
 */

import type { Outfit } from './Outfit'
import type { Position } from './Position'
import { ITEM_CATEGORY } from './Const'
import type { Point, Rect, Size, Timer } from './types'

/** Placeholder for Item until Item.ts exists; use Item when available. */
export interface ItemRef {}

export interface Bounce {
  minHeight: number
  height: number
  speed: number
  timer: Timer
}

export interface AwareRange {
  left: number
  top: number
  right: number
  bottom: number
}

export interface MapPosInfo {
  rect: Rect
  srcRect: Rect
  drawOffset: Point
  horizontalStretchFactor: number
  verticalStretchFactor: number
  scaleFactor: number
  camera: Position
  awareRange: AwareRange
}

export interface RaceType {
  raceId: number
  name: string
  outfit: Outfit
  boss: boolean
}

export interface PreyMonster {
  name: string
  outfit: Outfit
}

export interface ImbuementSlot {
  id: number
  name: string
  iconId: number
  duration: number
  state: boolean
}

export interface Imbuement {
  id: number
  name: string
  description: string
  group: string
  tier: number
  imageId: number
  duration: number
  premiumOnly: boolean
  sources: Array<[ItemRef, string]>
  cost: number
  successRate: number
  protectionCost: number
}

export interface ImbuementTrackerItem {
  slot: number
  totalSlots: number
  item: ItemRef | null
  slots: Map<number, ImbuementSlot>
}

export interface MarketData {
  name: string
  category: ITEM_CATEGORY
  requiredLevel: number
  restrictVocation: number
  showAs: number
  tradeAs: number
}

export interface NPCData {
  name: string
  location: string
  salePrice: number
  buyPrice: number
  currencyObjectTypeId: number
  currencyQuestFlagDisplayName: string
}

export interface MarketOffer {
  timestamp: number
  counter: number
  action: number
  itemId: number
  amount: number
  price: number
  playerName: string
  state: number
  var: number
  itemTier: number
}

export interface Light {
  intensity: number
  color: number
}

export interface UnjustifiedPoints {
  killsDay: number
  killsDayRemaining: number
  killsWeek: number
  killsWeekRemaining: number
  killsMonth: number
  killsMonthRemaining: number
  skullTime: number
}

export interface BlessData {
  blessBitwise: number
  playerBlessCount: number
  store: number
}

export interface LogData {
  timestamp: number
  colorMessage: number
  historyMessage: string
}

export interface BlessDialogData {
  totalBless: number
  blesses: BlessData[]
  premium: number
  promotion: number
  pvpMinXpLoss: number
  pvpMaxXpLoss: number
  pveExpLoss: number
  equipPvpLoss: number
  equipPveLoss: number
  skull: number
  aol: number
  logs: LogData[]
}

/** Vip = tuple name, id, description, status, notifyLogin, groupIDs */
export interface Vip {
  name: string
  id: number
  description: string
  status: number
  notifyLogin: boolean
  groupIDs: number[]
}

export interface SubOffer {
  id: number
  count: number
  price: number
  coinType: number
  disabled: boolean
  disabledReason: number
  reasonIdDisable: number
  state: number
  validUntil: number
  basePrice: number
  name: string
  description: string
  icons: string[]
  parent: string
}

export interface StoreOffer {
  name: string
  subOffers: SubOffer[]
  id: number
  description: string
  price: number
  state: number
  basePrice: number
  disabled: boolean
  reasonIdDisable: string
  type: number
  icon: string
  mountId: number
  itemId: number
  outfitId: number
  outfitHead: number
  outfitBody: number
  outfitLegs: number
  outfitFeet: number
  sex: number
  maleOutfitId: number
  femaleOutfitId: number
  tryOnType: number
  collection: number
  popularityScore: number
  stateNewUntil: number
  configurable: boolean
  productsCapacity: number
}

export interface CyclopediaCharacterGeneralStats {
  experience: number
  level: number
  levelPercent: number
  baseExpGain: number
  lowLevelExpBonus: number
  XpBoostPercent: number
  staminaExpBonus: number
  XpBoostBonusRemainingTime: number
  canBuyXpBoost: number
  health: number
  maxHealth: number
  mana: number
  maxMana: number
  soul: number
  staminaMinutes: number
  regenerationCondition: number
  offlineTrainingTime: number
  speed: number
  baseSpeed: number
  capacity: number
  baseCapacity: number
  freeCapacity: number
  magicLevel: number
  baseMagicLevel: number
  loyaltyMagicLevel: number
  magicLevelPercent: number
}

export interface CyclopediaCharacterCombatStats {
  weaponElement: number
  weaponMaxHitChance: number
  weaponElementDamage: number
  weaponElementType: number
  defense: number
  armor: number
  haveBlessings: number
}

export interface CyclopediaBestiaryRace {
  race: number
  bestClass: string
  count: number
  unlockedCount: number
}

export interface CharmData {
  id: number
  name: string
  description: string
  unlockPrice: number
  unlocked: boolean
  asignedStatus: boolean
  raceId: number
  removeRuneCost: number
  availableCharmSlots: number
  tier: number
}

export interface BestiaryCharmsData {
  resetAllCharmsCost: number
  availableCharmSlots: number
  points: number
  charms: CharmData[]
  finishedMonsters: number[]
}

export interface BestiaryOverviewMonsters {
  id: number
  currentLevel: number
  occurrence: number
  creatureAnimusMasteryBonus: number
}

export interface LootItem {
  itemId: number
  diffculty: number
  specialEvent: number
  name: string
  amount: number
}

export interface BossCooldownData {
  bossRaceId: number
  cooldownTime: number
}

export interface PartyMemberData {
  memberID: number
  highlight: number
  loot: number
  supply: number
  damage: number
  healing: number
}

export interface PartyMemberName {
  memberID: number
  memberName: string
}
