/**
 * Protocol Login - Handles login and enter game protocol
 * Uses WebSocket connection to communicate with OTServer
 */
import { getConnection } from './connection'
import { createLoginPacket, createEnterGamePacket } from './outputMessage'
import { InputMessage, parseCharacterList, parseLoginError } from './inputMessage'
import { SERVER_OPCODES, LOGIN_ERROR_MESSAGES } from './packets'
import { getProtocolInfo } from './protocolInfo'
import { setAuthenticatorToken, setLoginContext, setSessionKey } from './sessionState'
import { DEFAULT_PLAYER } from '../../game/defaultPlayer'

const CONNECTION_TIMEOUT_MS = 10000

/**
 * Login to server and get character list
 * @param {Object} credentials - Login credentials
 * @returns {Promise<Object>} Result with characters or error
 */
export async function login(credentials: any): Promise<any> {
  console.log('[LoginProtocol] Attempting login...', {
    server: credentials.server,
    port: credentials.port,
    account: credentials.account,
    version: credentials.clientVersion,
  })

  const connection = getConnection()
  const protocolInfo = getProtocolInfo(credentials.clientVersion)

  try {
    connection.resetCrypto()
    setLoginContext({
      account: credentials.account,
      password: credentials.password,
      clientVersion: credentials.clientVersion,
    })
    setAuthenticatorToken(credentials.authenticatorToken || null)
    setSessionKey(null)

    connection.enableChecksum(protocolInfo.checksum)

    // Connect to server
    await connection.connect(credentials.server, credentials.port)

    // Create and send login packet
    const { payload, xteaKey } = createLoginPacket(credentials)
    await connection.send(payload)
    if (xteaKey) {
      connection.enableXtea(xteaKey)
    }

    // Wait for server response
    const result = await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        cleanup()
        reject(new Error('Server response timeout'))
      }, CONNECTION_TIMEOUT_MS)

      const onReceive = (data: any) => {
        try {
          const msg = new InputMessage(data)

          while (msg.canRead(1)) {
            const opcode = msg.getU8()
            console.log('[LoginProtocol] Received opcode:', '0x' + opcode.toString(16).padStart(2, '0'))

            if (opcode === SERVER_OPCODES.CHARACTER_LIST) {
              const characters = parseCharacterList(msg, protocolInfo.clientVersion)
              cleanup()
              resolve({ ok: true, characters })
              return
            }

            if (opcode === SERVER_OPCODES.LOGIN_ERROR || opcode === SERVER_OPCODES.LOGIN_ERROR_NEW) {
              const error = parseLoginError(msg)
              cleanup()
              resolve({ ok: false, message: error.message })
              return
            }

            if (opcode === SERVER_OPCODES.MOTD) {
              msg.getString()
              continue
            }

            if (opcode === SERVER_OPCODES.SESSION_KEY) {
              setSessionKey(msg.getString())
              continue
            }

            if (opcode === SERVER_OPCODES.LOGIN_TOKEN_SUCCESS) {
              msg.getU8()
              continue
            }

            if (opcode === SERVER_OPCODES.LOGIN_TOKEN_ERROR) {
              msg.getU8()
              cleanup()
              reject(new Error('Invalid authenticator token'))
              return
            }

            if (opcode === SERVER_OPCODES.UPDATE_NEEDED) {
              cleanup()
              reject(new Error('Client needs update'))
              return
            }

            if (opcode === SERVER_OPCODES.UPDATE) {
              msg.getString()
              continue
            }

            console.warn('[LoginProtocol] Unknown opcode:', opcode)
            cleanup()
            reject(new Error('Unknown server response'))
            return
          }
        } catch (error) {
          console.error('[LoginProtocol] Error parsing response:', error)
          cleanup()
          reject(error)
        }
      }

      const onError = (error: any) => {
        cleanup()
        reject(error)
      }

      const onDisconnect = () => {
        cleanup()
        reject(new Error('Connection closed by server'))
      }

      const cleanup = () => {
        clearTimeout(timeout)
        connection.off('receive', onReceive)
        connection.off('error', onError)
        connection.off('disconnect', onDisconnect)
      }

      connection.on('receive', onReceive)
      connection.on('error', onError)
      connection.on('disconnect', onDisconnect)
    })

    return result

  } catch (error: any) {
    console.error('[LoginProtocol] Login failed:', error)
    connection.close()

    return {
      ok: false,
      message: error.message || LOGIN_ERROR_MESSAGES.CONNECTION_FAILED,
    }
  }
}

/**
 * Enter game with selected character
 * @param {Object} character - Character data
 * @returns {Promise<Object>} Result with player data or error
 */
export async function enterGame(character: any): Promise<any> {
  console.log('[LoginProtocol] Entering game...', character.name)

  const connection = getConnection()

  try {
    if (!connection.isConnected()) {
      throw new Error('Not connected to server')
    }

    // Create and send enter game packet
    const enterGamePacket = createEnterGamePacket(character)
    await connection.send(enterGamePacket)

    // Wait for server response
    const result = await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        cleanup()
        reject(new Error('Server response timeout'))
      }, CONNECTION_TIMEOUT_MS)

      const onReceive = (data: any) => {
        try {
          // For now, we'll assume success and use default player data
          // In a full implementation, we'd parse the game data from the server
          console.log('[LoginProtocol] Received enter game response')

          const player = {
            ...DEFAULT_PLAYER,
            name: character.name,
            level: character.level ?? DEFAULT_PLAYER.level,
            baseLevel: character.level ?? DEFAULT_PLAYER.baseLevel,
          }

          cleanup()
          resolve({ ok: true, player })
        } catch (error) {
          console.error('[LoginProtocol] Error parsing enter game response:', error)
          cleanup()
          reject(error)
        }
      }

      const onError = (error: any) => {
        cleanup()
        reject(error)
      }

      const onDisconnect = () => {
        cleanup()
        reject(new Error('Connection closed by server'))
      }

      const cleanup = () => {
        clearTimeout(timeout)
        connection.off('receive', onReceive)
        connection.off('error', onError)
        connection.off('disconnect', onDisconnect)
      }

      connection.on('receive', onReceive)
      connection.on('error', onError)
      connection.on('disconnect', onDisconnect)
    })

    return result

  } catch (error: any) {
    console.error('[LoginProtocol] Enter game failed:', error)

    return {
      ok: false,
      message: error.message || 'Failed to enter game.',
    }
  }
}
