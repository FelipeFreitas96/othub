/**
 * ProtocolGame – 1:1 port of OTClient src/client/protocolgame.cpp/h and protocolgamesend.cpp
 * Copyright (c) 2010-2026 OTClient; ported to JS.
 */
import { getConnection } from '../protocol/connection.js'
import { generateXteaKey, getRsaKeySize, rsaEncrypt } from '../protocol/crypto.js'
import { getProtocolInfo, OTSERV_RSA } from '../protocol/protocolInfo.js'
import { OutputMessage } from '../protocol/outputMessage.js'
import { InputMessage } from '../protocol/inputMessage.js'
import { localPlayer } from '../game/LocalPlayer.js'
import { g_game, getGameClientVersion } from './Game.js'
import { ProtocolGameParse, GAME_CLIENT_OPCODES } from './ProtocolGameParse.js'
import { GameEventsEnum } from './Const.js'

export class ProtocolGame {
  constructor() {
    this.m_accountName = ''
    this.m_accountPassword = ''
    this.m_authenticatorToken = ''
    this.m_sessionKey = ''
    this.m_characterName = ''
    this.m_connection = getConnection()
    this.m_firstRecv = true
    this.m_gameInitialized = false
    this.m_loginSent = false
    this.m_xteaKey = null
    this.m_protocolGameParser = new ProtocolGameParse()
  }

  /** OTC: ProtocolGame::login – protocolgame.cpp */
  login(accountName, accountPassword, host, port, characterName, authenticatorToken, sessionKey) {
    this.m_accountName = accountName
    this.m_accountPassword = accountPassword
    this.m_authenticatorToken = authenticatorToken
    this.m_sessionKey = sessionKey
    this.m_characterName = characterName

    this.m_connection = getConnection()
    this.m_connection.close()
    this.m_connection.clearHandlers()
    this.m_connection.resetCrypto()

    this.m_connection.on('connect', () => this.onConnect())
    this.m_connection.on('receive', (data) => this.onRecv(data))
    this.m_connection.on('error', (err) => this.onError(err))
    this.m_connection.on('disconnect', (res) => this.onDisconnect(res))
    this.m_connection.connect(host, port)
  }

  /** OTC: ProtocolGame::onConnect – protocolgame.cpp */
  onConnect() {
    this.m_firstRecv = true
    this.m_loginSent = false

    // OTC: Protocol::onConnect handles some basic setup
    const protocolInfo = getProtocolInfo(getGameClientVersion())
    if (protocolInfo.checksum) {
      this.m_connection.enableChecksum()
    }

    if (!protocolInfo.challengeOnLogin) {
      this.sendLoginPacket(0, 0)
    }
  }

  /** Último opcode recebido (para debug ao desconectar). */
  getLastRecvOpcode() {
    return this.m_lastRecvOpcode
  }

