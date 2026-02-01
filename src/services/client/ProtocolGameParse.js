/**
 * ProtocolGameParse – 1:1 port of OTClient src/client/protocolgameparse.cpp (ProtocolGame parse methods)
 * Copyright (c) 2010-2026 OTClient; ported to JS.
 * OTC: parseMessage + parse* + getOutfit/getCreature/getPosition/getMappedThing/getThing/getItem/setMapDescription/setFloorDescription/setTileDescription.
 */
import { Connection } from '../protocol/connection.js'
import { generateXteaKey, getRsaKeySize, rsaEncrypt } from '../protocol/crypto.js'
import { getProtocolInfo, OTSERV_RSA } from '../protocol/protocolInfo.js'
import { OutputMessage } from '../protocol/outputMessage.js'
import { InputMessage } from '../protocol/inputMessage.js'
import { getAuthenticatorToken, getLoginContext, getSessionKey } from '../protocol/sessionState.js'
import { DEFAULT_PLAYER } from '../../game/defaultPlayer.js'
import { localPlayer } from '../game/LocalPlayer.js'
import { getThings, loadThings } from '../protocol/things.js'
import { g_map } from './ClientMap.js'
import { isFeatureEnabled, setClientVersion } from '../protocol/features.js'
import {
  g_game,
  getGameClientVersion,
  setServerBeat,
  setCanReportBugs,
  setExpertPvpMode,
} from './Game.js'
import { Creature } from './Creature.js'
import { ThingAttr } from '../things/thingType.js'
import { SkillEnum, MagicEffectsTypeEnum, MessageModeEnum } from './Const.js'

export class ProtocolGameParse {
  getOutfit(msg) {
    const lookType = isFeatureEnabled('GameLooktypeU16') ? msg.getU16() : msg.getU8()
    if (lookType !== 0) {
      const head = msg.getU8(), body = msg.getU8(), legs = msg.getU8(), feet = msg.getU8()
      const addons = isFeatureEnabled('GamePlayerAddons') ? msg.getU8() : 0
      return { lookType, head, body, legs, feet, addons, lookTypeEx: 0 }
    }
    const lookTypeEx = msg.getU16()
    return { lookType: 0, head: 0, body: 0, legs: 0, feet: 0, addons: 0, lookTypeEx }
  }

  getCreature(msg, type) {
    const clientVersion = g_game.getClientVersion()
    const UNKNOWN = 97, OUTDATED = 98, CREATURE_TURN = 99
    if (type === CREATURE_TURN) {
      const creatureId = msg.getU32()
      const direction = msg.getU8()
      const c = g_map.getCreature(creatureId)
      const entry = c?.m_entry ?? c
      if (entry) entry.direction = direction
      return c ? { kind: 'creature', creatureId, id: (entry?.outfit?.lookType ?? c?.outfit?.lookType) || 0, outfit: entry?.outfit ?? c?.outfit, direction: entry?.direction ?? direction, name: entry?.name ?? c?.name ?? '' } : { kind: 'creature', creatureId, id: 0, outfit: null, direction, name: '' }
    }

    let creatureId = 0
    if (type === OUTDATED) {
      creatureId = msg.getU32()
    } else if (type === UNKNOWN) {
      const removeId = msg.getU32()
      creatureId = msg.getU32()
      void removeId
    } else {
      return null
    }

    const name = msg.getString()
    const health = msg.getU8()
    const direction = msg.getU8()
    const outfit = this.getOutfit(msg)
    const light = { intensity: msg.getU8(), color: msg.getU8() }
    const speed = msg.getU16()
    const skull = msg.getU8()
    const shield = msg.getU8()
    const emblem = isFeatureEnabled('GameCreatureEmblems') ? msg.getU8() : 0
    const unpass = (clientVersion >= 854) ? msg.getU8() : 1

    const c = { id: creatureId, name, health, direction, outfit, light, speed, skull, shield, emblem, unpass }
    g_map.upsertCreature(c)
    return { kind: 'creature', creatureId, id: outfit.lookType || 0, outfit, direction, name }
  }

  getPosition(msg) {
    return { x: msg.getU16(), y: msg.getU16(), z: msg.getU8() }
  }

  getMappedThing(msg) {
    const x = msg.getU16()
    if (x !== 0xffff) {
      const y = msg.getU16()
      const z = msg.getU8()
      const stackpos = msg.getU8()
      const pos = { x, y, z }
      const thing = g_map.getThing(pos, stackpos)
      if (!thing) return null
      return {
        thing,
        fromPos: pos,
        stackPos: stackpos,
        creatureId: thing.kind === 'creature' ? (thing.creatureId ?? thing.id) : undefined,
      }
    }

    const creatureId = msg.getU32()
    const creature = g_map.getCreatureById(creatureId)
    if (!creature) return null
    const found = g_map.findCreaturePosition(creatureId)
    if (!found) return null
    const thing = g_map.getThing(found.pos, found.stackPos)
    return {
      thing: thing ?? null,
      fromPos: found.pos,
      stackPos: found.stackPos,
      creatureId,
    }
  }

  getThing(msg) {
    const things = getThings()
    const id = msg.getU16()
    if (id === 97 || id === 98 || id === 99) {
      const c = this.getCreature(msg, id)
      return c || { kind: 'creature', creatureId: 0, id: 0, outfit: null, direction: 0, name: '' }
    }
    const tt = things.types?.getItem(id)
    let subtype = null
    if (tt && (tt.stackable || tt.fluid || tt.splash || tt.chargeable)) {
      subtype = isFeatureEnabled('GameCountU16') ? msg.getU16() : msg.getU8()
    }
    return { kind: 'item', id, subtype }
  }

  getItem(msg) {
    const things = getThings()
    const clientVersion = g_game.getClientVersion()
    const id = msg.getU16()
    const tt = things.types?.getItem(id)

    if (clientVersion < 1281 && isFeatureEnabled('GameThingMarks')) msg.getU8()

    let subtype = null
    if (tt && (tt.isStackable() || tt.isFluidContainer() || tt.isSplash() || tt.isChargeable())) {
      subtype = isFeatureEnabled('GameCountU16') ? msg.getU16() : msg.getU8()
    }

    if (isFeatureEnabled('GameItemAnimationPhase') && tt && tt.getAnimationPhases() > 1) msg.getU8()

    if (tt && tt.m_attribs.has(ThingAttr.Container)) {
      if (isFeatureEnabled('GameContainerTypes')) {
        const containerType = msg.getU8()
        switch (containerType) {
          case 1: msg.getU32(); break
          case 2: msg.getU32(); break
          case 3: msg.getU32(); msg.getU32(); break
          case 4: break
          case 8: msg.getU32(); break
          case 9: msg.getU32(); if (clientVersion >= 1332) msg.getU32(); break
          case 11: msg.getU32(); msg.getU32(); if (clientVersion >= 1332) msg.getU32(); break
          default: break
        }
      } else {
        if (isFeatureEnabled('GameThingQuickLoot')) { const has = msg.getU8(); if (has) msg.getU32(); }
        if (isFeatureEnabled('GameThingQuiver')) { const has = msg.getU8(); if (has) msg.getU32(); }
      }
    }

    return { kind: 'item', id, subtype }
  }

