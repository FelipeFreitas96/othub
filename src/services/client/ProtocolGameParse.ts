/**
 * ProtocolGameParse – 1:1 port of OTClient src/client/protocolgameparse.cpp (ProtocolGame parse methods)
 * Copyright (c) 2010-2026 OTClient; ported to JS.
 * OTC: parseMessage + parse* + getOutfit/getCreature/getPosition/getMappedThing/getThing/getItem/setMapDescription/setFloorDescription/setTileDescription.
 */
import { Connection } from '../protocol/connection'
import { generateXteaKey, getRsaKeySize, rsaEncrypt } from '../protocol/crypto'
import { getProtocolInfo, OTSERV_RSA } from '../protocol/protocolInfo'
import { OutputMessage } from '../protocol/outputMessage'
import { InputMessage } from '../protocol/inputMessage'
import { getAuthenticatorToken, getLoginContext, getSessionKey } from '../protocol/sessionState'
import { DEFAULT_PLAYER } from '../../game/defaultPlayer'
import { g_player } from './LocalPlayer'
import { getThings, loadThings } from '../protocol/things'
import { g_map } from './ClientMap'
import { isFeatureEnabled, setClientVersion } from '../protocol/features'
import {
  g_game,
  getGameClientVersion,
  setServerBeat,
  setCanReportBugs,
  setExpertPvpMode,
} from './Game'
import { Creature } from './Creature'
import { Player } from './Player'
import { g_dispatcher } from '../framework/EventDispatcher'
import { ThingAttr, ThingCategory } from '../things/thingType'
import { SkillEnum, MagicEffectsTypeEnum, MessageModeEnum } from './Const'
import { Position, Outfit, Thing } from './types'
import { Item } from './Item'
import { Effect } from './Effect'
import { Missile } from './Missile'
import { AnimatedText } from './AnimatedText'

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
  GameServerCreateContainer: 112,  // 0x70 – parseContainerAddItem
  GameServerChangeInContainer: 113, // 0x71 – parseContainerUpdateItem
  GameServerDeleteInContainer: 114, // 0x72 – parseContainerRemoveItem
  GameServerDeath: 123,           // 0x7B – parseDeath
  GameServerAmbient: 130,          // 0x82 – parseWorldLight (luz global: dia/subterrâneo)
  GameServerGraphicalEffect: 131,   // 0x83 – parseMagicEffect
  GameServerTextEffect: 132,       // 0x84 – parseRemoveMagicEffect (>=1320) or parseAnimatedText
  GameServerMissleEffect: 133,     // 0x85 – parseDistanceMissile (or parseAnthem)
  GameServerCreatureData: 139,     // 0x8B – parseCreatureData
  GameServerCreatureHealth: 140,   // 0x8C – parseCreatureHealth
  GameServerCreatureLight: 141,    // 0x8D – parseCreatureLight
  GameServerCreatureOutfit: 142,   // 0x8E – parseCreatureOutfit
  GameServerCreatureSpeed: 143,    // 0x8F – parseCreatureSpeed
  GameServerCreatureSkull: 144,    // 0x90 – parseCreatureSkulls
  GameServerCreatureParty: 145,    // 0x91 – parseCreatureShields
  GameServerCreatureUnpass: 146,   // 0x92 – parseCreatureUnpass
  GameServerCreatureMarks: 147,    // 0x93 – parseCreaturesMark
  GameServerCreatureType: 149,    // 0x95 – parseCreatureType
  GameServerPlayerData: 160,   // 0xA0 – parsePlayerStats (health, mana, level, etc.)
  GameServerPlayerSkills: 161,   // 0xA1 – parsePlayerSkills
  GameServerPlayerState: 162,   // 0xA2 – parsePlayerState
  GameServerClearTarget: 163,     // 0xA3 – parsePlayerCancelAttack
  GameServerTalk: 170,            // 0xAA – parseTalk (creature says: name, level, mode, pos/channelId, text)
  GameServerTextMessage: 180,   // 0xB4 – parseTextMessage (system: damage/heal/exp/channel mgmt)
  GameServerCancelWalk: 181,   // 0xB5 – servidor rejeitou o passo (ex.: andar em parede)
  GameServerWalkWait: 182,      // 0xB6 – servidor pede esperar N ms antes de andar
  GameServerFloorChangeUp: 190,    // 0xBE – parseFloorChangeUp
  GameServerFloorChangeDown: 191,  // 0xBF – parseFloorChangeDown
  GameServerSetInventory: 120,   // 0x78 – parseAddInventoryItem
  GameServerDeleteInventory: 121,   // 0x79 – parseRemoveInventoryItem
  GameServerTakeScreenshot: 117,   // 0x75 – parseTakeScreenshot
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
export const OPCODE_TO_DIRECTION: Record<number, number> = {
  [GAME_CLIENT_OPCODES.GameClientWalkNorth]: 0,
  [GAME_CLIENT_OPCODES.GameClientWalkEast]: 1,
  [GAME_CLIENT_OPCODES.GameClientWalkSouth]: 2,
  [GAME_CLIENT_OPCODES.GameClientWalkWest]: 3,
  [GAME_CLIENT_OPCODES.GameClientWalkNortheast]: 4,
  [GAME_CLIENT_OPCODES.GameClientWalkNorthwest]: 5,
  [GAME_CLIENT_OPCODES.GameClientWalkSoutheast]: 6,
  [GAME_CLIENT_OPCODES.GameClientWalkSouthwest]: 7,
}

export interface ParseContext {
  connection: Connection
  characterName: string
  getLoginSent: () => boolean
  getLoginResolved: () => boolean
  callbacks: {
    cleanup: () => void
    resolve: (value: any) => void
    resolveOnce: (value: any) => void
    sendLogin: (ts: number, rnd: number) => Promise<void>
  }
}

export class ProtocolGameParse {
  getOutfit(msg: InputMessage): Outfit {
    const lookType = isFeatureEnabled('GameLooktypeU16') ? msg.getU16() : msg.getU8()
    if (lookType !== 0) {
      const head = msg.getU8(), body = msg.getU8(), legs = msg.getU8(), feet = msg.getU8()
      const addons = isFeatureEnabled('GamePlayerAddons') ? msg.getU8() : 0
      return { lookType, head, body, legs, feet, addons, lookTypeEx: 0 }
    }
    const lookTypeEx = msg.getU16()
    return { lookType: 0, head: 0, body: 0, legs: 0, feet: 0, addons: 0, lookTypeEx }
  }

  /** OTC: Proto::UnknownCreature, OutdatedCreature, Creature (turn). */
  static readonly Proto = {
    UnknownCreature: 97,
    OutdatedCreature: 98,
    Creature: 99,
  } as const

