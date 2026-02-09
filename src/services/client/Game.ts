import { getLoginContext, getAuthenticatorToken, getSessionKey } from '../protocol/sessionState'
import { ProtocolGame } from './ProtocolGame'
import { loadThings } from '../protocol/things'
import { g_map } from './ClientMap'
import { getProtocolInfo } from '../protocol/protocolInfo'
import { GameEventsEnum } from './Const'
import { g_player, LocalPlayer } from './LocalPlayer'
import { Direction, DirectionType } from './Position'

let clientVersion = 860
let serverBeat = 0
let canReportBugs = false
let expertPvpMode = false

export interface CharacterInfo {
  worldHost?: string
  worldIp?: string
  worldPort?: string | number
  characterName?: string
  name?: string
  worldName?: string
}

export class Game {
  m_protocolGame: ProtocolGame | null
  m_characterName: string
  m_worldName: string
  m_clientVersion: number

  constructor() {
    this.m_protocolGame = null
    this.m_characterName = ''
    this.m_worldName = ''
    this.m_clientVersion = 860
  }

  getProtocolGame() {
    return this.m_protocolGame
  }

  getClientVersion() {
    return this.m_clientVersion
  }

  /** OTC: formatCreatureName(string) – used in getCreature when reading creature name. */
  formatCreatureName(name: string): string {
    return name ?? ''
  }

  setClientVersion(version: number | string) {
    const parsed = typeof version === 'string' ? parseInt(version, 10) : version
    this.m_clientVersion = Number.isFinite(parsed) && parsed > 0 ? (parsed as number) : 860
  }

  setCanReportBugs(value: boolean) {
    canReportBugs = !!value
  }

  getCanReportBugs() {
    return canReportBugs
  }

  setExpertPvpMode(enabled: boolean) {
    expertPvpMode = !!enabled
  }

  getExpertPvpMode() {
    return expertPvpMode
  }


  connect(event: string, callback: (detail: any) => void) {
    const handler = (e: any) => callback(e.detail)
    window.addEventListener(`g_game:${event}`, handler)
    return () => window.removeEventListener(`g_game:${event}`, handler)
  }