  async parseMessage(msg, ctx) {
    const { connection, getLoginSent, callbacks } = ctx
    const { cleanup, resolve, resolveOnce, sendLogin } = callbacks

    let prevOpcode = -1

    try {
      while (msg.canRead(1)) {
        const opcode = msg.getU8()

        // OTC: if (!GameLoginPending) { if (!m_gameInitialized && opcode > GameServerFirstGameOpcode) processGameStart(); m_gameInitialized = true; }
        if (ctx.getLoginResolved && !ctx.getLoginResolved() && opcode > GAME_SERVER_FIRST_GAME_OPCODE) {
          if (typeof window !== 'undefined') window.__gameConnection = connection
          resolveOnce({ ok: true, player: { ...DEFAULT_PLAYER, name: ctx.characterName } })
        }

        switch (opcode) {
        case GAME_SERVER_OPCODES.GameServerPlayerData:
            this.parsePlayerStats(msg)
            break

        case GAME_SERVER_OPCODES.GameServerPlayerSkills:
            this.parsePlayerSkills(msg)
            break

        case GAME_SERVER_OPCODES.GameServerTalk:
            this.parseTalk(msg)
            break

        case GAME_SERVER_OPCODES.GameServerTextMessage:
            this.parseTextMessage(msg)
            break

        case GAME_SERVER_OPCODES.GameServerGraphicalEffect:
            this.parseMagicEffect(msg)
            break

        case GAME_SERVER_OPCODES.GameServerTakeScreenshot:
            this.parseTakeScreenshot(msg)
            break

        case GAME_SERVER_OPCODES.GameServerPlayerState:
            this.parsePlayerState(msg)
            break

        case GAME_SERVER_OPCODES.GameServerSetInventory:
            this.parseAddInventoryItem(msg)
            break

        case GAME_SERVER_OPCODES.GameServerDeleteInventory:
            this.parseRemoveInventoryItem(msg)
            break

        case GAME_SERVER_OPCODES.GameServerFullMap:
            this.parseMapDescription(msg)
            break

        case GAME_SERVER_OPCODES.GameServerMapTopRow: {
            this.parseMapMoveNorth(msg)
            break
        }

        case GAME_SERVER_OPCODES.GameServerMapRightRow: {
            this.parseMapMoveEast(msg)
            break
        }

        case GAME_SERVER_OPCODES.GameServerMapBottomRow: {
            this.parseMapMoveSouth(msg)
            break
        }

        case GAME_SERVER_OPCODES.GameServerMapLeftRow: {
            this.parseMapMoveWest(msg)
            break
        }

        case GAME_SERVER_OPCODES.GameServerMoveCreature:
            this.parseCreatureMove(msg)
            break

        case GAME_SERVER_OPCODES.GameServerOpenContainer:
            this.parseOpenContainer(msg)
            break

        case GAME_SERVER_OPCODES.GameServerCloseContainer:
            this.parseCloseContainer(msg)
            break

        case GAME_SERVER_OPCODES.GameServerCreatureHealth:
            this.parseCreatureHealth(msg)
            break

        case GAME_SERVER_OPCODES.GameServerCancelWalk:
            this.parseCancelWalk(msg)
            break

        case GAME_SERVER_OPCODES.GameServerWalkWait:
            this.parseWalkWait(msg)
            break

        case GAME_SERVER_OPCODES.GameServerUpdateTile:
            this.parseUpdateTile(msg)
            break

        case GAME_SERVER_OPCODES.GameServerCreateOnMap:
            this.parseTileAddThing(msg)
            break

        case GAME_SERVER_OPCODES.GameServerChangeOnMap:
            this.parseTileTransformThing(msg)
            break

        case GAME_SERVER_OPCODES.GameServerDeleteOnMap:
            this.parseTileRemoveThing(msg)
            break

          case GAME_SERVER_OPCODES.GameServerChallenge: {
            const challenge = this.parseChallenge(msg)
            if (challenge && !getLoginSent()) {
              await sendLogin(challenge.timestamp, challenge.random)
            }
            break
          }

          case GAME_SERVER_OPCODES.GameServerUpdateNeeded:
            const signature = msg.getString()
            cleanup()
            resolve({ ok: false, message: `Update needed: ${signature}` })
            return

          case GAME_SERVER_OPCODES.GameServerLoginError:
            const error = msg.getString()
            cleanup()
            resolve({ ok: false, message: error || 'Login error' })
            return

          case GAME_SERVER_OPCODES.GameServerLoginAdvice:
            msg.getString()
            break

          case GAME_SERVER_OPCODES.GameServerLoginWait:
            const waitMsg = msg.getString()
            const time = msg.getU8()
            cleanup()
            resolve({ ok: false, message: `${waitMsg} (${time}s)` })
            return

          case GAME_SERVER_OPCODES.GameServerSessionEnd:
            const reason = msg.getU8()
            cleanup()
            resolve({ ok: false, message: `Session ended (${reason})` })
            return

          case GAME_SERVER_OPCODES.GameServerPing:
            await connection.send(new Uint8Array([GAME_CLIENT_OPCODES.GameClientPingBack]))
            break

        case GAME_SERVER_OPCODES.GameServerLoginOrPendingState:
            this.parseLogin(msg)
            await connection.send(new Uint8Array([GAME_CLIENT_OPCODES.GameClientEnterGame]))
            break

        case GAME_SERVER_OPCODES.GameServerLoginSuccess:
            this.parseLogin(msg)
            await connection.send(new Uint8Array([GAME_CLIENT_OPCODES.GameClientEnterGame]))
            break

        case GAME_SERVER_OPCODES.GameServerEnterGame:
            this.parseLogin(msg)
            if (typeof window !== 'undefined') window.__gameConnection = connection
            resolveOnce({
              ok: true,
              player: { ...DEFAULT_PLAYER, name: ctx.characterName },
            })
            break

          // case 0x92: // 146 – shop/NPC (skip rest of message; not yet implemented)
          // case 0xaa: // 170 – NPC trade / open (skip rest of message; not yet implemented)
          //   msg.position = msg.buffer.length
          //   break

          case 0xff: // 255 – sentinel / no-op (0 bytes payload)
            break

          default: {
            // OTC default: log unhandled, skip rest of message (setReadPos(getMessageSize()))
            const unread = msg.getUnreadSize()
            const preview = Math.min(unread, 32)
            const hex = Array.from(msg.buffer.subarray(msg.position, msg.position + preview))
              .map(b => b.toString(16).padStart(2, '0'))
              .join(' ')
            console.warn(
              `[protocol] Unhandled opcode 0x${opcode.toString(16)} (${opcode}) with ${unread} unread bytes; prev opcode: 0x${prevOpcode >= 0 ? prevOpcode.toString(16) : '?'} (${prevOpcode}); next bytes: ${hex}`
            )
            msg.position = msg.buffer.length
            break
          }
        }

        prevOpcode = opcode
      }
    } catch (e) {
      const unread = msg.getUnreadSize()
      const hex = Array.from(msg.buffer.subarray(msg.position, msg.position + Math.min(unread, 32)))
        .map(b => b.toString(16).padStart(2, '0'))
        .join(' ')
      console.error(
        `[protocol] parseMessage exception (${msg.buffer.length} bytes, ${unread} unread at pos ${msg.position}, last opcode: 0x${typeof prevOpcode !== 'undefined' && prevOpcode >= 0 ? prevOpcode.toString(16) : '?'} (${prevOpcode})): ${e?.message || e}\nNext bytes: ${hex}`
      )
      msg.position = msg.buffer.length
    }
  }

  parseAddInventoryItem(msg) {
    const slot = msg.getU8()
    const item = this.getItem(msg)
    localPlayer.setInventoryItem(slot, item)
  }

  parseRemoveInventoryItem(msg) {
    const slot = msg.getU8()
    localPlayer.setInventoryItem(slot, null)
  }

