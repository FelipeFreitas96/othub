/**
 * Player – 1:1 port of OTClient src/client/player.h + player.cpp
 * Copyright (c) 2010-2026 OTClient <https://github.com/edubart/otclient>; ported to JS.
 * OTC: class Player : public Creature; m_vocation, isPlayer(), isMage(), isMonk(), setVocation(), getVocation().
 */

import { Creature, type CreatureData } from './Creature'

// OTC Otc::Vocations_t (simplified)
const SORCERER = 1
const DRUID = 2
const MASTER_SORCERER = 3
const ELDER_DRUID = 4
const MONK = 5
const EXALTED_MONK = 6

export interface PlayerData extends CreatureData {
  vocation?: number
}

export class Player extends Creature {
  /** OTC: uint8_t m_vocation */
  m_vocation: number

  constructor(data: PlayerData = {}) {
    super(data)
    this.m_vocation = data.vocation ?? 0
  }

  override isPlayer(): boolean { return true }

  /** OTC: bool Player::isMage() const */
  isMage(): boolean {
    switch (this.m_vocation) {
      case SORCERER:
      case DRUID:
      case MASTER_SORCERER:
      case ELDER_DRUID:
        return true
      default:
        return false
    }
  }

  /** OTC: bool Player::isMonk() const */
  isMonk(): boolean {
    switch (this.m_vocation) {
      case MONK:
      case EXALTED_MONK:
        return true
      default:
        return false
    }
  }

  /** OTC: void Player::setVocation(uint8_t vocation) */
  setVocation(vocation: number) {
    if (this.m_vocation === vocation) return
    const oldVocation = this.m_vocation
    this.m_vocation = vocation
    // callLuaField("onVocationChange", vocation, oldVocation) – optional
  }

  /** OTC: uint8_t Player::getVocation() */
  getVocation(): number {
    return this.m_vocation
  }
}
