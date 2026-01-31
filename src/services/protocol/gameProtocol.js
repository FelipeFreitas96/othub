/**
 * Game protocol – alinhado ao OTClient protocolgame.cpp / protocolgame.h
 * Fluxo: onRecv(data) → firstRecv check → parseMessage(InputMessage); (recv continua no connection)
 * parseMessage lê opcodes e despacha para parseMapDescription, parseMapMoveNorth, etc.
 */
import { Connection } from './connection'
import { generateXteaKey, getRsaKeySize, rsaEncrypt } from './crypto'
import { getProtocolInfo, OTSERV_RSA } from './protocolInfo'
import { OutputMessage } from './outputMessage'
import { InputMessage } from './inputMessage'
import { getAuthenticatorToken, getLoginContext, getSessionKey } from './sessionState'
import { DEFAULT_PLAYER } from '../../game/defaultPlayer'
import { getThings, loadThings } from '../things/things.js'
import { MapStore } from './mapStore.js'
import { isFeatureEnabled, setClientVersion } from './features'
import { getGameClientVersion, setGameClientVersion } from '../../game/g_game.js'

function getOutfit(msg) {
  const lookType = isFeatureEnabled('GameLooktypeU16') ? msg.getU16() : msg.getU8()
  if (lookType !== 0) {
    const head = msg.getU8(), body = msg.getU8(), legs = msg.getU8(), feet = msg.getU8()
    const addons = isFeatureEnabled('GamePlayerAddons') ? msg.getU8() : 0
    return { lookType, head, body, legs, feet, addons, lookTypeEx: 0 }
  }
  const lookTypeEx = msg.getU16()
  return { lookType: 0, head: 0, body: 0, legs: 0, feet: 0, addons: 0, lookTypeEx }
}

