import { getLoginContext, getAuthenticatorToken, getSessionKey } from '../protocol/sessionState.js'
import { ProtocolGame } from './ProtocolGame.js'
import { loadThings } from '../protocol/things.js'
import { g_map } from './ClientMap.js'
import { getProtocolInfo, OTSERV_RSA } from '../protocol/protocolInfo.js'
import { GameEventsEnum } from './Const.js'
import { getConnection } from '../protocol/connection.js'
import { InputMessage } from '../protocol/inputMessage.js'

let clientVersion = 860
let serverBeat = 0
let canReportBugs = false
let expertPvpMode = false

export class Game {
  constructor() {
    this.m_protocolGame = new ProtocolGame()
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
    const ctx = getLoginContext()
    if (!ctx) {
      return { ok: false, message: 'Missing login context (account/password).' }
    }

    const protocolInfo = getProtocolInfo(ctx.clientVersion)
    const effectiveVersion = protocolInfo.clientVersion || ctx.clientVersion || 860
    g_game.setClientVersion(effectiveVersion)
    loadThings(protocolInfo.clientVersion || 860).catch(() => { })
    const connection = getConnection()
    const map = g_map
    map.clean()
    if (typeof window !== 'undefined') {
      if (new URLSearchParams(window.location.search).get('debug') === 'protocol') window.__otDebugProtocol = true
    }

    const worldHost = charInfo.worldHost || charInfo.worldIp
    const worldPort = parseInt(charInfo.worldPort, 10) || 7172
    const characterName = charInfo.characterName || charInfo.name
    
    if (!worldHost || !characterName) {
      return { ok: false, message: 'Invalid character/world data.' }
    }

    connection.resetCrypto()
    connection.enableChecksum(protocolInfo.checksum)

    try {
      let finished = false
      let loginSent = false
      let firstRecv = true

      await connection.connect(worldHost, worldPort)
      const sendLogin = async (timestamp, random) => {
        this.m_protocolGame.sendLoginPacket(
          timestamp,
          random
        )
      }

      if (!protocolInfo.challengeOnLogin) {
        await sendLogin(0, 0)
      }

      const result = await new Promise((resolve) => {
        const timeout = setTimeout(() => {
          cleanup()
          resolve({ ok: false, message: 'Server response timeout' })
        }, 15000)

        const cleanup = () => {
          if (finished) return
          finished = true
          clearTimeout(timeout)
          connection.off('receive', onReceive)
          connection.off('error', onError)
          connection.off('disconnect', onDisconnect)
        }

        let loginResolved = false
        const resolveOnce = (value) => {
          if (finished) return
          finished = true
          clearTimeout(timeout)
          loginResolved = true
          resolve(value)
        }

        const onError = (error) => {
          cleanup()
          resolve({ ok: false, message: error?.message || 'Connection error' })
        }

        const onDisconnect = ({ reason } = {}) => {
          cleanup()
          resolve({ ok: false, message: reason || 'Connection closed' })
        }

        const debug = true
        // OTC: onRecv(inputMessage) → firstRecv handling → parseMessage(inputMessage); recv();
        const onReceive = async (data) => {
          try {
            const msg = new InputMessage(data)
            const firstByte = data?.[0]
            if (typeof window !== 'undefined' && (window.__otDebugProtocol || firstByte === 0x64 || firstByte === 0x65 || firstByte === 0x66 || firstByte === 0x67 || firstByte === 0x68)) {
              const label = firstByte === 0x64 ? 'MapDescription' : firstByte === 0x67 ? 'MapMoveSouth' : firstByte === 0x65 ? 'MapMoveNorth' : firstByte === 0x66 ? 'MapMoveEast' : firstByte === 0x68 ? 'MapMoveWest' : ''
              console.log('[protocol] receive', data?.length ?? 0, 'bytes, opcode=0x' + (firstByte != null ? firstByte.toString(16) : '?'), label ? `(${label})` : '')
            }
            if (firstRecv) {
              firstRecv = false
              if (protocolInfo.clientVersion < 1405 && protocolInfo.messageSizeCheck) {
                const declaredSize = msg.getU16()
                if (declaredSize !== msg.getUnreadSize()) {
                  cleanup()
                  resolve({ ok: false, message: 'Invalid message size' })
                  return
                }
              }
            }

            const ctx = {
              map,
              debug,
              connection,
              protocolInfo,
              characterName,
              getLoginSent: () => loginSent,
              getLoginResolved: () => loginResolved,
              callbacks: { cleanup, resolve, resolveOnce, sendLogin },
            }
            await this.m_protocolGame.m_protocolGameParser.parseMessage(msg, ctx)
          } catch (e) {
            console.error('[protocol] parse error', e?.message || e)
            if (!loginResolved) {
              cleanup()
              resolve({ ok: false, message: e?.message || 'Failed to parse game response' })
            }
          }
        }

        connection.on('receive', onReceive)
        connection.on('error', onError)
        connection.on('disconnect', onDisconnect)
      })

      return result
    } catch (error) {
      await connection.close()
      return { ok: false, message: error?.message || 'Failed to connect to game server.' }
    }
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