  parsePlayerSkills(msg) {
    const clientVersion = g_game.getClientVersion()
    const doubleSkills = isFeatureEnabled('GameDoubleSkills')
    const skillsBase = isFeatureEnabled('GameSkillsBase')
    const baseSkillU16 = isFeatureEnabled('GameBaseSkillU16')
    const additionalSkills = isFeatureEnabled('GameAdditionalSkills')
    const leechAmount = isFeatureEnabled('GameLeechAmount')
    const concotions = isFeatureEnabled('GameConcotions')
    const forgeSkillStats = isFeatureEnabled('GameForgeSkillStats')
    const characterSkillStats = isFeatureEnabled('GameCharacterSkillStats')

    if (clientVersion >= 1281) {
      msg.getU16()
      msg.getU16()
      msg.getU16()
      msg.getU16()
    }

    for (let skill = SkillEnum.SKILL_FIST; skill <= SkillEnum.SKILL_FISHING; skill++) {
      const level = doubleSkills ? msg.getU16() : msg.getU8()
      const baseLevel = skillsBase ? (baseSkillU16 ? msg.getU16() : msg.getU8()) : level
      let levelPercent = 0
      if (clientVersion >= 1281) {
        msg.getU16()
        levelPercent = Math.floor((msg.getU16() || 0) / 100)
      } else {
        levelPercent = msg.getU8()
      }
      localPlayer.setSkill(skill, level, levelPercent)
      localPlayer.setBaseSkill(skill, baseLevel)
    }

    if (additionalSkills) {
      const lifeLeechAmount = 9
      const manaLeechAmount = 10
      for (let skill = 7; skill <= 10; skill++) {
        if (!leechAmount && (skill === lifeLeechAmount || skill === manaLeechAmount)) continue
        const level = msg.getU16()
        const baseLevel = msg.getU16()
        localPlayer.setSkill(skill, level, 0)
        localPlayer.setBaseSkill(skill, baseLevel)
      }
    }

    if (concotions) msg.getU8()

    if (forgeSkillStats) {
      const lastSkill = clientVersion >= 1332 ? 24 : 16
      for (let skill = 11; skill < lastSkill; skill++) {
        const level = msg.getU16()
        const baseLevel = msg.getU16()
        localPlayer.setSkill(skill, level, 0)
        localPlayer.setBaseSkill(skill, baseLevel)
      }
      msg.getU32()
      msg.getU32()
      localPlayer.setTotalCapacity(msg.getU32())
    }

    if (characterSkillStats) {
      msg.getU32()
      msg.getU32()
      localPlayer.setTotalCapacity(msg.getU32())
      msg.getU16()
      msg.getU16()
      msg.getU8()
      msg.getDouble()
      msg.getU8()
      msg.getDouble()
      msg.getDouble()
      msg.getDouble()
      msg.getDouble()
      msg.getDouble()
      msg.getU16()
      msg.getU16()
      if (clientVersion >= 1500) msg.getU16()
      msg.getDouble()
      msg.getDouble()
      msg.getU16()
      const combatsCount = msg.getU8()
      for (let i = 0; i < combatsCount; i++) {
        msg.getU8()
        msg.getDouble()
      }
    }
  }

  buildMessageModesMap(version) {
    const m = {}
    const set = (enumVal, serverByte) => { m[serverByte] = enumVal }

    if (version >= 1055) {
      set(MessageModeEnum.MessageNone, 0)
      set(MessageModeEnum.MessageSay, 1)
      set(MessageModeEnum.MessageWhisper, 2)
      set(MessageModeEnum.MessageYell, 3)
      set(MessageModeEnum.MessagePrivateFrom, 4)
      set(MessageModeEnum.MessagePrivateTo, 5)
      set(MessageModeEnum.MessageChannelManagement, 6)
      set(MessageModeEnum.MessageChannel, 7)
      set(MessageModeEnum.MessageChannelHighlight, 8)
      set(MessageModeEnum.MessageSpell, 9)
      set(MessageModeEnum.MessageNpcFromStartBlock, 10)
      set(MessageModeEnum.MessageNpcFrom, 11)
      set(MessageModeEnum.MessageNpcTo, 12)
      set(MessageModeEnum.MessageGamemasterBroadcast, 13)
      set(MessageModeEnum.MessageGamemasterChannel, 14)
      set(MessageModeEnum.MessageGamemasterPrivateFrom, 15)
      set(MessageModeEnum.MessageGamemasterPrivateTo, 16)
      set(MessageModeEnum.MessageBarkLow, 36)
      set(MessageModeEnum.MessageBarkLoud, 37)
      set(MessageModeEnum.MessagePotion, 52)
      set(MessageModeEnum.MessageGuild, 53)
      set(MessageModeEnum.MessagePartyManagement, 54)
      set(MessageModeEnum.MessageParty, 55)
      set(MessageModeEnum.MessageDamageDealed, 56)
      set(MessageModeEnum.MessageDamageReceived, 57)
      set(MessageModeEnum.MessageDamageOthers, 58)
      set(MessageModeEnum.MessageHeal, 59)
      set(MessageModeEnum.MessageMana, 60)
      set(MessageModeEnum.MessageHealOthers, 61)
      set(MessageModeEnum.MessageExp, 62)
      set(MessageModeEnum.MessageExpOthers, 63)
    } else if (version >= 1041) {
      set(MessageModeEnum.MessageNone, 0)
      set(MessageModeEnum.MessageSay, 1)
      set(MessageModeEnum.MessageWhisper, 2)
      set(MessageModeEnum.MessageYell, 3)
      set(MessageModeEnum.MessagePrivateFrom, 4)
      set(MessageModeEnum.MessagePrivateTo, 5)
      set(MessageModeEnum.MessageChannelManagement, 6)
      set(MessageModeEnum.MessageChannel, 7)
      set(MessageModeEnum.MessageChannelHighlight, 8)
      set(MessageModeEnum.MessageSpell, 9)
      set(MessageModeEnum.MessageNpcFromStartBlock, 10)
      set(MessageModeEnum.MessageNpcFrom, 11)
      set(MessageModeEnum.MessageNpcTo, 12)
      set(MessageModeEnum.MessageGamemasterBroadcast, 13)
      set(MessageModeEnum.MessageGamemasterChannel, 14)
      set(MessageModeEnum.MessageGamemasterPrivateFrom, 15)
      set(MessageModeEnum.MessageGamemasterPrivateTo, 16)
      set(MessageModeEnum.MessageBarkLow, 35)
      set(MessageModeEnum.MessageBarkLoud, 36)
    } else if (version >= 1036) {
      for (let i = 0; i <= 42; i++) set(i, i >= 11 ? i + 1 : i)
    } else if (version >= 900) {
      for (let i = 0; i <= 42; i++) set(i, i)
    } else if (version >= 861) {
      set(MessageModeEnum.MessageNone, 0)
      set(MessageModeEnum.MessageSay, 1)
      set(MessageModeEnum.MessageWhisper, 2)
      set(MessageModeEnum.MessageYell, 3)
      set(MessageModeEnum.MessageNpcTo, 4)
      set(MessageModeEnum.MessageNpcFrom, 5)
      set(MessageModeEnum.MessagePrivateFrom, 6)
      set(MessageModeEnum.MessagePrivateTo, 6)
      set(MessageModeEnum.MessageChannel, 7)
      set(MessageModeEnum.MessageChannelManagement, 8)
      set(MessageModeEnum.MessageGamemasterBroadcast, 9)
      set(MessageModeEnum.MessageGamemasterChannel, 10)
      set(MessageModeEnum.MessageGamemasterPrivateFrom, 11)
      set(MessageModeEnum.MessageGamemasterPrivateTo, 11)
      set(MessageModeEnum.MessageChannelHighlight, 12)
      set(MessageModeEnum.MessageMonsterSay, 13)
      set(MessageModeEnum.MessageMonsterYell, 14)
      set(MessageModeEnum.MessageWarning, 15)
      set(MessageModeEnum.MessageGame, 16)
      set(MessageModeEnum.MessageLogin, 17)
      set(MessageModeEnum.MessageStatus, 18)
      set(MessageModeEnum.MessageLook, 19)
      set(MessageModeEnum.MessageFailure, 20)
      set(MessageModeEnum.MessageBlue, 21)
      set(MessageModeEnum.MessageRed, 22)
    } else if (version >= 840) {
      set(MessageModeEnum.MessageNone, 0)
      set(MessageModeEnum.MessageSay, 1)
      set(MessageModeEnum.MessageWhisper, 2)
      set(MessageModeEnum.MessageYell, 3)
      set(MessageModeEnum.MessageNpcTo, 4)
      set(MessageModeEnum.MessageNpcFromStartBlock, 5)
      set(MessageModeEnum.MessagePrivateFrom, 6)
      set(MessageModeEnum.MessagePrivateTo, 6)
      set(MessageModeEnum.MessageChannel, 7)
      set(MessageModeEnum.MessageChannelManagement, 8)
      set(MessageModeEnum.MessageRVRChannel, 9)
      set(MessageModeEnum.MessageRVRAnswer, 10)
      set(MessageModeEnum.MessageRVRContinue, 11)
      set(MessageModeEnum.MessageGamemasterBroadcast, 12)
      set(MessageModeEnum.MessageGamemasterChannel, 13)
      set(MessageModeEnum.MessageGamemasterPrivateFrom, 14)
      set(MessageModeEnum.MessageGamemasterPrivateTo, 14)
      set(MessageModeEnum.MessageChannelHighlight, 15)
      set(MessageModeEnum.MessageWarning, 21)
      set(MessageModeEnum.MessageGame, 22)
      set(MessageModeEnum.MessageLogin, 23)
      set(MessageModeEnum.MessageStatus, 24)
      set(MessageModeEnum.MessageLook, 25)
      set(MessageModeEnum.MessageFailure, 26)
      set(MessageModeEnum.MessageBlue, 27)
      set(MessageModeEnum.MessageMonsterSay, 19)
      set(MessageModeEnum.MessageMonsterYell, 20)
    } else if (version >= 740) {
      set(MessageModeEnum.MessageNone, 0)
      set(MessageModeEnum.MessageSay, 1)
      set(MessageModeEnum.MessageWhisper, 2)
      set(MessageModeEnum.MessageYell, 3)
      set(MessageModeEnum.MessagePrivateFrom, 4)
      set(MessageModeEnum.MessagePrivateTo, 4)
      set(MessageModeEnum.MessageChannel, 5)
      set(MessageModeEnum.MessageRVRChannel, 6)
      set(MessageModeEnum.MessageRVRAnswer, 7)
      set(MessageModeEnum.MessageRVRContinue, 8)
      set(MessageModeEnum.MessageGamemasterBroadcast, 9)
      set(MessageModeEnum.MessageGamemasterChannel, 10)
      set(MessageModeEnum.MessageGamemasterPrivateFrom, 11)
      set(MessageModeEnum.MessageGamemasterPrivateTo, 11)
      set(MessageModeEnum.MessageChannelHighlight, 12)
      set(MessageModeEnum.MessageMonsterSay, 16)
      set(MessageModeEnum.MessageMonsterYell, 17)
    }
    return m
  }