function getCreature(msg, type, map) {
  const clientVersion = getGameClientVersion()
  const UNKNOWN = 97, OUTDATED = 98, CREATURE_TURN = 99
  if (type === CREATURE_TURN) {
    const creatureId = msg.getU32()
    const direction = msg.getU8()
    const c = map.getCreature(creatureId)
    if (c) c.direction = direction
    return c ? { kind: 'creature', creatureId, id: c.outfit?.lookType || 0, outfit: c.outfit, direction: c.direction, name: c.name } : { kind: 'creature', creatureId, id: 0, outfit: null, direction, name: '' }
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
  const outfit = getOutfit(msg)
  const light = { intensity: msg.getU8(), color: msg.getU8() }
  const speed = msg.getU16()
  const skull = msg.getU8()
  const shield = msg.getU8()
  const emblem = isFeatureEnabled('GameCreatureEmblems') ? msg.getU8() : 0
  // 8.54+ servers send "unpass" (bool) after shield/skull (+ emblem if enabled).
  const unpass = (clientVersion >= 854) ? msg.getU8() : 1

  const c = { id: creatureId, name, health, direction, outfit, light, speed, skull, shield, emblem, unpass }
  map.upsertCreature(c)
  return { kind: 'creature', creatureId, id: outfit.lookType || 0, outfit, direction, name }
}

/** OTC: getPosition(InputMessage) – x, y, z (u16, u16, u8). */
function getPosition(msg) {
  return { x: msg.getU16(), y: msg.getU16(), z: msg.getU8() }
}

/** OTC: getMappedThing(msg) – pos+stackpos ou 0xffff+creatureId; retorna { creatureId, fromPos } ou null. */
function getMappedThing(msg, map) {
  const x = msg.getU16()
  if (x !== 0xffff) {
    const fromPos = { x, y: msg.getU16(), z: msg.getU8() }
    const stackpos = msg.getU8()
    const tile = map.getTile(fromPos)
    const thing = tile?.things?.[stackpos]
    if (thing?.kind === 'creature') {
      return { creatureId: thing.creatureId ?? thing.id, fromPos }
    }
    return null
  }
  const creatureId = msg.getU32()
  const found = map.findCreaturePosition(creatureId)
  if (found) return { creatureId, fromPos: found.pos }
  return null
}

function parseCreatureMove(msg, map) {
  const ref = getMappedThing(msg, map)
  const newPos = getPosition(msg)
  if (!ref) return
  map.startWalk(ref.creatureId, ref.fromPos, newPos, map.getCreature(ref.creatureId), false)
}

function parseMapDescription(msg, map, debugProtocol) {
  const clientVersion = getGameClientVersion()
  const things = getThings()
  const oldCenter = map.center ? { ...map.center } : null
  const pos = { x: msg.getU16(), y: msg.getU16(), z: msg.getU8() }
  if (typeof window !== 'undefined' && (window.__otDebugProtocol || debugProtocol)) {
    console.log('[protocol] 0x64 mapa pos=', pos, oldCenter ? 'antes=' + JSON.stringify(oldCenter) : '')
  }
  map.setCenter(pos)
  const { w, h } = map.getAwareDims()
  const peekU16 = () => msg.buffer[msg.position] | (msg.buffer[msg.position + 1] << 8)
  const readThing = () => {
    const id = msg.getU16()
    if (id === 97 || id === 98 || id === 99) { // creature markers (Unknown/Outdated/CreatureTurn)
      const c = getCreature(msg, id, map)
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
    map.cleanTile(tilePos)
    const tile = { pos: tilePos, things: [] }
    let gotEffect = false
    for (let stackPos = 0; stackPos < 256; stackPos++) {
      if (peekU16() >= 0xff00) {
        const skip = msg.getU16() & 0xff
        map.setTile(tilePos, tile)
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
    map.setTile(tilePos, tile)
    return 0
  }
  // 1:1 protocolgameparse.cpp setFloorDescription (L1423): offset = z - nz (center - floor)
  const setFloorDescription = (x, y, z, width, height, offset, skip) => {
    for (let nx = 0; nx < width; nx++) {
      for (let ny = 0; ny < height; ny++) {
        const tilePos = { x: x + nx + offset, y: y + ny + offset, z }
        if (skip === 0) {
          skip = setTileDescription(tilePos)
        } else {
          map.cleanTile(tilePos)
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

  const baseX = pos.x - map.range.left
  const baseY = pos.y - map.range.top
  const posBefore = msg.position
  const { startz, endz } = setMapDescription(baseX, baseY, pos.z, w, h)
  if (typeof window !== 'undefined' && window.__otDebugMapParse) {
    const bytesRead = msg.position - posBefore
    const bytesLeft = msg.buffer.length - msg.position
    console.debug('[map] pos.z=', pos.z, 'startz=', startz, 'endz=', endz, 'bytesRead=', bytesRead, 'bytesLeft=', bytesLeft)
  }

  const zMin = Math.min(startz, endz)
  const zMax = Math.max(startz, endz)
  // Detecção de movimento do jogador: se center mudou 1 tile, iniciar walk (OTC: onAppear -> walk).
  if (oldCenter && (oldCenter.x !== pos.x || oldCenter.y !== pos.y || oldCenter.z !== pos.z)) {
    const dx = Math.abs(pos.x - oldCenter.x)
    const dy = Math.abs(pos.y - oldCenter.y)
    const dz = Math.abs(pos.z - oldCenter.z)
    if (dx <= 1 && dy <= 1 && dz === 0 && (dx !== 0 || dy !== 0)) {
      const playerId = typeof window !== 'undefined' ? window.__otPlayerId : null
      if (playerId != null) {
        const tileAtNew = map.getTile(pos)
        const playerThing = tileAtNew?.things?.find((t) => t.kind === 'creature' && (t.creatureId === playerId || t.id === playerId))
        const playerData = playerThing || map.getCreature(playerId) || {}
        map.startWalk(playerId, oldCenter, pos, playerData, true)
      }
    }
  }
  // Estender snapshot para incluir andares abaixo (render) sem alterar o parse do protocolo.
  const snapZMax = Math.max(zMax, Math.min(15, pos.z + 2))
  const snap = map.snapshotFloors(zMin, snapZMax)
  const current = snap.floors?.[pos.z] || map.snapshotFloor(pos.z)
  const state = {
    pos,
    w: current.w,
    h: current.h,
    tiles: current.tiles,
    floors: snap.floors,
    zMin: snap.zMin,
    zMax: snap.zMax,
    range: map.range,
    ts: Date.now(),
    version: clientVersion
  }
  if (typeof window !== 'undefined') {
    window.__otMapState = state
    window.dispatchEvent(new CustomEvent('ot:map', { detail: state }))
    // Servidores que respondem com 0x64 em vez de 101–104: disparar ot:mapMove para a view atualizar igual.
    if (oldCenter && (oldCenter.x !== pos.x || oldCenter.y !== pos.y || oldCenter.z !== pos.z)) {
      window.dispatchEvent(new CustomEvent('ot:mapMove', { detail: { pos } }))
    }
  }
}

/** OTC: parseMapMoveNorth / UpdateNorthSide – servidor envia 0x65 + (opcional) slice de tiles ao norte. */
function parseMapSlice(msg, map, baseX, baseY, z, width, height) {
  const things = getThings()
  const peekU16 = () => msg.buffer[msg.position] | (msg.buffer[msg.position + 1] << 8)
  const readThing = () => {
    const id = msg.getU16()
    if (id === 97 || id === 98 || id === 99) {
      const c = getCreature(msg, id, map)
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
    map.cleanTile(tilePos)
    const tile = { pos: tilePos, things: [] }
    let gotEffect = false
    for (let stackPos = 0; stackPos < 256; stackPos++) {
      if (peekU16() >= 0xff00) {
        const skip = msg.getU16() & 0xff
        map.setTile(tilePos, tile)
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
    map.setTile(tilePos, tile)
    return 0
  }
  const setFloorDescription = (x, y, z, w, h, offset, skip) => {
    for (let nx = 0; nx < w; nx++) {
      for (let ny = 0; ny < h; ny++) {
        const tilePos = { x: x + nx + offset, y: y + ny + offset, z }
        if (skip === 0) skip = setTileDescription(tilePos)
        else { map.cleanTile(tilePos); skip-- }
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

/** OTC: parseMapMoveNorth – protocolgameparse.cpp 1:1. Sem early return; GameMapMovePosition opcional; setMapDescription sempre. */
function parseMapMoveNorth(msg, map, debugProtocol) {
  const pos = isFeatureEnabled('GameMapMovePosition') ? getPosition(msg) : { ...map.center }
  pos.y--
  const range = map.range
  const { w } = map.getAwareDims()
  parseMapSlice(msg, map, pos.x - range.left, pos.y - range.top, pos.z, w, 1)
  map.setCenter(pos)
  if (typeof window !== 'undefined' && (window.__otDebugProtocol || debugProtocol)) {
    console.log('[protocol] 0x65 map move north ->', pos)
  }
}

/** OTC: parseMapMoveEast – protocolgameparse.cpp 1:1. */
function parseMapMoveEast(msg, map, debugProtocol) {
  const pos = isFeatureEnabled('GameMapMovePosition') ? getPosition(msg) : { ...map.center }
  pos.x++
  const range = map.range
  const { h } = map.getAwareDims()
  parseMapSlice(msg, map, pos.x + range.right, pos.y - range.top, pos.z, 1, h)
  map.setCenter(pos)
  if (typeof window !== 'undefined' && (window.__otDebugProtocol || debugProtocol)) {
    console.log('[protocol] 0x66 map move east ->', pos)
  }
}

/** OTC: parseMapMoveSouth – protocolgameparse.cpp 1:1 (baseY = pos.y + range.bottom). */
function parseMapMoveSouth(msg, map, debugProtocol) {
  const pos = isFeatureEnabled('GameMapMovePosition') ? getPosition(msg) : { ...map.center }
  pos.y++
  const range = map.range
  const { w } = map.getAwareDims()
  parseMapSlice(msg, map, pos.x - range.left, pos.y + range.bottom, pos.z, w, 1)
  map.setCenter(pos)
  if (typeof window !== 'undefined' && (window.__otDebugProtocol || debugProtocol)) {
    console.log('[protocol] 0x67 map move south ->', pos)
  }
}

/** OTC: parseMapMoveWest – protocolgameparse.cpp 1:1. */
function parseMapMoveWest(msg, map, debugProtocol) {
  const pos = isFeatureEnabled('GameMapMovePosition') ? getPosition(msg) : { ...map.center }
  pos.x--
  const range = map.range
  const { h } = map.getAwareDims()
  parseMapSlice(msg, map, pos.x - range.left, pos.y - range.top, pos.z, 1, h)
  map.setCenter(pos)
  if (typeof window !== 'undefined' && (window.__otDebugProtocol || debugProtocol)) {
    console.log('[protocol] 0x68 map move west ->', pos)
  }
}

/** OTC protocolcodes.h – opcodes servidor → cliente (Proto::GameServer*). */
const GAME_SERVER_OPCODES = {
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
}

/** OTC: Proto::GameServerFirstGameOpcode – opcodes > este valor indicam pacotes in-game (mapa, etc.). */
const GAME_SERVER_FIRST_GAME_OPCODE = 50

/**
 * OTC: ProtocolGame::parseMessage(InputMessage) – protocolgameparse.cpp
 * while (!msg->eof()) { opcode = getU8(); switch(opcode) { case X: parse*(msg); break; default: log; setReadPos(size); break; } prevOpcode = opcode; }
 */
async function parseMessage(msg, ctx) {
  const { map, debug, connection, protocolInfo, getLoginSent, callbacks } = ctx
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
        case GAME_SERVER_OPCODES.GameServerFullMap:
          parseMapDescription(msg, map, debug)
          break

        case GAME_SERVER_OPCODES.GameServerMapTopRow: {
          parseMapMoveNorth(msg, map, debug)
          break
        }

        case GAME_SERVER_OPCODES.GameServerMapRightRow: {
          parseMapMoveEast(msg, map, debug)
          break
        }

        case GAME_SERVER_OPCODES.GameServerMapBottomRow: {
          parseMapMoveSouth(msg, map, debug)
          break
        }

        case GAME_SERVER_OPCODES.GameServerMapLeftRow: {
          parseMapMoveWest(msg, map, debug)
          break
        }

        case GAME_SERVER_OPCODES.GameServerMoveCreature:
          parseCreatureMove(msg, map, debug)
          break

        case GAME_SERVER_OPCODES.GameServerChallenge:
          const timestamp = msg.getU32()
          const random = msg.getU8()
          if (!getLoginSent()) {
            await sendLogin(timestamp, random)
          }
          break

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
          if (msg.canRead(7)) {
            const playerId = msg.getU32()
            if (typeof window !== 'undefined') window.__otPlayerId = playerId
            msg.getU16()
            msg.getU8()
          }
          await connection.send(new Uint8Array([GAME_CLIENT_OPCODES.GameClientEnterGame]))
          break

        case GAME_SERVER_OPCODES.GameServerLoginSuccess:
          if (msg.canRead(7)) {
            const playerId = msg.getU32()
            if (typeof window !== 'undefined') window.__otPlayerId = playerId
            msg.getU16()
            msg.getU8()
          }
          await connection.send(new Uint8Array([GAME_CLIENT_OPCODES.GameClientEnterGame]))
          break

        case GAME_SERVER_OPCODES.GameServerEnterGame:
          if (msg.canRead(7)) {
            const playerId = msg.getU32()
            if (typeof window !== 'undefined') window.__otPlayerId = playerId
            msg.getU16()
            msg.getU8()
          }
          if (typeof window !== 'undefined') window.__gameConnection = connection
          resolveOnce({
            ok: true,
            player: { ...DEFAULT_PLAYER, name: ctx.characterName },
          })
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

function createGameLoginPayload({
  protocolInfo,
  rsaKey,
  accountName,
  accountPassword,
  characterName,
  authenticatorToken,
  sessionKey,
  challengeTimestamp,
  challengeRandom,
}) {
  const msg = new OutputMessage()
  const rsaSize = getRsaKeySize(rsaKey)

  msg.addU8(GAME_CLIENT_OPCODES.GameClientPendingGame)
  msg.addU16(2) // windows
  msg.addU16(protocolInfo.protocolVersion)

  if (protocolInfo.clientVersionFeature) {
    msg.addU32(protocolInfo.clientVersion)
  }

  if (protocolInfo.previewState) {
    msg.addU8(0)
  }

  const rsaOffset = msg.getRawBuffer().length
  let xteaKey = null

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
    msg.addString(sessionKey || '')
    msg.addString(characterName)
  } else {
    if (protocolInfo.accountNames) {
      msg.addString(accountName)
    } else {
      const accountNumber = parseInt(accountName, 10)
      if (Number.isNaN(accountNumber)) {
        throw new Error('Account must be numeric for this client version.')
      }
      msg.addU32(accountNumber >>> 0)
    }

    msg.addString(characterName)
    msg.addString(accountPassword)

    if (protocolInfo.authenticator) {
      msg.addString(authenticatorToken || '')
    }
  }

  if (protocolInfo.challengeOnLogin) {
    msg.addU32(challengeTimestamp >>> 0)
    msg.addU8(challengeRandom & 0xff)
  }

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
    return { payload: combined, xteaKey }
  }

  return { payload: msg.getRawBuffer(), xteaKey }
}

export async function loginWorld(charInfo) {
  const ctx = getLoginContext()
  if (!ctx) {
    return { ok: false, message: 'Missing login context (account/password).' }
  }

  const protocolInfo = getProtocolInfo(ctx.clientVersion)
  const effectiveVersion = protocolInfo.clientVersion || ctx.clientVersion || 860
  setClientVersion(effectiveVersion)
  setGameClientVersion(effectiveVersion)
  loadThings(protocolInfo.clientVersion || 860).catch(() => { })
  const connection = new Connection()
  const map = new MapStore()
  if (typeof window !== 'undefined') {
    window.__otMapStore = map
    if (new URLSearchParams(window.location.search).get('debug') === 'protocol') window.__otDebugProtocol = true
  }

  const worldHost = charInfo.worldHost || charInfo.worldIp
  const worldPort = parseInt(charInfo.worldPort, 10) || 7172
  const characterName = charInfo.characterName || charInfo.name

  if (!worldHost || !characterName) {
    return { ok: false, message: 'Invalid character/world data.' }
  }

  const rsaKey = ctx.rsaKey || OTSERV_RSA

  connection.resetCrypto()
  connection.enableChecksum(protocolInfo.checksum)

  try {
    await connection.connect(worldHost, worldPort)

    let finished = false
    let loginSent = false
    let firstRecv = true

    const sendLogin = async (timestamp, random) => {
      const { payload, xteaKey } = createGameLoginPayload({
        protocolInfo,
        rsaKey,
        accountName: ctx.account,
        accountPassword: ctx.password,
        characterName,
        authenticatorToken: getAuthenticatorToken(),
        sessionKey: getSessionKey(),
        challengeTimestamp: timestamp,
        challengeRandom: random,
      })

      await connection.send(payload)
      if (xteaKey) {
        connection.enableXtea(xteaKey)
      }
      loginSent = true
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
          await parseMessage(msg, ctx)
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