  /** OTC: Proto::CreatureType* for clientVersion >= 910. */
  static readonly CreatureType = {
    Player: 0,
    Monster: 1,
    Npc: 2,
    Hidden: 3,
    SummonOwn: 4,
    SummonOther: 5,
  } as const

  /** OTC: PlayerStartId/EndId, MonsterStartId/EndId – used when clientVersion < 910 to derive creature type from id. */
  static readonly ProtoIdRange = {
    PlayerStartId: 0x10000000,
    PlayerEndId: 0x20000000,
    MonsterStartId: 0x40000000,
    MonsterEndId: 0x50000000,
  } as const

  /** OTC: getPaperdoll(msg) – reads one paperdoll entry. Stub: no-op (GameCreaturePaperdoll). */
  getPaperdoll(_msg: InputMessage): unknown {
    return {}
  }

  // 1:1 ProtocolGame::getCreature – protocolgameparse.cpp
  getCreature(msg: InputMessage, type: number): Creature | null {
    if (type === 0) type = msg.getU16()

    const clientVersion = g_game.getClientVersion()
    const { Proto, CreatureType, ProtoIdRange } = ProtocolGameParse
    let creature: Creature | null = null
    const known = type !== Proto.UnknownCreature

    if (type === Proto.OutdatedCreature || type === Proto.UnknownCreature) {
      if (known) {
        const creatureId = msg.getU32()
        creature = g_map.getCreatureById(creatureId) as Creature | null
        if (!creature) {
          // Desync recovery: rebuild known-creature map entry from tile stack when possible.
          const found = g_map.findCreaturePosition?.(creatureId)
          if (found) {
            const thing = g_map.getThing(new Position(found.pos.x, found.pos.y, found.pos.z), found.stackPos)
            if (thing?.isCreature?.()) {
              creature = thing as Creature
              g_map.addCreature(creature)
            }
          }

          // If still missing, create a placeholder creature so subsequent packets stay in sync.
          if (!creature) {
            creature = Number(creatureId) === Number(g_player.getId())
              ? g_player
              : new Creature({ id: creatureId, name: '' })
            creature.onCreate?.()
            creature.setId(creatureId)
            g_map.addCreature(creature)
          }
        }
      } else {
        const removeId = msg.getU32()
        const id = msg.getU32()

        if (id === removeId) {
          creature = g_map.getCreatureById(id) as Creature | null
        } else {
          g_map.removeCreatureById(removeId)
        }

        let creatureType: number
        if (clientVersion >= 910) {
          creatureType = msg.getU8()
        } else {
          if (id >= ProtoIdRange.PlayerStartId && id < ProtoIdRange.PlayerEndId) creatureType = CreatureType.Player
          else if (id >= ProtoIdRange.MonsterStartId && id < ProtoIdRange.MonsterEndId) creatureType = CreatureType.Monster
          else creatureType = CreatureType.Npc
        }

        let masterId = 0
        if (clientVersion >= 1281 && creatureType === CreatureType.SummonOwn) {
          masterId = msg.getU32()
          if (Number(g_player.getId()) !== masterId) creatureType = CreatureType.SummonOther
        }

        const name = g_game.formatCreatureName(msg.getString())

        if (!creature) {
          if (
            Number(id) === Number(g_player.getId()) ||
            (creatureType === CreatureType.Player && !g_player.getId() && name === g_player.getName())
          ) {
            creature = g_player
          } else {
            switch (creatureType) {
              case CreatureType.Player:
                creature = new Player()
                break
              case CreatureType.Npc:
                creature = new Creature({ id, name })
                break
              case CreatureType.Hidden:
              case CreatureType.Monster:
              case CreatureType.SummonOwn:
              case CreatureType.SummonOther:
                creature = new Creature({ id, name })
                break
              default:
                console.warn('ProtocolGame::getCreature: creature type is invalid')
            }
            if (creature) creature.onCreate?.()
          }
        }

        if (creature) {
          creature.setId(id)
          creature.setName(name)
          creature.setMasterId(masterId)
          g_map.addCreature(creature)
        }
      }

      const healthPercent = msg.getU8()
      const direction = msg.getU8()
      const outfit = this.getOutfit(msg)
      const light = { intensity: msg.getU8(), color: msg.getU8() }
      const speed = msg.getU16()

      if (clientVersion >= 1281) this.addCreatureIcon(msg, creature?.getId() as number)

      const skull = msg.getU8()
      const shield = msg.getU8()

      let emblem = 0
      let creatureTypeMark = 0
      let icon = 0
      let unpass = true

      if (isFeatureEnabled('GameCreatureEmblems') && !known) emblem = msg.getU8()
      if (isFeatureEnabled('GameThingMarks')) creatureTypeMark = msg.getU8()

      let masterId = 0
      if (clientVersion >= 1281) {
        if (creatureTypeMark === CreatureType.SummonOwn) {
          masterId = msg.getU32()
          if (Number(g_player.getId()) !== masterId) creatureTypeMark = CreatureType.SummonOther
        } else if (creatureTypeMark === CreatureType.Player) {
          const vocationId = msg.getU8()
          if (creature && creature.isPlayer?.()) (creature as Player).setVocation(vocationId)
        }
      }

      if (isFeatureEnabled('GameCreatureIcons')) icon = msg.getU8()
      if (isFeatureEnabled('GameThingMarks')) {
        const mark = msg.getU8()
        if (clientVersion < 1281) msg.getU16()
        if (creature) {
          if (mark === 0xff) (creature as any).hideStaticSquare?.()
          else (creature as any).showStaticSquare?.(mark)
        }
      }
      if (clientVersion >= 1281) msg.getU8()
      if (clientVersion >= 854) unpass = msg.getU8() !== 0
      if (isFeatureEnabled('GameCreaturePaperdoll')) {
        const size = msg.getU8()
        for (let i = 0; i < size; i++) {
          const paperdoll = this.getPaperdoll(msg)
          if (creature) (creature as any).attachPaperdoll?.(paperdoll)
        }
      }
      let shader = ''
      if (isFeatureEnabled('GameCreatureShader')) shader = msg.getString()
      const attachedEffectList: number[] = []
      if (isFeatureEnabled('GameCreatureAttachedEffect')) {
        const listSize = msg.getU8()
        for (let i = 0; i < listSize; i++) attachedEffectList.push(msg.getU16())
      }

      if (creature) {
        creature.setHealthPercent(healthPercent)
        creature.turn(direction)
        creature.setOutfit(outfit)
        creature.setSpeed(speed)
        creature.setSkull(skull)
        creature.setShield(shield)
        creature.setPassable(!unpass)
        creature.setLight(light)
        creature.setMasterId(masterId)
          ; (creature as any).setShader?.(shader)
          ; (creature as any).clearTemporaryAttachedEffects?.()
        for (const effectId of attachedEffectList) {
          ; (creature as any).attachEffect?.(effectId)
        }
        if (emblem > 0) creature.setEmblem(emblem)
        if (creatureTypeMark > 0) (creature as any).setType?.(creatureTypeMark)
        if (icon > 0) (creature as any).setIcon?.(icon)
        if (creature === g_player && !g_player.isKnown()) g_player.setKnown(true)
      }
    } else if (type === Proto.Creature) {
      const creatureId = msg.getU32()
      creature = g_map.getCreatureById(creatureId) as Creature | null
      if (!creature) console.warn('ProtocolGame::getCreature: invalid creature')

      const direction = msg.getU8()
      if (creature) creature.turn(direction)

      if (clientVersion >= 953) {
        const unpass = msg.getU8() !== 0
        if (creature) creature.setPassable(!unpass)
      }
    } else {
      throw new Error('ProtocolGame::getCreature: invalid creature opcode')
    }

    return creature
  }