  translateMessageModeFromServer(version, serverByte) {
    const map = buildMessageModesMap(version)
    return map[serverByte] ?? MessageModeEnum.MessageInvalid
  }

  parseTalk(msg) {
    const messageStatements = isFeatureEnabled('GameMessageStatements')
    const messageLevel = isFeatureEnabled('GameMessageLevel')
    const clientVersion = g_game.getClientVersion()

    let statement = 0
    if (messageStatements) statement = msg.getU32()

    const name = msg.getString()
    if (statement > 0 && clientVersion >= 1281) msg.getU8()
    const level = messageLevel ? msg.getU16() : 0
    const messageByte = msg.getU8()
    const mode = this.translateMessageModeFromServer(clientVersion, messageByte)

    let channelId = 0
    let pos = null

    switch (mode) {
      case MessageModeEnum.MessagePotion:
      case MessageModeEnum.MessageSay:
      case MessageModeEnum.MessageWhisper:
      case MessageModeEnum.MessageYell:
      case MessageModeEnum.MessageMonsterSay:
      case MessageModeEnum.MessageMonsterYell:
      case MessageModeEnum.MessageNpcTo:
      case MessageModeEnum.MessageBarkLow:
      case MessageModeEnum.MessageBarkLoud:
      case MessageModeEnum.MessageSpell:
      case MessageModeEnum.MessageNpcFromStartBlock:
        pos = this.getPosition(msg)
        break
      case MessageModeEnum.MessageChannel:
      case MessageModeEnum.MessageChannelManagement:
      case MessageModeEnum.MessageChannelHighlight:
      case MessageModeEnum.MessageGamemasterChannel:
        channelId = msg.getU16()
        break
      case MessageModeEnum.MessageNpcFrom:
      case MessageModeEnum.MessagePrivateTo:
      case MessageModeEnum.MessagePrivateFrom:
      case MessageModeEnum.MessageGamemasterBroadcast:
      case MessageModeEnum.MessageGamemasterPrivateFrom:
      case MessageModeEnum.MessageRVRAnswer:
      case MessageModeEnum.MessageRVRContinue:
        break
      case MessageModeEnum.MessageRVRChannel:
        msg.getU32()
        break
      default:
        if (mode === MessageModeEnum.MessageInvalid) {
          throw new Error(`parseTalk: unknown message mode ${messageByte}`)
        }
        break
    }

    const text = msg.getString()
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('ot:talk', { detail: { name, level, mode: messageByte, text, channelId, pos } }))
    }
  }

  parseTextMessage(msg) {
    const clientVersion = g_game.getClientVersion()
    const code = msg.getU8()
    const mode = this.translateMessageModeFromServer(clientVersion, code)
    let text = ''
    const detail = { mode: code, text: '' }

    switch (mode) {
      case MessageModeEnum.MessageChannelManagement:
        detail.channelId = msg.getU16()
        text = msg.getString()
        break
      case MessageModeEnum.MessageGuild:
      case MessageModeEnum.MessagePartyManagement:
      case MessageModeEnum.MessageParty:
        detail.channelId = msg.getU16()
        text = msg.getString()
        break
      case MessageModeEnum.MessageDamageDealed:
      case MessageModeEnum.MessageDamageReceived:
      case MessageModeEnum.MessageDamageOthers: {
        detail.pos = this.getPosition(msg)
        detail.damage = [
          { value: msg.getU32(), color: msg.getU8() },
          { value: msg.getU32(), color: msg.getU8() }
        ]
        text = msg.getString()
        break
      }
      case MessageModeEnum.MessageHeal:
      case MessageModeEnum.MessageMana:
      case MessageModeEnum.MessageHealOthers: {
        detail.pos = this.getPosition(msg)
        detail.value = msg.getU32()
        detail.color = msg.getU8()
        text = msg.getString()
        break
      }
      case MessageModeEnum.MessageExp:
      case MessageModeEnum.MessageExpOthers: {
        detail.pos = this.getPosition(msg)
        detail.value = (clientVersion >= 1332) ? msg.getU64() : msg.getU32()
        detail.color = msg.getU8()
        text = msg.getString()
        break
      }
      case MessageModeEnum.MessageInvalid:
        throw new Error(`parseTextMessage: unknown message mode ${code}`)
      default:
        break
    }

    if (text === '' && msg.canRead(1)) {
      text = msg.getString()
    }
    detail.text = text
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('ot:textMessage', { detail }))
    }
  }

  parsePlayerStats(msg) {
    const doubleHealth = isFeatureEnabled('GameDoubleHealth')
    const doubleFreeCap = isFeatureEnabled('GameDoubleFreeCapacity')
    const totalCap = isFeatureEnabled('GameTotalCapacity')
    const doubleExp = isFeatureEnabled('GameDoubleExperience')
    const levelU16 = isFeatureEnabled('GameLevelU16')
    const expBonus = isFeatureEnabled('GameExperienceBonus')
    const skillsBase = isFeatureEnabled('GameSkillsBase')
    const soul = isFeatureEnabled('GameSoul')
    const stamina = isFeatureEnabled('GamePlayerStamina')
    const regen = isFeatureEnabled('GamePlayerRegenerationTime')
    const offlineTrain = isFeatureEnabled('GameOfflineTrainingTime')
    const clientVersion = g_game.getClientVersion()

    const health = doubleHealth ? msg.getU32() : msg.getU16()
    const maxHealth = doubleHealth ? msg.getU32() : msg.getU16()
    let freeCapacity = doubleFreeCap ? msg.getU32() : msg.getU16()
    if (clientVersion > 772) freeCapacity = Math.floor(freeCapacity / 100)

    let totalCapacity = 0
    if (clientVersion < 1281 && totalCap) totalCapacity = msg.getU32() / 100

    const experience = doubleExp ? msg.getU64() : msg.getU32()
    const level = levelU16 ? msg.getU16() : msg.getU8()
    const levelPercent = msg.getU8()

    if (expBonus) {
      if (clientVersion <= 1096) {
        msg.getDouble()
      } else {
        msg.getU16()
        if (clientVersion < 1281) msg.getU16()
        msg.getU16()
        msg.getU16()
        msg.getU16()
        msg.getU16()
      }
    }

    const mana = doubleHealth ? msg.getU32() : msg.getU16()
    const maxMana = doubleHealth ? msg.getU32() : msg.getU16()
    let manaShield = 0
    let maxManaShield = 0

    if (clientVersion < 1281) {
      const magicLevel = msg.getU8()
      const baseMagicLevel = skillsBase ? msg.getU8() : magicLevel
      const magicLevelPercent = msg.getU8()
      localPlayer.setMagicLevel(magicLevel, magicLevelPercent)
      localPlayer.setBaseMagicLevel(baseMagicLevel)
    }

    const soulVal = soul ? msg.getU8() : 0
    const staminaVal = stamina ? msg.getU16() : 0
    const baseSpeed = skillsBase ? msg.getU16() : 0
    const regeneration = regen ? msg.getU16() : 0
    const training = offlineTrain ? msg.getU16() : 0

    if (clientVersion >= 1097) {
      msg.getU16()
      msg.getU8()
    }

    if (clientVersion >= 1281) {
      if (doubleHealth) {
        manaShield = msg.getU32()
        maxManaShield = msg.getU32()
      } else {
        manaShield = msg.getU16()
        maxManaShield = msg.getU16()
      }
    }

    localPlayer.setHealth(health, maxHealth)
    localPlayer.setFreeCapacity(freeCapacity)
    localPlayer.setTotalCapacity(totalCapacity)
    localPlayer.setExperience(experience)
    localPlayer.setLevel(level, levelPercent)
    localPlayer.setMana(mana, maxMana)
    localPlayer.setSoul(soulVal)
    localPlayer.setStamina(staminaVal)
    localPlayer.setRegenerationTime(regeneration)
    localPlayer.setOfflineTrainingTime(training)
  }

  parseCreatureMove(msg) {
    const ref = this.getMappedThing(msg)
    const newPos = this.getPosition(msg)

    if (!ref || !ref.thing || ref.creatureId == null) return
    
    // 1) Obtém a instância da criatura ANTES de limpar o mapa
    let creature = g_map.getCreatureById(ref.creatureId)
    
    // 2) Remove a criatura de sua posição antiga (estática e walking)
    g_map.removeCreatureById(ref.creatureId)

    // 3) Inicia o walk na instância persistente
    if (creature) {
      creature.allowAppearWalk()
      // OTClient: Sempre chama walk() - a lógica de continuidade está dentro de walk()
      creature.walk(ref.fromPos, newPos)
      if (creature.isCameraFollowing()) {
        g_map.notificateCameraMove(creature.getWalkOffset())
      }
    }

    // 4) Atualiza os dados do "thing" (objeto de rede)
    if (ref.thing.kind === 'creature') {
      ref.thing.direction = creature ? Creature.getDirectionFromPosition(ref.fromPos, newPos) : (ref.thing.direction ?? 0)
      // Garante que o creatureId esteja no objeto para que o snapshot do mapa o preserve
      if (ref.creatureId != null) ref.thing.creatureId = ref.creatureId
    }

    // 5) Adiciona ao novo tile como objeto estático (o Tile.js cuidará de esconder se isWalking() for true)
    g_map.addThing(ref.thing, newPos, -1)

    // 6) Notifica os MapViews para atualizar o snapshot e incluir a criatura na lista de walking
    for (const mapView of g_map.m_mapViews) {
      if (mapView.setMapState) {
        mapView.setMapState(g_map.getMapStateForView())
      }
    }
  }

  setTileDescriptionAt(msg, tilePos) {
    const things = getThings()
    const peekU16 = () => msg.buffer[msg.position] | (msg.buffer[msg.position + 1] << 8)
    const readThing = () => {
      const id = msg.getU16()
      if (id === 97 || id === 98 || id === 99) {
        const c = this.getCreature(msg, id)
        return c || { kind: 'creature', creatureId: 0, id: 0, outfit: null, direction: 0, name: '' }
      }
      const tt = things.types?.getItem(id)
      let subtype = null
      if (tt && (tt.stackable || tt.fluid || tt.splash || tt.chargeable)) {
        subtype = isFeatureEnabled('GameCountU16') ? msg.getU16() : msg.getU8()
      }
      return { kind: 'item', id, subtype }
    }
    g_map.cleanTile(tilePos)
    const tile = { pos: { ...tilePos }, things: [] }
    let gotEffect = false
    for (let stackPos = 0; stackPos < 256; stackPos++) {
      if (!msg.canRead(2)) break
      const marker = peekU16()
      if (marker >= 0xff00) {
        msg.getU16()
        g_map.setTile(tilePos, tile)
        return
      }
      if (isFeatureEnabled('GameEnvironmentEffect') && !gotEffect) {
        msg.getU16()
        gotEffect = true
        continue
      }
      const thing = readThing()
      tile.things.push(thing)
    }
    g_map.setTile(tilePos, tile)
  }

  parseUpdateTile(msg) {
    const tilePos = this.getPosition(msg)
    this.setTileDescriptionAt(msg, tilePos)
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('ot:map'))
    }
  }

  parseTileTransformThing(msg) {
    const ref = this.getMappedThing(msg)
    const newThing = this.getThing(msg)
    if (!ref || ref.stackPos == null) return
    const pos = ref.fromPos
    const stackPos = ref.stackPos
    g_map.removeThingByPos(pos, stackPos)
    if (newThing.kind === 'creature' && (newThing.creatureId != null || newThing.id != null)) {
      g_map.upsertCreature({ id: newThing.creatureId ?? newThing.id, name: newThing.name, direction: newThing.direction, outfit: newThing.outfit })
    }
    g_map.addThing(newThing, pos, stackPos)
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('ot:map'))
    }
  }

  parseTileAddThing(msg) {
    const pos = this.getPosition(msg)
    const thing = this.getThing(msg)
    if (thing.kind === 'creature' && (thing.creatureId != null || thing.id != null)) {
      g_map.upsertCreature({ id: thing.creatureId ?? thing.id, name: thing.name, direction: thing.direction, outfit: thing.outfit })
    }
    g_map.addThing(thing, pos)
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('ot:map'))
    }
  }

  parseTileRemoveThing(msg) {
    const ref = this.getMappedThing(msg)
    if (!ref || ref.stackPos == null) return
    g_map.removeThingByPos(ref.fromPos, ref.stackPos)
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('ot:map'))
    }
  }

  parseMagicEffect(msg) {
    this.getPosition(msg)
    const clientVersion = g_game.getClientVersion()
    const protocolVersion = clientVersion
    const effectU16 = isFeatureEnabled('GameEffectU16')

    if (protocolVersion >= 1203) {
      let effectType = msg.getU8()
      while (effectType !== MagicEffectsTypeEnum.MAGIC_EFFECTS_END_LOOP) {
        switch (effectType) {
          case MagicEffectsTypeEnum.MAGIC_EFFECTS_DELAY:
          case MagicEffectsTypeEnum.MAGIC_EFFECTS_DELTA:
            msg.getU8()
            break
          case MagicEffectsTypeEnum.MAGIC_EFFECTS_CREATE_DISTANCEEFFECT:
          case MagicEffectsTypeEnum.MAGIC_EFFECTS_CREATE_DISTANCEEFFECT_REVERSED:
            if (effectU16) msg.getU16()
            else msg.getU8()
            msg.getU8()
            msg.getU8()
            break
          case MagicEffectsTypeEnum.MAGIC_EFFECTS_CREATE_EFFECT:
            if (effectU16) msg.getU16()
            else msg.getU8()
            break
          case MagicEffectsTypeEnum.MAGIC_EFFECTS_CREATE_SOUND_MAIN_EFFECT:
            msg.getU8()
            msg.getU16()
            break
          case MagicEffectsTypeEnum.MAGIC_EFFECTS_CREATE_SOUND_SECONDARY_EFFECT:
            msg.getU8()
            msg.getU8()
            msg.getU16()
            break
          default:
            break
        }
        effectType = msg.getU8()
      }
      return
    }

    const effectId = isFeatureEnabled('GameMagicEffectU16') ? msg.getU16() : msg.getU8()
    if (clientVersion <= 750) {
      void (effectId + 1)
    }
  }

  parseDistanceEffect(msg) {
    this.getPosition(msg)
    this.getPosition(msg)
    const effectId = isFeatureEnabled('GameMagicEffectU16') ? msg.getU16() : msg.getU8()
    void effectId
  }

  parseTakeScreenshot(msg) {
    const screenshotType = msg.getU8()
    let hint = ''
    if (msg.canRead(2)) {
      const len = msg.peekU16()
      const available = msg.getUnreadSize()
      if (len <= available - 2 && len <= 0x7fff) {
        msg.getU16()
        for (let i = 0; i < len && msg.canRead(1); i++) hint += String.fromCharCode(msg.getU8())
      } else {
        while (msg.canRead(1)) {
          const b = msg.getU8()
          if (b === 0) break
          hint += String.fromCharCode(b)
        }
      }
    }
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('ot:takeScreenshot', { detail: { screenshotType, hint } }))
    }
  }

  parsePlayerState(msg) {
    const clientVersion = g_game.getClientVersion()
    const playerStateU16 = isFeatureEnabled('GamePlayerStateU16')
    const playerStateCounter = isFeatureEnabled('GamePlayerStateCounter')

    let states
    if (clientVersion >= 1281) {
      states = clientVersion >= 1405 ? msg.getU64() : msg.getU32()
      if (playerStateCounter) msg.getU8()
    } else {
      states = playerStateU16 ? msg.getU16() : msg.getU8()
    }
    localPlayer.setStates(states)
  }

  parseCreatureHealth(msg) {
    const creatureId = msg.getU32()
    const healthPercent = msg.getU8()
    const creature = this.m_map.getCreatureById(creatureId)
    if (creature && creature.setHealthPercent) creature.setHealthPercent(healthPercent)
  }

  parseOpenContainer(msg) {
    const clientVersion = g_game.getClientVersion()
    const containerPagination = isFeatureEnabled('GameContainerPagination')
    const containerFilter = isFeatureEnabled('GameContainerFilter')

    msg.getU8()
    this.getItem(msg)
    msg.getString()
    msg.getU8()
    msg.getU8()
    if (clientVersion >= 1281) msg.getU8()
    if (containerPagination) {
      msg.getU8()
      msg.getU8()
      msg.getU16()
      msg.getU16()
    }
    const itemCount = msg.getU8()
    for (let i = 0; i < itemCount; i++) this.getItem(msg)
    if (containerFilter) {
      msg.getU8()
      const categoriesSize = msg.getU8()
      for (let i = 0; i < categoriesSize; i++) {
        msg.getU8()
        msg.getString()
      }
    }
    if (clientVersion >= 1340) {
      msg.getU8()
      msg.getU8()
    }
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('ot:containerOpen', { detail: { itemCount } }))
    }
  }

  parseCloseContainer(msg) {
    msg.getU8()
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('ot:containerClose'))
    }
  }

  parseLogin(msg) {
    const clientVersion = g_game.getClientVersion()

    const playerId = msg.getU32()
    const serverBeat = msg.getU16()

    if (isFeatureEnabled('GameNewSpeedLaw')) {
      Creature.speedA = msg.getDouble()
      Creature.speedB = msg.getDouble()
      Creature.speedC = msg.getDouble()
    }

    let canReportBugs = false
    if (!isFeatureEnabled('GameDynamicBugReporter')) {
      canReportBugs = msg.getU8() > 0
    }

    if (clientVersion >= 1054) {
      msg.getU8() // can change pvp frame option
    }

    if (clientVersion >= 1058) {
      const expertModeEnabled = msg.getU8()
      setExpertPvpMode(expertModeEnabled)
    }

    if (isFeatureEnabled('GameIngameStore')) {
      const url = msg.getString()
      const coinsPacketSize = msg.getU16()
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('g_game:onStoreInit', { detail: { url, coinsPacketSize } }))
      }
    }

    if (clientVersion >= 1281) {
      msg.getU8() // exiva button enabled (bool)
      if (isFeatureEnabled('GameTournamentPackets')) {
        msg.getU8() // Tournament button (bool)
      }
    }

    localPlayer.setId(playerId)
    setServerBeat(serverBeat)
    setCanReportBugs(canReportBugs)
    g_game.processLogin()
  }

  parseChallenge(msg) {
    if (!msg.canRead(5)) return null
    const timestamp = msg.getU32()
    const random = msg.getU8()
    return { timestamp, random }
  }

  /** OTC: parseCancelWalk – servidor rejeitou o passo (ex.: tile bloqueado/parede). Payload: 1 byte = direção tentada. */
  parseCancelWalk(msg) {
    const direction = msg.canRead(1) ? msg.getU8() : -1
    localPlayer.cancelWalk(direction)
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('ot:map'))
    }
  }

  parseWalkWait(msg) {
    const millis = msg.canRead(2) ? msg.getU16() : 0
    localPlayer.lockWalk(millis)
  }

  parseMapDescription(msg) {
    const things = getThings()
    const oldPos = g_map.center ? { ...g_map.center } : null
    const pos = { x: msg.getU16(), y: msg.getU16(), z: msg.getU8() }
    g_map.setCenter(pos)

    const { w, h } = g_map.getAwareDims()
    const readThing = () => {
      const id = msg.getU16()
      if (id === 97 || id === 98 || id === 99) { // creature markers (Unknown/Outdated/CreatureTurn)
        const c = this.getCreature(msg, id)
        return c || { kind: 'creature', creatureId: 0, id: 0, outfit: null, direction: 0, name: '' }
      }
      const tt = things.types.getItem(id)
      let subtype = null
      if (tt && (tt.stackable || tt.fluid || tt.splash || tt.chargeable)) {
        subtype = isFeatureEnabled('GameCountU16') ? msg.getU16() : msg.getU8()
      }
      // subtype already consumed above if needed
      return { kind: 'item', id, subtype }
    }
    // 1:1 protocolgameparse.cpp setTileDescription (L1440)
    const setTileDescription = (tilePos) => {
      g_map.cleanTile(tilePos)
      const tile = { pos: tilePos, things: [] }
      let gotEffect = false
      for (let stackPos = 0; stackPos < 256; stackPos++) {
        if (!msg.canRead(2)) break
        const marker = msg.peekU16()
        if (marker >= 0xff00) {
          const skip = msg.getU16() & 0xff
          g_map.setTile(tilePos, tile)
          return skip
        }
        if (isFeatureEnabled('GameEnvironmentEffect') && !gotEffect) {
          msg.getU16()
          gotEffect = true
          continue
        }
        const thing = readThing()
        tile.things.push(thing)
      }
      g_map.setTile(tilePos, tile)
      return 0
    }
    // 1:1 protocolgameparse.cpp setFloorDescription (L1423): offset = z - nz (center - floor)
    const setFloorDescription = (x, y, z, width, height, offset, skip) => {
      for (let nx = 0; nx < width; nx++) {
        for (let ny = 0; ny < height; ny++) {
          const tilePos = { x: x + nx, y: y + ny, z }
          if (skip === 0) {
            skip = setTileDescription(tilePos)
          } else {
            g_map.cleanTile(tilePos)
            skip--
          }
        }
      }
      return skip
    }
    // 1:1 protocolgameparse.cpp setMapDescription (L1398).
    // Offset (z-nz) no C++: andar abaixo fica em (x-1,y-1). Nosso snapshot/MapStore espera (ox+x+dz, oy+y+dz) = baixo-direita para dz>0.
    // Por isso usamos offset = nz - z aqui: andares abaixo (nz>z) ficam em (x+1,y+1) e batem com snapshotFloor.
    const setMapDescription = (x, y, z, width, height) => {
      const seaFloor = 7
      const undergroundAware = 2
      const maxZ = 15
      let startz, endz, zstep
      if (z > seaFloor) {
        startz = Math.max(0, z - undergroundAware)
        endz = Math.min(maxZ, z + undergroundAware)
        zstep = 1
      } else {
        startz = seaFloor
        endz = 0
        zstep = -1
      }
      let skip = 0
      for (let nz = startz; nz !== endz + zstep; nz += zstep) {
        skip = setFloorDescription(x, y, nz, width, height, nz - z, skip)
      }
      return { startz, endz }
    }

    const baseX = pos.x - g_map.range.left
    const baseY = pos.y - g_map.range.top
    const posBefore = msg.position
    const { startz, endz } = setMapDescription(baseX, baseY, pos.z, w, h)
    if (typeof window !== 'undefined' && window.__otDebugMapParse) {
      const bytesRead = msg.position - posBefore
      const bytesLeft = msg.buffer.length - msg.position
      console.debug('[map] pos.z=', pos.z, 'startz=', startz, 'endz=', endz, 'bytesRead=', bytesRead, 'bytesLeft=', bytesLeft)
    }

    const zMin = Math.min(startz, endz)
    const zMax = Math.max(startz, endz)

    // OTC: if (!m_mapKnown) { g_dispatcher.addEvent(onMapKnown); m_mapKnown = true; } addEvent(onMapDescription); onTeleport(localPlayer, pos, oldPos)
    if (!g_map.mapKnown) {
      g_map.m_mapKnown = true
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('ot:mapKnown'))
      }
    }
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('ot:mapDescription'))
      window.dispatchEvent(new CustomEvent('ot:teleport', { detail: { pos, oldPos } }))
    }

    // Detecção de movimento do jogador: se center mudou 1 tile, iniciar walk (OTC: onAppear -> walk).
    if (oldPos && (oldPos.x !== pos.x || oldPos.y !== pos.y || oldPos.z !== pos.z)) {
      const dx = Math.abs(pos.x - oldPos.x)
      const dy = Math.abs(pos.y - oldPos.y)
      const dz = Math.abs(pos.z - oldPos.z)
      if (dx <= 1 && dy <= 1 && dz === 0 && (dx !== 0 || dy !== 0)) {
        const playerId = localPlayer.getId()
        if (playerId != null) {
          const creature = g_map.getCreatureById(playerId)
          if (creature) {
            creature.allowAppearWalk()
            // OTClient: Sempre chama walk() - a lógica de continuidade está dentro de walk()
            creature.walk(oldPos, pos)
            // OTC: if isFollowingCreature() notificateCameraMove
            if (creature.isCameraFollowing()) {
              g_map.notificateCameraMove(creature.getWalkOffset())
            }
          }
        }
      }
      localPlayer.onPositionChange(pos, oldPos)
    }
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('ot:map'))
      if (oldPos && (oldPos.x !== pos.x || oldPos.y !== pos.y || oldPos.z !== pos.z)) {
        window.dispatchEvent(new CustomEvent('ot:mapMove'))
      }
    }
  }

  parseMapSlice(msg, baseX, baseY, z, width, height) {
    const things = getThings()
    const readThing = () => {
      const id = msg.getU16()
      if (id === 97 || id === 98 || id === 99) {
        const c = this.getCreature(msg, id)
        return c || { kind: 'creature', creatureId: 0, id: 0, outfit: null, direction: 0, name: '' }
      }
      const tt = things.types.getItem(id)
      let subtype = null
      if (tt && (tt.stackable || tt.fluid || tt.splash || tt.chargeable)) {
        subtype = isFeatureEnabled('GameCountU16') ? msg.getU16() : msg.getU8()
      }
      return { kind: 'item', id, subtype }
    }
    const setTileDescription = (tilePos) => {
      g_map.cleanTile(tilePos)
      const tile = { pos: tilePos, things: [] }
      let gotEffect = false
      for (let stackPos = 0; stackPos < 256; stackPos++) {
        if (!msg.canRead(2)) break
        const marker = msg.peekU16()
        if (marker >= 0xff00) {
          const skip = msg.getU16() & 0xff
          g_map.setTile(tilePos, tile)
          return skip
        }
        if (isFeatureEnabled('GameEnvironmentEffect') && !gotEffect) {
          msg.getU16()
          gotEffect = true
          continue
        }
        const thing = readThing()
        tile.things.push(thing)
      }
      g_map.setTile(tilePos, tile)
      return 0
    }
    const setFloorDescription = (x, y, z, w, h, offset, skip) => {
      for (let nx = 0; nx < w; nx++) {
        for (let ny = 0; ny < h; ny++) {
          const tilePos = { x: x + nx + offset, y: y + ny + offset, z }
          if (skip === 0) skip = setTileDescription(tilePos)
          else { g_map.cleanTile(tilePos); skip-- }
        }
      }
      return skip
    }
    const seaFloor = 7
    const undergroundAware = 2
    const maxZ = 15
    let startz, endz, zstep
    if (z > seaFloor) {
      startz = Math.max(0, z - undergroundAware)
      endz = Math.min(maxZ, z + undergroundAware)
      zstep = 1
    } else {
      startz = seaFloor
      endz = 0
      zstep = -1
    }
    let skip = 0
    for (let nz = startz; nz !== endz + zstep; nz += zstep) {
      skip = setFloorDescription(baseX, baseY, nz, width, height, nz - z, skip)
    }
  }

  parseMapMoveNorth(msg) {
    const oldCenter = { ...g_map.center }
    const pos = isFeatureEnabled('GameMapMovePosition') ? this.getPosition(msg) : { ...g_map.center }
    pos.y--
    const range = g_map.range
    const { w } = g_map.getAwareDims()
    this.parseMapSlice(msg, pos.x - range.left, pos.y - range.top, pos.z, w, 1)
    g_map.setCenter(pos)
    localPlayer.onPositionChange(pos, oldCenter)
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('ot:mapMove', { detail: { pos, fromPos: oldCenter } }))
    }
  }

  parseMapMoveEast(msg) {
    const oldCenter = { ...g_map.center }
    const pos = isFeatureEnabled('GameMapMovePosition') ? this.getPosition(msg) : { ...g_map.center }
    pos.x++
    const range = g_map.range
    const { h } = g_map.getAwareDims()
    this.parseMapSlice(msg, pos.x + range.right, pos.y - range.top, pos.z, 1, h)
    g_map.setCenter(pos)
    localPlayer.onPositionChange(pos, oldCenter)
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('ot:mapMove', { detail: { pos, fromPos: oldCenter } }))
    }
  }

  parseMapMoveSouth(msg) {
    const oldCenter = { ...g_map.center }
    const pos = isFeatureEnabled('GameMapMovePosition') ? this.getPosition(msg) : { ...g_map.center }
    pos.y++
    const range = g_map.range
    const { w } = g_map.getAwareDims()
    this.parseMapSlice(msg, pos.x - range.left, pos.y + range.bottom, pos.z, w, 1)
    g_map.setCenter(pos)
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('ot:mapMove', { detail: { pos, fromPos: oldCenter } }))
    }
  }

  parseMapMoveWest(msg) {
    const oldCenter = { ...g_map.center }
    const pos = isFeatureEnabled('GameMapMovePosition') ? this.getPosition(msg) : { ...g_map.center }
    pos.x--
    const range = g_map.range
    const { h } = g_map.getAwareDims()
    this.parseMapSlice(msg, pos.x - range.left, pos.y - range.top, pos.z, 1, h)
    g_map.setCenter(pos)
    localPlayer.onPositionChange(pos, oldCenter)
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('ot:mapMove', { detail: { pos, fromPos: oldCenter } }))
    }
  }
}

