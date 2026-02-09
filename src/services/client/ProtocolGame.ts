/**
 * ProtocolGame – 1:1 port of OTClient src/client/protocolgame.cpp/h and protocolgamesend.cpp
 * Copyright (c) 2010-2026 OTClient; ported to JS.
 */
import { getConnection, Connection } from '../protocol/connection'
import { generateXteaKey, getRsaKeySize, rsaEncrypt } from '../protocol/crypto'
import { getProtocolInfo, OTSERV_RSA } from '../protocol/protocolInfo'
import { OutputMessage } from '../protocol/outputMessage'
import { InputMessage } from '../protocol/inputMessage'
import { g_game, getGameClientVersion } from './Game'
import { ProtocolGameParse, GAME_CLIENT_OPCODES, ParseContext } from './ProtocolGameParse'

export class ProtocolGame {
  m_accountName: string = ''
  m_accountPassword: string = ''
  m_authenticatorToken: string = ''
  m_sessionKey: string = ''
  m_characterName: string = ''
  m_connection: Connection | null = null
  m_firstRecv: boolean = true
  m_gameInitialized: boolean = false
  m_loginSent: boolean = false
  m_xteaKey: number[] | null = null
  m_protocolGameParser: ProtocolGameParse = new ProtocolGameParse()
  m_lastRecvOpcode: number | null = null

  constructor() {
  }