  getPosition(msg: InputMessage): Position {
    return new Position(msg.getU16(), msg.getU16(), msg.getU8())
  }

  // 1:1 protocolgameparse.cpp getMappedThing (L3808)
  // When lookup by (pos, stackpos) fails (stack order differs client vs server), fallback: single creature on tile or local player on that tile.
  getMappedThing(msg: InputMessage): Thing | null {
    const x = msg.getU16()
    if (x !== 0xffff) {
      const y = msg.getU16()
      const z = msg.getU8()
      const stackpos = msg.getU8()
      const pos = new Position(x, y, z)
      const thing = g_map.getThing(pos, stackpos)
      const tile = g_map.getTile(pos)
      const creatures = tile?.m_things?.filter((t) => t.isCreature?.()) ?? []
      if (thing) {
        if (thing.isCreature?.()) return thing
        if (creatures.length === 1) return creatures[0]
        if (tile?.m_things?.some((t) => t === g_player)) return g_player
        if (creatures.length > 1) return creatures[0]
      }
      if (tile?.m_things?.length) {
        if (creatures.length === 1) return creatures[0]
        if (tile.m_things.some((t) => t === g_player)) return g_player
        if (creatures.length > 1) return creatures[0]
      }
    } else {
      const creatureId = msg.getU32()
      const thing = g_map.getCreatureById(creatureId)
      if (thing) return thing
      const found = g_map.findCreaturePosition(creatureId)
      if (found) return g_map.getThing(new Position(found.pos.x, found.pos.y, found.pos.z), found.stackPos)
    }
    return null
  }

  // 1:1 protocolgameparse.cpp getThing (L3794)
  getThing(msg: InputMessage): Thing | null {
    const things = getThings()
    const id = msg.getU16()
    if (id === 0) {
      throw new Error('ProtocolGame::getThing: invalid thing id')
    }
    if (id === 97 || id === 98 || id === 99) {
      return this.getCreature(msg, id)
    }
    const tt = things.types?.getItem(id)
    let subtype = 1
    if (tt && (tt.isStackable() || tt.isFluidContainer() || tt.isSplash() || tt.isChargeable())) {
      subtype = isFeatureEnabled('GameCountU16') ? msg.getU16() : msg.getU8()
    }
    return new Item({ id, subtype }, things.types)
  }

  getItem(msg: InputMessage): Item | null {
    const things = getThings()
    const clientVersion = g_game.getClientVersion()
    const id = msg.getU16()
    const tt = things.types?.getItem(id)

    if (clientVersion < 1281 && isFeatureEnabled('GameThingMarks')) msg.getU8()

    let subtype = 1
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

    return new Item({ id, subtype }, things.types)
  }