/** OTC protocolcodes.h – opcodes servidor → cliente (Proto::GameServer*). */
const GAME_SERVER_OPCODES = {
  GameServerMessage: 6,           // 0x06 – mensagem/erro (string); usado por alguns servidores após login
  GameServerLoginOrPendingState: 10,
  GameServerEnterGame: 15,
  GameServerUpdateNeeded: 17,
  GameServerLoginError: 20,
  GameServerLoginAdvice: 21,
  GameServerLoginWait: 22,
  GameServerLoginSuccess: 23,
  GameServerSessionEnd: 24,
  GameServerPingBack: 29,
  GameServerPing: 30,
  GameServerChallenge: 31,
  GameServerFullMap: 100,       // 0x64 – descrição completa do mapa
  GameServerMapTopRow: 101,     // 0x65 – jogador andou norte
  GameServerMapRightRow: 102,   // 0x66 – jogador andou leste
  GameServerMapBottomRow: 103, // 0x67 – jogador andou sul
  GameServerMapLeftRow: 104,   // 0x68 – jogador andou oeste
  GameServerUpdateTile: 105,
  GameServerCreateOnMap: 106,
  GameServerChangeOnMap: 107,
  GameServerDeleteOnMap: 108,
  GameServerMoveCreature: 109,
  GameServerOpenContainer: 110,   // 0x6E – parseOpenContainer
  GameServerCloseContainer: 111,   // 0x6F – parseCloseContainer
  GameServerCreatureHealth: 140,   // 0x8C – parseCreatureHealth
  GameServerCancelWalk: 181,   // 0xB5 – servidor rejeitou o passo (ex.: andar em parede)
  GameServerWalkWait: 182,      // 0xB6 – servidor pede esperar N ms antes de andar
  GameServerPlayerData: 160,   // 0xA0 – parsePlayerStats (health, mana, level, etc.)
  GameServerPlayerSkills: 161,   // 0xA1 – parsePlayerSkills
  GameServerSetInventory: 120,   // 0x78 – parseAddInventoryItem
  GameServerDeleteInventory: 121,   // 0x79 – parseRemoveInventoryItem
  GameServerTalk: 170,            // 0xAA – parseTalk (creature says: name, level, mode, pos/channelId, text)
  GameServerTextMessage: 180,   // 0xB4 – parseTextMessage (system: damage/heal/exp/channel mgmt)
  GameServerGraphicalEffect: 131,   // 0x83 – parseMagicEffect
  GameServerTakeScreenshot: 117,   // 0x75 – parseTakeScreenshot
  GameServerPlayerState: 162,   // 0xA2 – parsePlayerState
}