  processLogin() {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent(`g_game:${GameEventsEnum.processLogin}`))
      window.dispatchEvent(new CustomEvent(`g_game:${GameEventsEnum.onGameStart}`))
    }
  }

  processGameEnd() {
    this.m_protocolGame = null
    g_map.cleanDynamicThings()
    g_player.resetForLogin()
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent(`g_game:${GameEventsEnum.onGameEnd}`))
    }
  }

  processConnectionError(error: any) {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent(`g_game:${GameEventsEnum.onConnectionError}`, { detail: error }))
    }
  }

  /** OTC: Game::processDeath – death opcode 0x7B. Stub: dispatch event. */
  processDeath(_deathType: number, _penalty: number) {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('g_game:processDeath', { detail: { deathType: _deathType, penalty: _penalty } }))
    }
  }

  /** OTC: Game::processContainerAddItem – container add opcode 0x70. Stub: dispatch event. */
  processContainerAddItem(_containerId: number, _item: any, _slot: number) {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('g_game:containerAddItem', { detail: { containerId: _containerId, item: _item, slot: _slot } }))
    }
  }

  /** OTC: Game::processContainerUpdateItem – container update opcode 0x71. Stub: dispatch event. */
  processContainerUpdateItem(_containerId: number, _slot: number, _item: any) {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('g_game:containerUpdateItem', { detail: { containerId: _containerId, slot: _slot, item: _item } }))
    }
  }

  /** OTC: Game::processContainerRemoveItem – container remove opcode 0x72. Stub: dispatch event. */
  processContainerRemoveItem(_containerId: number, _slot: number, _lastItem: any) {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('g_game:containerRemoveItem', { detail: { containerId: _containerId, slot: _slot, lastItem: _lastItem } }))
    }
  }

  async loginWorld(charInfo: CharacterInfo) {
    if (this.m_protocolGame && this.m_protocolGame.m_connection && this.m_protocolGame.m_connection.connected) {
      return { ok: false, message: 'Unable to login into a world while already online or logging.' }
    }

    const ctx = getLoginContext()
    if (!ctx) {
      return { ok: false, message: 'Missing login context (account/password).' }
    }

    const protocolInfo = getProtocolInfo(ctx.clientVersion)
    const effectiveVersion = protocolInfo.clientVersion || ctx.clientVersion || 860
    this.setClientVersion(effectiveVersion)
    loadThings(protocolInfo.clientVersion || 860).catch(() => { })
    
    g_map.clean()

    const worldHost = charInfo.worldHost || charInfo.worldIp
    const worldPort = typeof charInfo.worldPort === 'string' ? parseInt(charInfo.worldPort, 10) : charInfo.worldPort || 7172
    const characterName = charInfo.characterName || charInfo.name

    if (!worldHost || !characterName) {
      return { ok: false, message: 'Invalid character/world data.' }
    }

    // OTC creates a fresh LocalPlayer each login. Keep singleton identity, reset all state.
    g_player.resetForLogin(characterName)

    this.m_protocolGame = new ProtocolGame()
    this.m_characterName = characterName
    this.m_worldName = charInfo.worldName || ''

    return this.m_protocolGame.login(
      ctx.account,
      ctx.password,
      worldHost,
      worldPort,
      characterName,
      getAuthenticatorToken() || '',
      getSessionKey() || ''
    )
  }

  isOnline() {
    return !!(this.m_protocolGame && this.m_protocolGame.m_connection && this.m_protocolGame.m_connection.connected)
  }

  getServerBeat() {
    return serverBeat
  }

  // OTC: Game::canPerformGameAction – game.cpp
  canPerformGameAction(): boolean {
    return this.isOnline()
  }

  // OTC: Game::walk – game.cpp
  walk(direction: DirectionType): boolean {
    if (!this.canPerformGameAction() || direction === Direction.InvalidDirection) {
      return false
    }

    // g_lua.callGlobalField("g_game", "onWalk", direction) - skip Lua
    this.forceWalk(direction)
    return true
  }

  // OTC: Game::forceWalk – game.cpp
  forceWalk(direction: DirectionType) {
    if (!this.canPerformGameAction() || !this.m_protocolGame) return

    switch (direction) {
      case Direction.North:
        this.m_protocolGame.sendWalkNorth()
        break
      case Direction.East:
        this.m_protocolGame.sendWalkEast()
        break
      case Direction.South:
        this.m_protocolGame.sendWalkSouth()
        break
      case Direction.West:
        this.m_protocolGame.sendWalkWest()
        break
      case Direction.NorthEast:
        this.m_protocolGame.sendWalkNorthEast()
        break
      case Direction.SouthEast:
        this.m_protocolGame.sendWalkSouthEast()
        break
      case Direction.SouthWest:
        this.m_protocolGame.sendWalkSouthWest()
        break
      case Direction.NorthWest:
        this.m_protocolGame.sendWalkNorthWest()
        break
    }
  }

  // OTC: Game::turn – game.cpp
  turn(direction: DirectionType) {
    if (!this.canPerformGameAction() || !this.m_protocolGame) return

    switch (direction) {
      case Direction.North:
        this.m_protocolGame.sendTurnNorth()
        break
      case Direction.East:
        this.m_protocolGame.sendTurnEast()
        break
      case Direction.South:
        this.m_protocolGame.sendTurnSouth()
        break
      case Direction.West:
        this.m_protocolGame.sendTurnWest()
        break
    }
  }

  // OTC: Game::stop – game.cpp
  stop() {
    if (!this.canPerformGameAction() || !this.m_protocolGame) return
    this.m_protocolGame.sendStop()
  }
}

export function getGameClientVersion() {
  return clientVersion
}

export function setGameClientVersion(version: number | string) {
  const parsed = typeof version === 'string' ? parseInt(version, 10) : version
  clientVersion = Number.isFinite(parsed) && parsed > 0 ? (parsed as number) : 860
  return clientVersion
}

export function setServerBeat(v: number) {
  serverBeat = v
}

export function setCanReportBugs(value: boolean) {
  canReportBugs = !!value
}

export function setExpertPvpMode(enabled: boolean) {
  expertPvpMode = !!enabled
}

export function processLogin() {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('g_game:processLogin'))
  }
}

export const g_game = new Game()
