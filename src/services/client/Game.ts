import { getLoginContext, getAuthenticatorToken, getSessionKey } from '../protocol/sessionState'
import { ProtocolGame } from './ProtocolGame'
import { loadThings } from '../protocol/things'
import { g_map } from './ClientMap'
import { getProtocolInfo } from '../protocol/protocolInfo'
import { GameEventsEnum } from './Const'
import { LocalPlayer } from './LocalPlayer'
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

  processConnectionError(error: any) {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent(`g_game:${GameEventsEnum.onConnectionError}`, { detail: error }))
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