  async parseMessage(msg: InputMessage, ctx: ParseContext) {
    const { connection, getLoginSent, callbacks } = ctx
    const { cleanup, resolve, resolveOnce, sendLogin } = callbacks

    let prevOpcode = -1

    try {
      while (msg.canRead(1)) {
        const opcode = msg.getU8()

        // OTC: if (!GameLoginPending) { if (!m_gameInitialized && opcode > GameServerFirstGameOpcode) processGameStart(); m_gameInitialized = true; }
        if (ctx.getLoginResolved && !ctx.getLoginResolved() && opcode > GAME_SERVER_FIRST_GAME_OPCODE) {
          if (typeof window !== 'undefined') (window as any).__gameConnection = connection
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

          case GAME_SERVER_OPCODES.GameServerTextEffect:
            if (g_game.getClientVersion() >= 1320) this.parseRemoveMagicEffect(msg)
            else this.parseAnimatedText(msg)
            break

          case GAME_SERVER_OPCODES.GameServerMissleEffect:
            this.parseDistanceMissile(msg)
            break

          case GAME_SERVER_OPCODES.GameServerAmbient:
            this.parseWorldLight(msg)
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

          case GAME_SERVER_OPCODES.GameServerCreateContainer:
            this.parseContainerAddItem(msg)
            break

          case GAME_SERVER_OPCODES.GameServerChangeInContainer:
            this.parseContainerUpdateItem(msg)
            break

          case GAME_SERVER_OPCODES.GameServerDeleteInContainer:
            this.parseContainerRemoveItem(msg)
            break

          case GAME_SERVER_OPCODES.GameServerDeath:
            this.parseDeath(msg)
            break

          case GAME_SERVER_OPCODES.GameServerCreatureData:
            this.parseCreatureData(msg)
            break

          case GAME_SERVER_OPCODES.GameServerCreatureHealth:
            this.parseCreatureHealth(msg)
            break

          case GAME_SERVER_OPCODES.GameServerCreatureLight:
            this.parseCreatureLight(msg)
            break

          case GAME_SERVER_OPCODES.GameServerCreatureOutfit:
            this.parseCreatureOutfit(msg)
            break

          case GAME_SERVER_OPCODES.GameServerCreatureSpeed:
            this.parseCreatureSpeed(msg)
            break

          case GAME_SERVER_OPCODES.GameServerCreatureSkull:
            this.parseCreatureSkull(msg)
            break

          case GAME_SERVER_OPCODES.GameServerCreatureParty:
            this.parseCreatureShields(msg)
            break

          case GAME_SERVER_OPCODES.GameServerCreatureUnpass:
            this.parseCreatureUnpass(msg)
            break

          case GAME_SERVER_OPCODES.GameServerCreatureMarks:
            this.parseCreaturesMark(msg)
            break

          case GAME_SERVER_OPCODES.GameServerCreatureType:
            this.parseCreatureType(msg)
            break

          case GAME_SERVER_OPCODES.GameServerClearTarget:
            this.parsePlayerCancelAttack(msg)
            break

          case GAME_SERVER_OPCODES.GameServerCancelWalk:
            this.parseCancelWalk(msg)
            break

          case GAME_SERVER_OPCODES.GameServerWalkWait:
            this.parseWalkWait(msg)
            break

          case GAME_SERVER_OPCODES.GameServerFloorChangeUp:
            this.parseFloorChangeUp(msg)
            break

          case GAME_SERVER_OPCODES.GameServerFloorChangeDown:
            this.parseFloorChangeDown(msg)
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
            if (typeof window !== 'undefined') (window as any).__gameConnection = connection
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
    } catch (e: any) {
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

  parseAddInventoryItem(msg: InputMessage) {
    const slot = msg.getU8()
    const item = this.getItem(msg)
    g_player.setInventoryItem(slot, item)
  }

  parseRemoveInventoryItem(msg: InputMessage) {
    const slot = msg.getU8()
    g_player.setInventoryItem(slot, null)
  }

  parsePlayerSkills(msg: InputMessage) {
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
      g_player.setSkill(skill, level, levelPercent)
      g_player.setBaseSkill(skill, baseLevel)
    }

    if (additionalSkills) {
      const lifeLeechAmount = 9
      const manaLeechAmount = 10
      for (let skill = 7; skill <= 10; skill++) {
        if (!leechAmount && (skill === lifeLeechAmount || skill === manaLeechAmount)) continue
        const level = msg.getU16()
        const baseLevel = msg.getU16()
        g_player.setSkill(skill, level, 0)
        g_player.setBaseSkill(skill, baseLevel)
      }
    }

    if (concotions) msg.getU8()

    if (forgeSkillStats) {
      const lastSkill = clientVersion >= 1332 ? 24 : 16
      for (let skill = 11; skill < lastSkill; skill++) {
        const level = msg.getU16()
        const baseLevel = msg.getU16()
        g_player.setSkill(skill, level, 0)
        g_player.setBaseSkill(skill, baseLevel)
      }
      msg.getU32()
      msg.getU32()
      g_player.setTotalCapacity(msg.getU32())
    }

    if (characterSkillStats) {
      msg.getU32()
      msg.getU32()
      g_player.setTotalCapacity(msg.getU32())
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

  buildMessageModesMap(version: number) {
    const m: Record<number, number> = {}
    const set = (enumVal: number, serverByte: number) => { m[serverByte] = enumVal }

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

  translateMessageModeFromServer(version: number, serverByte: number) {
    const map = this.buildMessageModesMap(version)
    return map[serverByte] ?? MessageModeEnum.MessageInvalid
  }

  parseTalk(msg: InputMessage) {
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
    let pos: Position | null = null

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

  parseTextMessage(msg: InputMessage) {
    const clientVersion = g_game.getClientVersion()
    const code = msg.getU8()
    const mode = this.translateMessageModeFromServer(clientVersion, code)
    let text = ''
    const detail: any = { mode: code, text: '' }

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

  parsePlayerStats(msg: InputMessage) {
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
      g_player.setMagicLevel(magicLevel, magicLevelPercent)
      g_player.setBaseMagicLevel(baseMagicLevel)
    }

    const soulVal = soul ? msg.getU8() : 0
    const staminaVal = stamina ? msg.getU16() : 0
    // @ts-ignore
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

    g_player.setHealth(health, maxHealth)
    g_player.setFreeCapacity(freeCapacity)
    g_player.setTotalCapacity(totalCapacity)
    g_player.setExperience(experience)
    g_player.setLevel(level, levelPercent)
    g_player.setMana(mana, maxMana)
    g_player.setSoul(soulVal)
    g_player.setStamina(staminaVal)
    g_player.setRegenerationTime(regeneration)
    g_player.setOfflineTrainingTime(training)
  }

  // 1:1 protocolgameparse.cpp parseCreatureMove (L1494)
  parseCreatureMove(msg: InputMessage) {
    const thing = this.getMappedThing(msg)
    const newPos = this.getPosition(msg)

    if (!thing || !thing.isCreature()) {
      console.error("ProtocolGame::parseCreatureMove: no creature found to move");
      return
    }

    const creature = thing as Creature
    if (!g_map.removeThing(thing)) {
      console.error("ProtocolGame::parseCreatureMove: unable to remove creature");
      return
    }

    creature.allowAppearWalk()
    g_map.addThing(thing, newPos, -1)
  }

  setTileDescriptionAt(msg: InputMessage, tilePos: Position) {
    const things = getThings()
    const peekU16 = () => msg.buffer[msg.position] | (msg.buffer[msg.position + 1] << 8)
    const readThing = () => {
      const id = msg.getU16()
      if (id === 97 || id === 98 || id === 99) {
        return this.getCreature(msg, id)
      }
      const tt = things.types?.getItem(id)
      let subtype = 1
      if (tt && (tt.isStackable() || tt.isFluidContainer() || tt.isSplash() || tt.isChargeable())) {
        subtype = isFeatureEnabled('GameCountU16') ? msg.getU16() : msg.getU8()
      }
      return new Item({ id, subtype }, things.types)
    }
    g_map.cleanTile(tilePos)
    let gotEffect = false
    for (let stackPos = 0; stackPos < 256; stackPos++) {
      if (!msg.canRead(2)) break
      const marker = peekU16()
      if (marker >= 0xff00) {
        msg.getU16()
        return
      }
      if (isFeatureEnabled('GameEnvironmentEffect') && !gotEffect) {
        msg.getU16()
        gotEffect = true
        continue
      }
      const thing = readThing()
      if (thing?.isCreature?.() && thing.getId?.() === g_player.getId?.()) {
        g_player.resetPreWalk?.()
      }
      if (thing) g_map.addThing(thing, tilePos, stackPos)
    }
  }

  parseUpdateTile(msg: InputMessage) {
    const tilePos = this.getPosition(msg)
    this.setTileDescriptionAt(msg, tilePos)
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('ot:map'))
    }
  }

  // 1:1 protocolgameparse.cpp parseTileTransformThing (L1461)
  parseTileTransformThing(msg: InputMessage) {
    const thing = this.getMappedThing(msg)
    const newThing = this.getThing(msg)

    if (!thing) {
      // Desync is normal - thing might have been removed
      return
    }

    const pos = thing.isCreature() ? (thing as Creature).getPosition() : null
    const stackPos = pos ? g_map.getThingStackPos(pos, thing) : -1

    // Try to remove, continue even if failed (desync)
    g_map.removeThing(thing)

    if (newThing && pos) {
      if (newThing.isCreature()) {
        const c = newThing as Creature
        g_map.upsertCreature(c)
      }
      g_map.addThing(newThing, pos, stackPos)
    }
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('ot:map'))
    }
  }

  parseTileAddThing(msg: InputMessage) {
    const pos = this.getPosition(msg)
    const thing = this.getThing(msg)
    if (!thing) return
    if (thing.isCreature()) {
      const c = thing as Creature
      g_map.upsertCreature(c)
    }
    g_map.addThing(thing, pos)
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('ot:map'))
    }
  }

  // 1:1 protocolgameparse.cpp parseTileRemoveThing (L1482)
  parseTileRemoveThing(msg: InputMessage) {
    const thing = this.getMappedThing(msg)
    if (!thing) {
      // Desync is normal - thing might already be removed
      return
    }

    // Try to remove, ignore if already gone
    g_map.removeThing(thing)

    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('ot:map'))
    }
  }

  /** OTC ProtocolGame::parseWorldLight – opcode GameServerAmbient (0x82). Luz global (dia/subterrâneo). */
  parseWorldLight(msg: InputMessage) {
    const oldLight = g_map.getLight()
    const intensity = msg.getU8()
    const color = msg.getU8()
    g_map.setLight({ intensity, color })
    if (typeof window !== 'undefined' && (oldLight.intensity !== intensity || oldLight.color !== color)) {
      window.dispatchEvent(new CustomEvent('ot:worldLightChange', { detail: { light: g_map.getLight(), oldLight } }))
    }
  }

  /** OTC: ProtocolGame::parseMagicEffect – opcode 0x83. */
  parseMagicEffect(msg: InputMessage) {
    const pos = this.getPosition(msg)
    const clientVersion = g_game.getClientVersion()
    const protocolVersion = (g_game as any).getProtocolVersion?.() ?? clientVersion
    const effectU16 = isFeatureEnabled('GameEffectU16')
    const types = getThings()?.types

    if (protocolVersion >= 1203) {
      let effectType = msg.getU8()
      while (effectType !== MagicEffectsTypeEnum.MAGIC_EFFECTS_END_LOOP) {
        switch (effectType) {
          case MagicEffectsTypeEnum.MAGIC_EFFECTS_DELAY:
          case MagicEffectsTypeEnum.MAGIC_EFFECTS_DELTA:
            msg.getU8()
            break
          case MagicEffectsTypeEnum.MAGIC_EFFECTS_CREATE_DISTANCEEFFECT:
          case MagicEffectsTypeEnum.MAGIC_EFFECTS_CREATE_DISTANCEEFFECT_REVERSED: {
            const shotId = effectU16 ? msg.getU16() : msg.getU8()
            const toSigned8 = (b: number) => (b > 127 ? b - 256 : b)
            const offsetX = toSigned8(msg.getU8())
            const offsetY = toSigned8(msg.getU8())
            if (types && !types.isValidDatId(shotId, ThingCategory.Missile)) break
            const missile = new Missile()
            missile.setId(shotId)
            if (effectType === MagicEffectsTypeEnum.MAGIC_EFFECTS_CREATE_DISTANCEEFFECT) {
              missile.setPath(pos, new Position(pos.x + offsetX, pos.y + offsetY, pos.z))
            } else {
              missile.setPath(new Position(pos.x + offsetX, pos.y + offsetY, pos.z), pos)
            }
            g_map.addThing(missile, pos)
            break
          }
          case MagicEffectsTypeEnum.MAGIC_EFFECTS_CREATE_EFFECT: {
            const effectId = effectU16 ? msg.getU16() : msg.getU8()
            if (types && !types.isValidDatId(effectId, ThingCategory.Effect)) break
            const effect = new Effect()
            effect.setId(effectId)
            g_map.addThing(effect, pos)
            break
          }
          case MagicEffectsTypeEnum.MAGIC_EFFECTS_CREATE_SOUND_MAIN_EFFECT:
            msg.getU8()
            msg.getU16()
            break
          case MagicEffectsTypeEnum.MAGIC_EFFECTS_CREATE_SOUND_SECONDARY_EFFECT:
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

    let effectId = isFeatureEnabled('GameMagicEffectU16') ? msg.getU16() : msg.getU8()
    if (clientVersion <= 750) effectId += 1
    if (types && !types.isValidDatId(effectId, ThingCategory.Effect)) return
    const effect = new Effect()
    effect.setId(effectId)
    g_map.addThing(effect, pos)
  }

  /** OTC: ProtocolGame::parseRemoveMagicEffect – opcode 0x84 when clientVersion >= 1320. */
  parseRemoveMagicEffect(msg: InputMessage) {
    const pos = this.getPosition(msg)
    const effectId = isFeatureEnabled('GameEffectU16') ? msg.getU16() : msg.getU8()
    if (!getThings()?.types?.isValidDatId(effectId, ThingCategory.Effect)) return
    const tile = g_map.getTile(pos)
    if (!tile) return
    const effect = tile.m_things?.find((t) => t.isEffect?.() && t.getId?.() === effectId)
    if (effect) g_map.removeThing(effect)
  }

  /** OTC: ProtocolGame::parseAnimatedText – opcode 0x84 when clientVersion < 1320. */
  parseAnimatedText(msg: InputMessage) {
    const position = this.getPosition(msg)
    const color = msg.getU8()
    const text = msg.getString()
    g_map.addAnimatedText(new AnimatedText(text, color), position)
  }

  /** OTC: ProtocolGame::parseDistanceMissile – opcode 0x85. */
  parseDistanceMissile(msg: InputMessage) {
    const fromPos = this.getPosition(msg)
    const toPos = this.getPosition(msg)
    const shotId = isFeatureEnabled('GameDistanceEffectU16') ? msg.getU16() : msg.getU8()
    if (!getThings()?.types?.isValidDatId(shotId, ThingCategory.Missile)) return
    const missile = new Missile()
    missile.setId(shotId)
    missile.setPath(fromPos, toPos)
    g_map.addThing(missile, fromPos)
  }

  parseDistanceEffect(msg: InputMessage) {
    this.getPosition(msg)
    this.getPosition(msg)
    const effectId = isFeatureEnabled('GameMagicEffectU16') ? msg.getU16() : msg.getU8()
    void effectId
  }

  parseTakeScreenshot(msg: InputMessage) {
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

  parsePlayerState(msg: InputMessage) {
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
    g_player.setStates(Number(states))
  }

  /** OTC: ProtocolGame::parseCreatureData – opcode 0x8B (139). */
  parseCreatureData(msg: InputMessage) {
    const creatureId = msg.getU32()
    const type = msg.getU8()
    const creature = g_map.getCreatureById(creatureId)
    if (!creature && typeof console !== 'undefined') {
      console.debug?.('ProtocolGame::parseCreatureData: could not get creature with id', creatureId)
    }
    switch (type) {
      case 0: // creature update
        this.getCreature(msg, 0)
        break
      case 11: // creature mana percent
      case 12: // creature show status
      case 13: // player vocation
        this.setCreatureVocation(msg, creatureId)
        break
      case 14: // creature icons
        this.addCreatureIcon(msg, creatureId)
        break
      default:
        break
    }
  }

  /** OTC: ProtocolGame::setCreatureVocation – creatureData type 11/12/13. */
  setCreatureVocation(msg: InputMessage, creatureId: number) {
    const creature = g_map.getCreatureById(creatureId)
    if (!creature) return
    const vocationId = msg.getU8()
    creature.setVocation?.(vocationId)
  }

  /** OTC: ProtocolGame::addCreatureIcon – creatureData type 14. */
  addCreatureIcon(msg: InputMessage, creatureId: number) {
    const creature = g_map.getCreatureById(creatureId)
    if (!creature) {
      if (typeof console !== 'undefined') console.debug?.('ProtocolGame::addCreatureIcon: could not get creature with id', creatureId)
      return
    }
    const sizeIcons = msg.getU8()
    const icons: Array<{ icon: number; category: number; count: number }> = []
    for (let i = 0; i < sizeIcons; i++) {
      icons.push({
        icon: msg.getU8(),
        category: msg.getU8(),
        count: msg.getU16(),
      })
    }
    creature.setIcons?.(icons)
  }

  parseCreatureHealth(msg: InputMessage) {
    const creatureId = msg.getU32()
    const healthPercent = msg.getU8()
    const creature = g_map.getCreatureById(creatureId)
    if (creature && creature.setHealthPercent) creature.setHealthPercent(healthPercent)
  }

  /** OTC: parseCreatureLight – opcode 0x8D (141). */
  parseCreatureLight(msg: InputMessage) {
    const creatureId = msg.getU32()
    const intensity = msg.getU8()
    const color = msg.getU8()
    const creature = g_map.getCreatureById(creatureId)
    if (creature) creature.setLight({ intensity, color })
  }

  /** OTC: parseCreatureOutfit – opcode 0x8E (142). */
  parseCreatureOutfit(msg: InputMessage) {
    const creatureId = msg.getU32()
    const outfit = this.getOutfit(msg)
    const creature = g_map.getCreatureById(creatureId)
    if (creature) creature.setOutfit(outfit)
  }

  /** OTC: parseCreatureSpeed – opcode 0x8F (143). */
  parseCreatureSpeed(msg: InputMessage) {
    const creatureId = msg.getU32()
    const clientVersion = g_game.getClientVersion()
    const baseSpeed = clientVersion >= 1059 ? msg.getU16() : 0
    const speed = msg.getU16()
    const creature = g_map.getCreatureById(creatureId)
    if (creature) {
      creature.setSpeed(speed)
      if (baseSpeed !== 0) creature.setBaseSpeed(baseSpeed)
    }
  }

  /** OTC: parseCreatureSkulls – opcode 0x90 (144). */
  parseCreatureSkull(msg: InputMessage) {
    const creatureId = msg.getU32()
    const skull = msg.getU8()
    const creature = g_map.getCreatureById(creatureId)
    if (creature) creature.setSkull(skull)
  }

  /** OTC: parseCreatureShields – opcode 0x91 (145). */
  parseCreatureShields(msg: InputMessage) {
    const creatureId = msg.getU32()
    const shield = msg.getU8()
    const creature = g_map.getCreatureById(creatureId)
    if (creature) creature.setShield(shield)
  }

  /** OTC: parseCreatureUnpass – opcode 0x92 (146). */
  parseCreatureUnpass(msg: InputMessage) {
    const creatureId = msg.getU32()
    const unpass = msg.getU8()
    const creature = g_map.getCreatureById(creatureId)
    if (creature) creature.setPassable(!unpass)
  }

  /** OTC: parseCreaturesMark – opcode 0x93 (147). */
  parseCreaturesMark(msg: InputMessage) {
    const creatureId = msg.getU32()
    const clientVersion = g_game.getClientVersion()
    const isPermanent = clientVersion >= 1076 ? msg.getU8() !== 0 : false
    const markType = msg.getU8()
    const creature = g_map.getCreatureById(creatureId)
    if (!creature) return
    if (markType === 0xff) (creature as any).hideStaticSquare?.()
    else if (isPermanent) (creature as any).showStaticSquare?.(markType)
    else (creature as any).addTimedSquare?.(markType)
  }

  /** OTC: parseCreatureType – opcode 0x95 (149). */
  parseCreatureType(msg: InputMessage) {
    const creatureId = msg.getU32()
    const type = msg.getU8()
    const creature = g_map.getCreatureById(creatureId)
    if (creature && creature.setType) creature.setType(type)
  }

  /** OTC: parsePlayerCancelAttack – opcode 0xA3 (163). */
  parsePlayerCancelAttack(msg: InputMessage) {
    if (msg.canRead(1)) msg.getU8()
    g_player.setAttackTarget?.(null)
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('ot:clearTarget'))
    }
  }

  parseOpenContainer(msg: InputMessage) {
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

  parseCloseContainer(msg: InputMessage) {
    msg.getU8()
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('ot:containerClose'))
    }
  }

  /** OTC: parseDeath – opcode 0x7B (123). */
  parseDeath(msg: InputMessage) {
    const clientVersion = g_game.getClientVersion()
    const deathType = isFeatureEnabled('GameDeathType') ? msg.getU8() : 0
    const penalty = (isFeatureEnabled('GamePenalityOnDeath') && deathType !== 0) ? msg.getU8() : 0
    if (clientVersion >= 1281) msg.getU8() // can use death redemption
    g_game.processDeath?.(deathType, penalty)
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('ot:death', { detail: { deathType, penalty } }))
    }
  }

  /** OTC: parseContainerAddItem – opcode 0x70 (112). */
  parseContainerAddItem(msg: InputMessage) {
    const containerId = msg.getU8()
    const slot = isFeatureEnabled('GameContainerPagination') ? msg.getU16() : 0
    const item = this.getItem(msg)
    g_game.processContainerAddItem?.(containerId, item, slot)
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('ot:containerAddItem', { detail: { containerId, slot, item } }))
    }
  }

  /** OTC: parseContainerUpdateItem – opcode 0x71 (113). */
  parseContainerUpdateItem(msg: InputMessage) {
    const containerId = msg.getU8()
    const slot = isFeatureEnabled('GameContainerPagination') ? msg.getU16() : msg.getU8()
    const item = this.getItem(msg)
    g_game.processContainerUpdateItem?.(containerId, slot, item)
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('ot:containerUpdateItem', { detail: { containerId, slot, item } }))
    }
  }

  /** OTC: parseContainerRemoveItem – opcode 0x72 (114). */
  parseContainerRemoveItem(msg: InputMessage) {
    const containerId = msg.getU8()
    const slot = isFeatureEnabled('GameContainerPagination') ? msg.getU16() : msg.getU8()
    let lastItem: Item | null = null
    if (isFeatureEnabled('GameContainerPagination')) {
      const itemId = msg.getU16()
      if (itemId !== 0) lastItem = this.getItem(msg)
    }
    g_game.processContainerRemoveItem?.(containerId, slot, lastItem)
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('ot:containerRemoveItem', { detail: { containerId, slot, lastItem } }))
    }
  }

  parseLogin(msg: InputMessage) {
    const clientVersion = g_game.getClientVersion()

    const playerId = msg.getU32()
    const serverBeat = msg.getU16()

    if (isFeatureEnabled('GameNewSpeedLaw')) {
      Creature.speedA = msg.getDouble()
      Creature.speedB = msg.getDouble()
      Creature.speedC = msg.getDouble()
    } else {
      Creature.speedA = 0
      Creature.speedB = 0
      Creature.speedC = 0
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
      setExpertPvpMode(!!expertModeEnabled)
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

    g_player.setId(playerId)
    setServerBeat(serverBeat)
    setCanReportBugs(canReportBugs)
    g_game.processLogin()
  }

  parseChallenge(msg: InputMessage) {
    if (!msg.canRead(5)) return null
    const timestamp = msg.getU32()
    const random = msg.getU8()
    return { timestamp, random }
  }

  /** OTC: parseCancelWalk – servidor rejeitou o passo (ex.: tile bloqueado/parede). Payload: 1 byte = direção tentada. */
  parseCancelWalk(msg: InputMessage) {
    const direction = msg.canRead(1) ? msg.getU8() : -1
    g_player.cancelWalk(direction)
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('ot:map'))
    }
  }

  parseWalkWait(msg: InputMessage) {
    const millis = msg.canRead(2) ? msg.getU16() : 0
    g_player.lockWalk(millis)
  }

  /** OTC: read one floor from msg (setFloorDescription for single z, offset 0). Used by parseFloorChangeUp/Down. */
  _parseFloorDescriptionFromMessage(msg: InputMessage, baseX: number, baseY: number, z: number, width: number, height: number): void {
    const things = getThings()
    const readThing = () => {
      const id = msg.getU16()
      if (id === 97 || id === 98 || id === 99) return this.getCreature(msg, id)
      const tt = things.types.getItem(id)
      let subtype = 1
      if (tt && (tt.stackable || tt.fluid || tt.splash || tt.chargeable)) {
        subtype = isFeatureEnabled('GameCountU16') ? msg.getU16() : msg.getU8()
      }
      return new Item({ id, subtype }, things.types)
    }
    const setTileDescription = (tilePos: Position) => {
      const tile = g_map.getOrCreateTile(tilePos)
      if (!tile) return 0
      tile.m_things = []
      let gotEffect = false
      for (let stackPos = 0; stackPos < 256; stackPos++) {
        if (!msg.canRead(2)) break
        if (msg.peekU16() >= 0xff00) {
          const skip = msg.getU16() & 0xff
          return skip
        }
        if (isFeatureEnabled('GameEnvironmentEffect') && !gotEffect) {
          msg.getU16()
          gotEffect = true
          continue
        }
        const thing = readThing()
        if (thing) tile.m_things.push(thing)
      }
      return 0
    }
    let skip = 0
    for (let nx = 0; nx < width; nx++) {
      for (let ny = 0; ny < height; ny++) {
        const tilePos = new Position(baseX + nx, baseY + ny, z)
        if (skip === 0) skip = setTileDescription(tilePos)
        else { g_map.cleanTile(tilePos); skip-- }
      }
    }
  }

  /** OTC: parseFloorChangeUp – opcode 0xBE (190). */
  parseFloorChangeUp(msg: InputMessage) {
    const pos = isFeatureEnabled('GameMapMovePosition') ? this.getPosition(msg) : g_map.getCentralPosition()
    const newZ = pos.z - 1
    const range = g_map.range
    const { w, h } = g_map.getAwareDims()
    const baseX = pos.x - range.left
    const baseY = pos.y - range.top
    this._parseFloorDescriptionFromMessage(msg, baseX, baseY, newZ, w, h)
    const newPos = new Position(pos.x + 1, pos.y + 1, newZ)
    g_map.setCentralPosition(newPos)
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('ot:teleport', { detail: { pos: newPos } }))
    }
  }

  /** OTC: parseFloorChangeDown – opcode 0xBF (191). */
  parseFloorChangeDown(msg: InputMessage) {
    const pos = isFeatureEnabled('GameMapMovePosition') ? this.getPosition(msg) : g_map.getCentralPosition()
    const newZ = pos.z + 1
    const range = g_map.range
    const { w, h } = g_map.getAwareDims()
    const baseX = pos.x - range.left
    const baseY = pos.y - range.top
    this._parseFloorDescriptionFromMessage(msg, baseX, baseY, newZ, w, h)
    const newPos = new Position(pos.x - 1, pos.y - 1, newZ)
    g_map.setCentralPosition(newPos)
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('ot:teleport', { detail: { pos: newPos } }))
    }
  }

  /** OTC ProtocolGame::parseMapDescription – protocolgameparse.cpp L1383-1404. */
  parseMapDescription(msg: InputMessage) {
    const things = getThings()
    const pos = this.getPosition(msg)
    const oldPos = g_player.getPosition ? g_player.getPosition() : (g_map.center ? g_map.center.clone() : null)
    if (!g_map.mapKnown) {
      const c = g_map.getCreatureById(g_player.getId() as number)
      if (c) c.setPosition(pos)
    }
    g_map.setCentralPosition(pos)

    // OTC: walk is triggered in Creature::onAppear when addThing is called; allow walk if 1-tile move
    if (oldPos && (oldPos.x !== pos.x || oldPos.y !== pos.y || oldPos.z !== pos.z)) {
      const dx = Math.abs(pos.x - oldPos.x)
      const dy = Math.abs(pos.y - oldPos.y)
      if (dx <= 1 && dy <= 1 && (dx !== 0 || dy !== 0)) {
        const c = g_map.getCreatureById(g_player.getId() as number)
        if (c) c.allowAppearWalk()
      }
    }

    const { w, h } = g_map.getAwareDims()
    const readThing = () => {
      const id = msg.getU16()
      if (id === 97 || id === 98 || id === 99) { // creature markers (Unknown/Outdated/CreatureTurn)
        return this.getCreature(msg, id)
      }
      const tt = things.types.getItem(id)
      let subtype = 1
      if (tt && (tt.isStackable() || tt.isFluidContainer() || tt.isSplash() || tt.isChargeable())) {
        subtype = isFeatureEnabled('GameCountU16') ? msg.getU16() : msg.getU8()
      }
      // subtype already consumed above if needed
      return new Item({ id, subtype }, things.types)
    }
    // 1:1 protocolgameparse.cpp setTileDescription (L3696-3725): cleanTile(position); for each thing getThing(msg); if local player resetPreWalk(); addThing(thing, position, stackPos)
    const setTileDescription = (tilePos: Position) => {
      g_map.cleanTile(tilePos)
      let gotEffect = false
      for (let stackPos = 0; stackPos < 256; stackPos++) {
        if (!msg.canRead(2)) break
        if (msg.peekU16() >= 0xff00) {
          const skip = msg.getU16() & 0xff
          return skip
        }
        if (isFeatureEnabled('GameEnvironmentEffect') && !gotEffect) {
          msg.getU16()
          gotEffect = true
          continue
        }
        const thing = readThing()
        if (thing?.isCreature?.() && thing.getId?.() === g_player.getId?.()) {
          g_player.resetPreWalk?.()
        }
        if (thing) g_map.addThing(thing, tilePos, stackPos)
      }
      return 0
    }
    // 1:1 protocolgameparse.cpp setFloorDescription (L1423): offset = z - nz (center - floor)
    const setFloorDescription = (x: number, y: number, z: number, width: number, height: number, offset: number, skip: number) => {
      for (let nx = 0; nx < width; nx++) {
        for (let ny = 0; ny < height; ny++) {
          const tilePos = new Position(x + nx + offset, y + ny + offset, z)
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
    // 1:1 protocolgameparse.cpp setMapDescription (L1398): offset = z - nz.
    const setMapDescription = (x: number, y: number, z: number, width: number, height: number) => {
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
        skip = setFloorDescription(x, y, nz, width, height, z - nz, skip)
      }
      return { startz, endz }
    }

    const baseX = pos.x - g_map.range.left
    const baseY = pos.y - g_map.range.top
    const posBefore = msg.position
    const { startz, endz } = setMapDescription(baseX, baseY, pos.z, w, h)
    if (typeof window !== 'undefined' && (window as any).__otDebugMapParse) {
      const bytesRead = msg.position - posBefore
      const bytesLeft = msg.buffer.length - msg.position
      console.debug('[map] pos.z=', pos.z, 'startz=', startz, 'endz=', endz, 'bytesRead=', bytesRead, 'bytesLeft=', bytesLeft)
    }

    // @ts-ignore
    const zMin = Math.min(startz, endz)
    // @ts-ignore
    const zMax = Math.max(startz, endz)

    // OTC: if (!m_mapKnown) { g_dispatcher.addEvent(onMapKnown); m_mapKnown = true; } addEvent(onMapDescription); callGlobalField(onTeleport)
    if (!g_map.mapKnown) {
      g_dispatcher.addEvent(() => {
        if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('ot:mapKnown'))
      })
        ; (g_map as any).m_mapKnown = true
    }
    g_dispatcher.addEvent(() => {
      if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('ot:mapDescription'))
    })
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('ot:teleport', { detail: { pos, oldPos } }))
    }

    // OTC: movement sync for creatures comes from addThing/onAppear and map center updates.
    // Avoid extra server-position callbacks here to prevent duplicate walk/camera corrections.
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('ot:map'))
    }
  }

  parseMapSlice(msg: InputMessage, baseX: number, baseY: number, z: number, width: number, height: number) {
    const things = getThings()
    const readThing = () => {
      const id = msg.getU16()
      if (id === 97 || id === 98 || id === 99) {
        return this.getCreature(msg, id)
      }
      const tt = things.types.getItem(id)
      let subtype = 1
      if (tt && (tt.isStackable() || tt.isFluidContainer() || tt.isSplash() || tt.isChargeable())) {
        subtype = isFeatureEnabled('GameCountU16') ? msg.getU16() : msg.getU8()
      }
      return new Item({ id, subtype }, things.types)
    }
    const setTileDescription = (tilePos: Position) => {
      g_map.cleanTile(tilePos)
      let gotEffect = false
      for (let stackPos = 0; stackPos < 256; stackPos++) {
        if (!msg.canRead(2)) break
        const marker = msg.peekU16()
        if (marker >= 0xff00) {
          const skip = msg.getU16() & 0xff
          return skip
        }
        if (isFeatureEnabled('GameEnvironmentEffect') && !gotEffect) {
          msg.getU16()
          gotEffect = true
          continue
        }
        const thing = readThing()
        if (thing?.isCreature?.() && thing.getId?.() === g_player.getId?.()) {
          g_player.resetPreWalk?.()
        }
        if (thing) g_map.addThing(thing, tilePos, stackPos)
      }
      return 0
    }
    const setFloorDescription = (x: number, y: number, z: number, w: number, h: number, offset: number, skip: number) => {
      for (let nx = 0; nx < w; nx++) {
        for (let ny = 0; ny < h; ny++) {
          const tilePos = new Position(x + nx + offset, y + ny + offset, z)
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
      skip = setFloorDescription(baseX, baseY, nz, width, height, z - nz, skip)
    }
  }

  parseMapMoveNorth(msg: InputMessage) {
    const oldCenter = g_map.center.clone()
    const pos = isFeatureEnabled('GameMapMovePosition') ? this.getPosition(msg) : g_map.center.clone()
    pos.y--
    const range = g_map.range
    const { w } = g_map.getAwareDims()
    this.parseMapSlice(msg, pos.x - range.left, pos.y - range.top, pos.z, w, 1)
    g_map.setCenter(pos)
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('ot:mapMove', { detail: { pos, fromPos: oldCenter } }))
    }
  }

  parseMapMoveEast(msg: InputMessage) {
    const oldCenter = g_map.center.clone()
    const pos = isFeatureEnabled('GameMapMovePosition') ? this.getPosition(msg) : g_map.center.clone()
    pos.x++
    const range = g_map.range
    const { h } = g_map.getAwareDims()
    this.parseMapSlice(msg, pos.x + range.right, pos.y - range.top, pos.z, 1, h)
    g_map.setCenter(pos)
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('ot:mapMove', { detail: { pos, fromPos: oldCenter } }))
    }
  }

  parseMapMoveSouth(msg: InputMessage) {
    const oldCenter = g_map.center.clone()
    const pos = isFeatureEnabled('GameMapMovePosition') ? this.getPosition(msg) : g_map.center.clone()
    pos.y++
    const range = g_map.range
    const { w } = g_map.getAwareDims()
    this.parseMapSlice(msg, pos.x - range.left, pos.y + range.bottom, pos.z, w, 1)
    g_map.setCenter(pos)
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('ot:mapMove', { detail: { pos, fromPos: oldCenter } }))
    }
  }

  parseMapMoveWest(msg: InputMessage) {
    const oldCenter = g_map.center.clone()
    const pos = isFeatureEnabled('GameMapMovePosition') ? this.getPosition(msg) : g_map.center.clone()
    pos.x--
    const range = g_map.range
    const { h } = g_map.getAwareDims()
    this.parseMapSlice(msg, pos.x - range.left, pos.y - range.top, pos.z, 1, h)
    g_map.setCenter(pos)
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('ot:mapMove', { detail: { pos, fromPos: oldCenter } }))
    }
  }
}