/** OTC: Proto::GameServerFirstGameOpcode – opcodes > este valor indicam pacotes in-game (mapa, etc.). */
const GAME_SERVER_FIRST_GAME_OPCODE = 50


/** OTC protocolcodes.h – opcodes cliente → servidor (Proto::GameClient*). */
export const GAME_CLIENT_OPCODES = {
  GameClientPendingGame: 10,
  GameClientEnterGame: 15,
  GameClientPing: 29,
  GameClientPingBack: 30,
  GameClientWalkNorth: 0x65,
  GameClientWalkEast: 0x66,
  GameClientWalkSouth: 0x67,
  GameClientWalkWest: 0x68,
  GameClientWalkNortheast: 0x6A,
  GameClientWalkSoutheast: 0x6B,
  GameClientWalkSouthwest: 0x6C,
  GameClientWalkNorthwest: 0x6D,
}

/** OTC Otc::Direction – mapeamento opcode walk → direção (North=0, East=1, South=2, West=3, NE=4, NW=5, SE=6, SW=7). */
export const OPCODE_TO_DIRECTION = {
  [GAME_CLIENT_OPCODES.GameClientWalkNorth]: 0,
  [GAME_CLIENT_OPCODES.GameClientWalkEast]: 1,
  [GAME_CLIENT_OPCODES.GameClientWalkSouth]: 2,
  [GAME_CLIENT_OPCODES.GameClientWalkWest]: 3,
  [GAME_CLIENT_OPCODES.GameClientWalkNortheast]: 4,
  [GAME_CLIENT_OPCODES.GameClientWalkNorthwest]: 5,
  [GAME_CLIENT_OPCODES.GameClientWalkSoutheast]: 6,
  [GAME_CLIENT_OPCODES.GameClientWalkSouthwest]: 7,
}

/**
 * Envia comando de movimento ao servidor (Tibia: opcode 0x65–0x68, 0x6A–0x6D).
 * Igual ao OTC: só envia o pacote; o walk é iniciado quando o servidor responde (0x64 ou 0x65–0x68).
 * OTC forceWalk() apenas chama sendWalkNorth() etc. – não faz preWalk para WASD manual.
 * @param {number} direction - GAME_CLIENT_OPCODES.GameClientWalk* (North, East, South, West ou diagonal)
 */
export function sendMove(direction) {
  const conn = typeof window !== 'undefined' ? window.__gameConnection : null
  if (!conn) return
  const msg = new OutputMessage()
  msg.addU8(direction & 0xff)
  conn.send(msg.getRawBuffer()).catch(() => { })
}
