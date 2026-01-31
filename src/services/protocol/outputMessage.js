/**
 * OutputMessage - Packet serialization for Tibia protocol
 * Builds binary packets to send to the server
 */

import { generateXteaKey, getRsaKeySize, randomBytes, rsaEncrypt } from './crypto'
import { getProtocolInfo, OTSERV_RSA, PIC_SIGNATURE } from './protocolInfo'

export class OutputMessage {
    constructor() {
        this.buffer = []
        this.position = 0
    }

    /**
     * Add a byte (uint8) to the packet
     * @param {number} value - Byte value (0-255)
     */
    addU8(value) {
        this.buffer.push(value & 0xFF)
    }

    /**
     * Add a 16-bit unsigned integer (little-endian)
     * @param {number} value - 16-bit value
     */
    addU16(value) {
        this.buffer.push(value & 0xFF)
        this.buffer.push((value >> 8) & 0xFF)
    }

    /**
     * Add a 32-bit unsigned integer (little-endian)
     * @param {number} value - 32-bit value
     */
    addU32(value) {
        this.buffer.push(value & 0xFF)
        this.buffer.push((value >> 8) & 0xFF)
        this.buffer.push((value >> 16) & 0xFF)
        this.buffer.push((value >> 24) & 0xFF)
    }

    /**
     * Add a string to the packet
     * Format: 16-bit length + string bytes
     * @param {string} value - String to add
     */
    addString(value) {
        const str = value || ''
        this.addU16(str.length)
        for (let i = 0; i < str.length; i++) {
            this.buffer.push(str.charCodeAt(i) & 0xFF)
        }
    }

    /**
     * Get the raw buffer without size header
     * @returns {Uint8Array}
     */
    getRawBuffer() {
        return new Uint8Array(this.buffer)
    }

    /**
     * Reset the buffer
     */
    reset() {
        this.buffer = []
        this.position = 0
    }
}

/**
 * Create a login packet
 * @param {Object} credentials - Login credentials
 * @returns {Uint8Array}
 */
export function createLoginPacket(credentials) {
    const msg = new OutputMessage()
    const protocolInfo = getProtocolInfo(credentials.clientVersion)
    const rsaKey = credentials.rsaKey || OTSERV_RSA
    const rsaSize = getRsaKeySize(rsaKey)
    const datSignature = credentials.datSignature ?? 0
    const sprSignature = credentials.sprSignature ?? 0
    const contentRevision = credentials.contentRevision ?? (datSignature & 0xffff)

    if (!datSignature || !sprSignature) {
        console.warn('[Protocol] dat/spr signatures not set, server might reject the login packet.')
    }

    // Opcode for login
    msg.addU8(0x01)

    // Client OS (1 = Linux, 2 = Windows, 3 = Flash, 4 = OTClientV8)
    msg.addU16(2) // Windows

    // Protocol version
    msg.addU16(protocolInfo.protocolVersion)

    if (protocolInfo.clientVersionFeature) {
        msg.addU32(protocolInfo.clientVersion)
    }

    // Dat/Spr/Pic signatures
    if (protocolInfo.contentRevision) {
        msg.addU16(contentRevision >>> 0)
        msg.addU16(0)
    } else {
        msg.addU32(datSignature >>> 0)
    }
    msg.addU32(sprSignature >>> 0)
    msg.addU32(PIC_SIGNATURE >>> 0)

    if (protocolInfo.previewState) {
        msg.addU8(0)
    }

    const rsaOffset = msg.buffer.length
    let xteaKey = null

    if (protocolInfo.loginEncryption) {
        // first RSA byte must be 0
        msg.addU8(0)
        xteaKey = generateXteaKey()
        msg.addU32(xteaKey[0])
        msg.addU32(xteaKey[1])
        msg.addU32(xteaKey[2])
        msg.addU32(xteaKey[3])
    }

    if (protocolInfo.accountNames) {
        msg.addString(credentials.account)
    } else {
        const accountNumber = parseInt(credentials.account, 10)
        if (Number.isNaN(accountNumber)) {
            throw new Error('Account must be numeric for this client version.')
        }
        msg.addU32(accountNumber >>> 0)
    }

    // Password
    msg.addString(credentials.password)

    if (protocolInfo.loginEncryption) {
        const currentSize = msg.buffer.length - rsaOffset
        const padding = rsaSize - currentSize

        if (padding < 0) {
            throw new Error('RSA block is larger than key size.')
        }

        const pad = randomBytes(padding)
        for (let i = 0; i < pad.length; i++) {
            msg.addU8(pad[i])
        }

        const raw = msg.getRawBuffer()
        const blockStart = raw.length - rsaSize
        const encrypted = rsaEncrypt(raw.slice(blockStart), rsaKey)
        raw.set(encrypted, blockStart)

        return { payload: raw, xteaKey, protocolInfo }
    }

    console.log('[Protocol] Creating login packet:', {
        opcode: '0x01',
        version: protocolInfo.clientVersion,
        account: credentials.account,
        packetSize: msg.buffer.length
    })

    return { payload: msg.getRawBuffer(), xteaKey, protocolInfo }
}

/**
 * Create an enter game packet
 * @param {Object} character - Character data
 * @returns {Uint8Array}
 */
export function createEnterGamePacket(character) {
    const msg = new OutputMessage()

    // Opcode for enter game
    msg.addU8(0x0A)

    // Character name
    msg.addString(character.name)

    console.log('[Protocol] Creating enter game packet:', {
        opcode: '0x0F',
        character: character.name,
        packetSize: msg.buffer.length
    })

    return msg.getRawBuffer()
}