  /** OTC: ProtocolGame::login – protocolgame.cpp */
  async login(accountName: string, accountPassword: string, host: string, port: number, characterName: string, authenticatorToken: string, sessionKey: string): Promise<any> {
    const protocolInfo = getProtocolInfo(g_game.getClientVersion())
    this.m_accountName = accountName
    this.m_accountPassword = accountPassword
    this.m_authenticatorToken = authenticatorToken
    this.m_sessionKey = sessionKey
    this.m_characterName = characterName
    this.m_connection = getConnection()
    this.m_connection.resetCrypto()
    this.m_connection.enableChecksum(protocolInfo.checksum)
    await this.m_connection.connect(host, port);
    if (!protocolInfo.challengeOnLogin) {
      await this.sendLoginPacket(0, 0)
    }

    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        cleanup()
        resolve({ ok: false, message: 'Server response timeout' })
      }, 15000)

      const cleanup = () => {
        clearTimeout(timeout)
      }

      const resolveOnce = (value: any) => {
        cleanup()
        this.m_gameInitialized = true
        g_game.processLogin()
        resolve(value)
      }

      const onError = (error: any) => {
        cleanup()
        if (this.m_gameInitialized) g_game.processGameEnd()
        resolve({ ok: false, message: error?.message || 'Connection error' })
      }

      const onDisconnect = ({ reason }: { reason?: string } = {}) => {
        cleanup()
        if (this.m_gameInitialized) g_game.processGameEnd()
        resolve({ ok: false, message: reason || 'Connection closed' })
      }

      const onReceive = async (data: any) => {
        console.log(data);
        await this.onRecv(data, { resolveOnce, cleanup, resolve })
      }

      this.m_connection!.on('receive', onReceive)
      this.m_connection!.on('error', onError)
      this.m_connection!.on('disconnect', onDisconnect)
    })
  }

  /** Último opcode recebido (para debug ao desconectar). */
  getLastRecvOpcode() {
    return this.m_lastRecvOpcode
  }

  /** OTC: ProtocolGame::onRecv – protocolgame.cpp */
  async onRecv(data: any, callbacks: any) {
    const { resolveOnce, cleanup, resolve } = callbacks
    const opcode = data && data.length > 0 ? data[0] : null
    this.m_lastRecvOpcode = opcode
    if (typeof window !== 'undefined' && (window as any).__otDebugConnection) {
      const preview = data && data.length > 0 ? Array.from(data.slice(0, 12)).map((b: any) => b.toString(16).padStart(2, '0')).join(' ') : ''
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
        if (size > msg.getUnreadSize()) {
          console.error('[protocol] invalid message size', size, msg.getUnreadSize())
          return
        }
      }
    }

    const ctx: ParseContext = {
      connection: this.m_connection!,
      characterName: this.m_characterName,
      getLoginSent: () => this.m_loginSent,
      getLoginResolved: () => this.m_gameInitialized,
      callbacks: {
        cleanup,
        resolve,
        resolveOnce,
        sendLogin: async (ts: number, rnd: number) => {
          await this.sendLoginPacket(ts, rnd)
        }
      }
    }

    try {
      await this.m_protocolGameParser.parseMessage(msg, ctx)
    } finally {
      // OTC: recv(); - continue receiving even after errors
    }
  }

  /** OTC: ProtocolGame::sendLoginPacket – protocolgamesend.cpp */
  async sendLoginPacket(challengeTimestamp: number, challengeRandom: number) {
    const clientVersion = getGameClientVersion()
    const protocolInfo = getProtocolInfo(clientVersion)
    const rsaKey = OTSERV_RSA
    const rsaSize = getRsaKeySize(rsaKey)
    const msg = new OutputMessage()

    msg.addU8(GAME_CLIENT_OPCODES.GameClientPendingGame)
    msg.addU16(2) // windows
    msg.addU16(protocolInfo.protocolVersion)

    if (protocolInfo.clientVersionFeature) {
      msg.addU32(protocolInfo.clientVersion)
    }

    if (protocolInfo.previewState) {
      msg.addU8(0)
    }

    const rsaOffset = msg.buffer.length
    let xteaKey: number[] | null = null

    if (protocolInfo.loginEncryption) {
      msg.addU8(0)
      xteaKey = generateXteaKey()
      msg.addU32(xteaKey[0])
      msg.addU32(xteaKey[1])
      msg.addU32(xteaKey[2])
      msg.addU32(xteaKey[3])
    }

    msg.addU8(0) // is gm set?

    if (protocolInfo.sessionKey) {
      msg.addString(this.m_sessionKey || '')
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
        msg.addString(this.m_authenticatorToken || '')
      }
    }

    if (protocolInfo.challengeOnLogin) {
      msg.addU32(challengeTimestamp >>> 0)
      msg.addU8(challengeRandom & 0xff)
    }

    let payload: Uint8Array
    if (protocolInfo.loginEncryption) {
      const raw = msg.getRawBuffer()
      const currentSize = raw.length - rsaOffset
      const padding = rsaSize - currentSize
      if (padding < 0) {
        throw new Error('RSA block is larger than key size.')
      }

      // ProtocolGame pads with zeros, not random.
      const combined = new Uint8Array(raw.length + padding)
      combined.set(raw, 0)

      const blockStart = combined.length - rsaSize
      const encrypted = rsaEncrypt(combined.slice(blockStart), rsaKey)
      combined.set(encrypted, blockStart)
      payload = combined
    } else {
      payload = msg.getRawBuffer()
    }

    // Envia e ativa o XTEA imediatamente
    const sendPromise = await this.m_connection!.send(payload)
    if (xteaKey) {
      this.m_connection!.enableXtea(xteaKey)
    }

    this.m_loginSent = true
    return sendPromise
  }

  sendEnterGame() {
    const msg = new OutputMessage()
    msg.addU8(GAME_CLIENT_OPCODES.GameClientEnterGame)
    this.m_connection!.send(msg.getRawBuffer())
  }

  sendLogout() {
    const msg = new OutputMessage()
    msg.addU8(20) // GameClientLeaveGame
    this.m_connection!.send(msg.getRawBuffer())
  }

  // OTC: protocolgamesend.cpp - Walk methods
  sendWalkNorth() {
    if (!this.m_connection) return
    const msg = new OutputMessage()
    msg.addU8(GAME_CLIENT_OPCODES.GameClientWalkNorth)
    this.m_connection.send(msg.getRawBuffer())
  }

  sendWalkEast() {
    if (!this.m_connection) return
    const msg = new OutputMessage()
    msg.addU8(GAME_CLIENT_OPCODES.GameClientWalkEast)
    this.m_connection.send(msg.getRawBuffer())
  }

  sendWalkSouth() {
    if (!this.m_connection) return
    const msg = new OutputMessage()
    msg.addU8(GAME_CLIENT_OPCODES.GameClientWalkSouth)
    this.m_connection.send(msg.getRawBuffer())
  }

  sendWalkWest() {
    if (!this.m_connection) return
    const msg = new OutputMessage()
    msg.addU8(GAME_CLIENT_OPCODES.GameClientWalkWest)
    this.m_connection.send(msg.getRawBuffer())
  }

  sendWalkNorthEast() {
    if (!this.m_connection) return
    const msg = new OutputMessage()
    msg.addU8(GAME_CLIENT_OPCODES.GameClientWalkNortheast)
    this.m_connection.send(msg.getRawBuffer())
  }

  sendWalkSouthEast() {
    if (!this.m_connection) return
    const msg = new OutputMessage()
    msg.addU8(GAME_CLIENT_OPCODES.GameClientWalkSoutheast)
    this.m_connection.send(msg.getRawBuffer())
  }

  sendWalkSouthWest() {
    if (!this.m_connection) return
    const msg = new OutputMessage()
    msg.addU8(GAME_CLIENT_OPCODES.GameClientWalkSouthwest)
    this.m_connection.send(msg.getRawBuffer())
  }

  sendWalkNorthWest() {
    if (!this.m_connection) return
    const msg = new OutputMessage()
    msg.addU8(GAME_CLIENT_OPCODES.GameClientWalkNorthwest)
    this.m_connection.send(msg.getRawBuffer())
  }

  sendStop() {
    if (!this.m_connection) return
    const msg = new OutputMessage()
    msg.addU8(0x69) // Proto::ClientStop
    this.m_connection.send(msg.getRawBuffer())
  }

  // OTC: protocolgamesend.cpp - Turn methods
  sendTurnNorth() {
    if (!this.m_connection) return
    const msg = new OutputMessage()
    msg.addU8(0x6F) // Proto::ClientTurnNorth
    this.m_connection.send(msg.getRawBuffer())
  }

  sendTurnEast() {
    if (!this.m_connection) return
    const msg = new OutputMessage()
    msg.addU8(0x70) // Proto::ClientTurnEast
    this.m_connection.send(msg.getRawBuffer())
  }

  sendTurnSouth() {
    if (!this.m_connection) return
    const msg = new OutputMessage()
    msg.addU8(0x71) // Proto::ClientTurnSouth
    this.m_connection.send(msg.getRawBuffer())
  }

  sendTurnWest() {
    if (!this.m_connection) return
    const msg = new OutputMessage()
    msg.addU8(0x72) // Proto::ClientTurnWest
    this.m_connection.send(msg.getRawBuffer())
  }
}
