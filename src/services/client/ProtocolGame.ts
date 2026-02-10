/**
 * ProtocolGame – 1:1 port of OTClient src/client/protocolgame.cpp/h and protocolgamesend.cpp
 * Copyright (c) 2010-2026 OTClient; ported to JS.
 */
import { getConnection, Connection } from '../protocol/connection'
import { generateXteaKey, getRsaKeySize, rsaEncrypt } from '../protocol/crypto'
import { getProtocolInfo, OTSERV_RSA } from '../protocol/protocolInfo'
import { OutputMessage } from '../protocol/outputMessage'
import { InputMessage } from '../protocol/inputMessage'
import { isFeatureEnabled } from '../protocol/features'
import { g_game, getGameClientVersion } from './Game'
import { ProtocolGameParse, GAME_CLIENT_OPCODES, ParseContext } from './ProtocolGameParse'
import { MessageModeEnum } from './Const'
import { Direction, Position } from './Position'

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

  private addPosition(msg: OutputMessage, pos: Position | { x: number, y: number, z: number }) {
    const x = Number(pos?.x ?? 0) & 0xffff
    const y = Number(pos?.y ?? 0) & 0xffff
    const z = Number(pos?.z ?? 0) & 0xff
    msg.addU16(x)
    msg.addU16(y)
    msg.addU8(z)
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

  /** OTC: ProtocolGame::sendAutoWalk */
  sendAutoWalk(path: number[]) {
    if (!this.m_connection || !Array.isArray(path) || path.length === 0) return

    const steps = path.slice(0, 127)
    const msg = new OutputMessage()
    msg.addU8(GAME_CLIENT_OPCODES.GameClientAutoWalk)
    msg.addU8(steps.length)

    for (const dir of steps) {
      let byte = 0
      switch (dir) {
        case Direction.East:
          byte = 1
          break
        case Direction.NorthEast:
          byte = 2
          break
        case Direction.North:
          byte = 3
          break
        case Direction.NorthWest:
          byte = 4
          break
        case Direction.West:
          byte = 5
          break
        case Direction.SouthWest:
          byte = 6
          break
        case Direction.South:
          byte = 7
          break
        case Direction.SouthEast:
          byte = 8
          break
        default:
          byte = 0
          break
      }
      msg.addU8(byte)
    }

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

  /** OTC: ProtocolGame::sendMove */
  sendMove(fromPos: Position, thingId: number, stackPos: number, toPos: Position, count: number) {
    if (!this.m_connection) return
    const msg = new OutputMessage()
    msg.addU8(GAME_CLIENT_OPCODES.GameClientMove)
    this.addPosition(msg, fromPos)
    msg.addU16(thingId & 0xffff)
    msg.addU8(stackPos & 0xff)
    this.addPosition(msg, toPos)
    if (isFeatureEnabled('GameCountU16')) msg.addU16(Math.max(1, count) & 0xffff)
    else msg.addU8(Math.max(1, count) & 0xff)
    this.m_connection.send(msg.getRawBuffer())
  }

  /** OTC: ProtocolGame::sendUseItem */
  sendUseItem(position: Position, itemId: number, stackPos: number, index: number) {
    if (!this.m_connection) return
    const msg = new OutputMessage()
    msg.addU8(GAME_CLIENT_OPCODES.GameClientUseItem)
    this.addPosition(msg, position)
    msg.addU16(itemId & 0xffff)
    msg.addU8(stackPos & 0xff)
    msg.addU8(index & 0xff)
    this.m_connection.send(msg.getRawBuffer())
  }

  /** OTC: ProtocolGame::sendUseItemWith */
  sendUseItemWith(fromPos: Position, itemId: number, fromStackPos: number, toPos: Position, toThingId: number, toStackPos: number) {
    if (!this.m_connection) return
    const msg = new OutputMessage()
    msg.addU8(GAME_CLIENT_OPCODES.GameClientUseItemWith)
    this.addPosition(msg, fromPos)
    msg.addU16(itemId & 0xffff)
    msg.addU8(fromStackPos & 0xff)
    this.addPosition(msg, toPos)
    msg.addU16(toThingId & 0xffff)
    msg.addU8(toStackPos & 0xff)
    this.m_connection.send(msg.getRawBuffer())
  }

  /** OTC: ProtocolGame::sendUseOnCreature */
  sendUseOnCreature(pos: Position, thingId: number, stackPos: number, creatureId: number) {
    if (!this.m_connection) return
    const msg = new OutputMessage()
    msg.addU8(GAME_CLIENT_OPCODES.GameClientUseOnCreature)
    this.addPosition(msg, pos)
    msg.addU16(thingId & 0xffff)
    msg.addU8(stackPos & 0xff)
    msg.addU32(creatureId >>> 0)
    this.m_connection.send(msg.getRawBuffer())
  }

  /** OTC: ProtocolGame::sendLook */
  sendLook(position: Position, itemId: number, stackPos: number) {
    if (!this.m_connection) return
    const msg = new OutputMessage()
    msg.addU8(GAME_CLIENT_OPCODES.GameClientLook)
    this.addPosition(msg, position)
    msg.addU16(itemId & 0xffff)
    msg.addU8(stackPos & 0xff)
    this.m_connection.send(msg.getRawBuffer())
  }

  /** OTC: ProtocolGame::sendLookCreature */
  sendLookCreature(creatureId: number) {
    if (!this.m_connection) return
    const msg = new OutputMessage()
    msg.addU8(GAME_CLIENT_OPCODES.GameClientLookCreature)
    msg.addU32(creatureId >>> 0)
    this.m_connection.send(msg.getRawBuffer())
  }

  /** OTC: ProtocolGame::sendAttack */
  sendAttack(creatureId: number, seq: number) {
    if (!this.m_connection) return
    const msg = new OutputMessage()
    msg.addU8(GAME_CLIENT_OPCODES.GameClientAttack)
    msg.addU32(creatureId >>> 0)
    if (isFeatureEnabled('GameAttackSeq')) msg.addU32(seq >>> 0)
    this.m_connection.send(msg.getRawBuffer())
  }

  /** OTC: ProtocolGame::sendFollow */
  sendFollow(creatureId: number, seq: number) {
    if (!this.m_connection) return
    const msg = new OutputMessage()
    msg.addU8(GAME_CLIENT_OPCODES.GameClientFollow)
    msg.addU32(creatureId >>> 0)
    if (isFeatureEnabled('GameAttackSeq')) msg.addU32(seq >>> 0)
    this.m_connection.send(msg.getRawBuffer())
  }

  /** OTC: ProtocolGame::sendCancelAttackAndFollow */
  sendCancelAttackAndFollow() {
    if (!this.m_connection) return
    const msg = new OutputMessage()
    msg.addU8(GAME_CLIENT_OPCODES.GameClientCancelAttackAndFollow)
    this.m_connection.send(msg.getRawBuffer())
  }

  /** OTC: ProtocolGame::sendChangeFightModes */
  sendChangeFightModes(fightMode: number, chaseMode: number, safeFight: boolean, pvpMode: number) {
    if (!this.m_connection) return
    const msg = new OutputMessage()
    msg.addU8(GAME_CLIENT_OPCODES.GameClientChangeFightModes)
    msg.addU8(fightMode & 0xff)
    msg.addU8(chaseMode & 0xff)
    msg.addU8(safeFight ? 1 : 0)
    if (isFeatureEnabled('GamePVPMode')) {
      msg.addU8(pvpMode & 0xff)
    }
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

  /** OTC: ProtocolGame::sendTalk */
  sendTalk(mode: number, channelId: number, receiver: string, message: string) {
    if (!this.m_connection) return
    if (!message || message.length === 0) return
    if (message.length > 0xff) return

    const serverMode = this.m_protocolGameParser.translateMessageModeToServer(g_game.getClientVersion(), mode)
    const msg = new OutputMessage()
    msg.addU8(GAME_CLIENT_OPCODES.GameClientTalk)
    msg.addU8(serverMode)

    switch (mode) {
      case MessageModeEnum.MessagePrivateTo:
      case MessageModeEnum.MessageGamemasterPrivateTo:
      case MessageModeEnum.MessageRVRAnswer:
        msg.addString(receiver ?? '')
        break
      case MessageModeEnum.MessageChannel:
      case MessageModeEnum.MessageChannelHighlight:
      case MessageModeEnum.MessageChannelManagement:
      case MessageModeEnum.MessageGamemasterChannel:
        msg.addU16(channelId ?? 0)
        break
      default:
        break
    }

    msg.addString(message)
    this.m_connection.send(msg.getRawBuffer())
  }

  /** OTC: ProtocolGame::sendRequestChannels */
  sendRequestChannels() {
    if (!this.m_connection) return
    const msg = new OutputMessage()
    msg.addU8(GAME_CLIENT_OPCODES.GameClientRequestChannels)
    this.m_connection.send(msg.getRawBuffer())
  }

  /** OTC: ProtocolGame::sendJoinChannel */
  sendJoinChannel(channelId: number) {
    if (!this.m_connection) return
    const msg = new OutputMessage()
    msg.addU8(GAME_CLIENT_OPCODES.GameClientJoinChannel)
    msg.addU16(channelId ?? 0)
    this.m_connection.send(msg.getRawBuffer())
  }

  /** OTC: ProtocolGame::sendLeaveChannel */
  sendLeaveChannel(channelId: number) {
    if (!this.m_connection) return
    const msg = new OutputMessage()
    msg.addU8(GAME_CLIENT_OPCODES.GameClientLeaveChannel)
    msg.addU16(channelId ?? 0)
    this.m_connection.send(msg.getRawBuffer())
  }

  /** OTC: ProtocolGame::sendOpenPrivateChannel */
  sendOpenPrivateChannel(receiver: string) {
    if (!this.m_connection) return
    const msg = new OutputMessage()
    msg.addU8(GAME_CLIENT_OPCODES.GameClientOpenPrivateChannel)
    msg.addString(receiver ?? '')
    this.m_connection.send(msg.getRawBuffer())
  }
}
