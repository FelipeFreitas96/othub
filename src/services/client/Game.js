import { getLoginContext, getAuthenticatorToken, getSessionKey } from '../protocol/sessionState.js'
import { ProtocolGame } from './ProtocolGame.js'
import { loadThings } from '../protocol/things.js'
import { g_map } from './ClientMap.js'
import { getProtocolInfo } from '../protocol/protocolInfo.js'
import { GameEventsEnum } from './Const.js'

let clientVersion = 860
let serverBeat = 0
let canReportBugs = false
let expertPvpMode = false

export class Game {
  constructor() {
    this.m_protocolGame = null
    this.m_localPlayer = null
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

  setClientVersion(version) {
    const parsed = parseInt(version, 10)
    this.m_clientVersion = Number.isFinite(parsed) && parsed > 0 ? parsed : 860
  }

  setCanReportBugs(value) {
    canReportBugs = !!value
  }

  getCanReportBugs() {
    return canReportBugs
  }

  setExpertPvpMode(enabled) {
    expertPvpMode = !!enabled
  }

  getExpertPvpMode() {
    return expertPvpMode
  }

  getLocalPlayer() {
    return this.m_localPlayer
  }

  setLocalPlayer(player) {
    this.m_localPlayer = player
  }

  connect(event, callback) {
    const handler = (e) => callback(e.detail)
    window.addEventListener(`g_game:${event}`, handler)
    return () => window.removeEventListener(`g_game:${event}`, handler)
  }

  processLogin() {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent(`g_game:${GameEventsEnum.processLogin}`))
      window.dispatchEvent(new CustomEvent(`g_game:${GameEventsEnum.onGameStart}`))
    }
  }

  processConnectionError(error) {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent(`g_game:${GameEventsEnum.onConnectionError}`, { detail: error }))
    }
  }

  async loginWorld(charInfo) {
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
    const worldPort = parseInt(charInfo.worldPort, 10) || 7172
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
      getAuthenticatorToken(),
      getSessionKey()
    )
  }

  isOnline() {
    return !!(this.m_protocolGame && this.m_protocolGame.m_connection && this.m_protocolGame.m_connection.connected)
  }
}

export function getGameClientVersion() {
  return clientVersion
}

export function setGameClientVersion(version) {
  const parsed = parseInt(version, 10)
  clientVersion = Number.isFinite(parsed) && parsed > 0 ? parsed : 860
  return clientVersion
}

export function setServerBeat(v) {
  serverBeat = v
}

export function setCanReportBugs(value) {
  canReportBugs = !!value
}

export function setExpertPvpMode(enabled) {
  expertPvpMode = !!enabled
}

export function processLogin() {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('g_game:processLogin'))
  }
}

export const g_game = new Game()