  /** OTC: ProtocolGame::onRecv – protocolgame.cpp */
  async onRecv(data) {
    const opcode = data && data.length > 0 ? data[0] : null
    this.m_lastRecvOpcode = opcode
    if (typeof window !== 'undefined' && window.__otDebugConnection) {
      const preview = data && data.length > 0 ? Array.from(data.slice(0, 12)).map(b => b.toString(16).padStart(2, '0')).join(' ') : ''
      console.log('[ProtocolGame] recv', data?.length ?? 0, 'bytes, opcode=0x' + (opcode != null ? opcode.toString(16) : '?') + (preview ? ` (${preview}...)` : ''))
    }
    const msg = new InputMessage(data)

    if (this.m_firstRecv) {
      this.m_firstRecv = false

      const clientVersion = getGameClientVersion()
      const protocolInfo = getProtocolInfo(clientVersion)

      if (clientVersion >= 1405) {
        msg.getU8() // padding
      } else if (protocolInfo.messageSizeCheck) {
        const size = msg.getU16()
        if (size !== msg.getUnreadSize()) {
          console.error('[protocol] invalid message size')
          return
        }
      }
    }

    // OTC: parseMessage(inputMessage); recv();
    // In JS, onRecv is triggered by the connection for each packet.
    const ctx = {
      connection: this.m_connection,
      characterName: this.m_characterName,
      getLoginSent: () => this.m_loginSent,
      getLoginResolved: () => this.m_gameInitialized,
      callbacks: {
        cleanup: () => {},
        resolve: (result) => {
          if (result && result.ok === false && typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent(`g_game:${GameEventsEnum.onConnectionError}`, { detail: { message: result.message || 'Login failed' } }))
          }
        },
        resolveOnce: () => {
          this.m_gameInitialized = true
        },
        sendLogin: async (ts, rnd) => {
          await this.sendLoginPacket(ts, rnd)
        }
      }
    }
    await this.m_protocolGameParser.parseMessage(msg, ctx)
  }

  /** OTC: ProtocolGame::onError – protocolgame.cpp */
  onError(error) {
    console.error('ProtocolGame: onError', error)
    g_game.processConnectionError(error)
    this.m_connection.disconnect()
  }

  onDisconnect(res) {
    const reason = res?.reason ?? 'Connection closed'
    console.warn('[ProtocolGame] onDisconnect:', reason, {
      loginSent: this.m_loginSent,
      gameInitialized: this.m_gameInitialized,
      lastRecvOpcode: this.m_lastRecvOpcode != null ? '0x' + this.m_lastRecvOpcode.toString(16) : null,
      full: res,
    })
    if (typeof window !== 'undefined' && !window.__otDebugConnection) {
      console.warn('[ProtocolGame] Dica: defina window.__otDebugConnection = true e recarregue para ver logs de cada pacote enviado/recebido.')
    }
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('g_game:onDisconnect', { detail: res }))
    }
  }

  /** OTC: ProtocolGame::sendLoginPacket – 1:1 com protocolgamesend.cpp. */
  sendLoginPacket(challengeTimestamp, challengeRandom) {
    const clientVersion = getGameClientVersion()
    const protocolInfo = getProtocolInfo(clientVersion)
    const rsaKey = OTSERV_RSA
    const rsaSize = getRsaKeySize(rsaKey)
    const msg = new OutputMessage()

    msg.addU8(GAME_CLIENT_OPCODES.GameClientPendingGame)
    msg.addU16(2) // g_game.getOs() – Windows
    msg.addU16(protocolInfo.protocolVersion)

    if (protocolInfo.clientVersionFeature) {
      msg.addU32(clientVersion)
    }

    if (clientVersion >= 1281) {
      msg.addString(String(clientVersion))
    }

    if (clientVersion >= 1334) {
      msg.addString('appearancesHash')
    } else if (protocolInfo.contentRevision) {
      msg.addU16(0) // g_things.getContentRevision()
    }

    if (protocolInfo.previewState) {
      msg.addU8(0)
    }

    const offset = msg.getRawBuffer().length

    if (protocolInfo.loginEncryption) {
      msg.addU8(0) // first RSA byte must be 0
      const xteaKey = generateXteaKey()
      msg.addU32(xteaKey[0])
      msg.addU32(xteaKey[1])
      msg.addU32(xteaKey[2])
      msg.addU32(xteaKey[3])
      this.m_xteaKey = xteaKey
    }

    msg.addU8(0) // is gm set?

    if (protocolInfo.sessionKey) {
      msg.addString(this.m_sessionKey)
      msg.addString(this.m_characterName)
    } else {
      if (protocolInfo.accountNames) {
        msg.addString(this.m_accountName)
      } else {
        const accountNumber = parseInt(this.m_accountName, 10)
        if (Number.isNaN(accountNumber)) {
          throw new Error('Account must be numeric for this client version.')
        }
        msg.addU32(accountNumber >>> 0)
      }
      msg.addString(this.m_characterName)
      msg.addString(this.m_accountPassword)
      if (protocolInfo.authenticator) {
        msg.addString(this.m_authenticatorToken)
      }
    }

    if (protocolInfo.challengeOnLogin) {
      msg.addU32(challengeTimestamp >>> 0)
      msg.addU8(challengeRandom & 0xff)
    }

    const extended = typeof window !== 'undefined' && typeof window.getLoginExtendedData === 'function'
      ? window.getLoginExtendedData()
      : ''
    if (extended && extended.length > 0) {
      msg.addString(extended)
    }

    const raw = msg.getRawBuffer()
    const paddingBytes = rsaSize - (raw.length - offset)
    if (paddingBytes < 0) {
      throw new Error('RSA block is larger than key size.')
    }
    const combined = new Uint8Array(raw.length + paddingBytes)
    combined.set(raw, 0)
    const blockStart = combined.length - rsaSize

    if (protocolInfo.loginEncryption) {
      const encrypted = rsaEncrypt(combined.slice(blockStart), rsaKey)
      combined.set(encrypted, blockStart)
    }

    if (protocolInfo.checksum) {
      this.m_connection.enableChecksum()
    }

    if (typeof window !== 'undefined' && window.__otDebugConnection) {
      const preview = Array.from(combined.slice(0, 20)).map(b => b.toString(16).padStart(2, '0')).join(' ')
      console.log('[ProtocolGame] sendLoginPacket', combined.length, 'bytes', `(${preview}...)`, 'loginSent=', this.m_loginSent)
    }
    this.m_connection.send(combined)

    if (protocolInfo.loginEncryption) {
      this.m_connection.enableXtea(this.m_xteaKey)
    }

    if (protocolInfo.sequencedPackets) {
      this.m_connection.enableSequencedPackets()
    }

    this.m_loginSent = true
  }

  sendEnterGame() {
    const msg = new OutputMessage()
    msg.addU8(GAME_CLIENT_OPCODES.GameClientEnterGame)
    this.m_connection.send(msg.getRawBuffer())
  }

  sendLogout() {
    const msg = new OutputMessage()
    msg.addU8(20) // GameClientLeaveGame
    this.m_connection.send(msg.getRawBuffer())
  }
}
