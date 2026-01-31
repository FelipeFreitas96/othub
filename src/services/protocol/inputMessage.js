/**
 * InputMessage - Packet deserialization for Tibia protocol
 * Parses binary packets received from the server
 */

export class InputMessage {
    constructor(buffer) {
        this.buffer = new Uint8Array(buffer)
        this.position = 0
    }

    /**
     * Check if there are bytes available to read
     * @returns {boolean}
     */
    canRead(bytes = 1) {
        return this.position + bytes <= this.buffer.length
    }

    /**
     * Read a byte (uint8)
     * @returns {number}
     */
    getU8() {
        if (!this.canRead(1)) {
            throw new Error('InputMessage: Cannot read U8, buffer overflow')
        }
        return this.buffer[this.position++]
    }

    peekU16() {
        const v = this.getU16()
        this.position -= 2
        return v
    }

    /**
     * Read a 16-bit unsigned integer (little-endian)
     * @returns {number}
     */
    getU16() {
        if (!this.canRead(2)) {
            throw new Error('InputMessage: Cannot read U16, buffer overflow')
        }
        const value = this.buffer[this.position] | (this.buffer[this.position + 1] << 8)
        this.position += 2
        return value
    }

    /**
     * Read a 32-bit unsigned integer (little-endian)
     * @returns {number}
     */
    getU32() {
        if (!this.canRead(4)) {
            throw new Error('InputMessage: Cannot read U32, buffer overflow')
        }
        const value =
            this.buffer[this.position] |
            (this.buffer[this.position + 1] << 8) |
            (this.buffer[this.position + 2] << 16) |
            (this.buffer[this.position + 3] << 24)
        this.position += 4
        return value >>> 0 // Convert to unsigned
    }

    /**
     * Read a string
     * Format: 16-bit length + string bytes
     * @returns {string}
     */
    getString() {
        const length = this.getU16()
        if (!this.canRead(length)) {
            throw new Error('InputMessage: Cannot read string, buffer overflow')
        }

        let str = ''
        for (let i = 0; i < length; i++) {
            str += String.fromCharCode(this.buffer[this.position++])
        }
        return str
    }

    /**
     * Peek at the next byte without advancing position
     * @returns {number}
     */
    peekU8() {
        if (!this.canRead(1)) {
            throw new Error('InputMessage: Cannot peek U8, buffer overflow')
        }
        return this.buffer[this.position]
    }

    /**
     * Skip bytes
     * @param {number} count - Number of bytes to skip
     */
    skip(count) {
        if (!this.canRead(count)) {
            throw new Error('InputMessage: Cannot skip bytes, buffer overflow')
        }
        this.position += count
    }

    /**
     * Get remaining bytes in buffer
     * @returns {number}
     */
    getUnreadSize() {
        return this.buffer.length - this.position
    }

    /**
     * Reset position to start
     */
    reset() {
        this.position = 0
    }
}

/**
 * Parse character list packet
 * @param {InputMessage} msg - Input message
 * @returns {Array} Array of characters
 */
function ipToString(ip) {
    const b1 = ip & 0xff
    const b2 = (ip >> 8) & 0xff
    const b3 = (ip >> 16) & 0xff
    const b4 = (ip >> 24) & 0xff
    return `${b1}.${b2}.${b3}.${b4}`
}

export function parseCharacterList(msg, clientVersion = 860) {
    const characters = []
    const version = parseInt(clientVersion, 10) || 860

    try {
        if (version > 1010) {
            // Read number of worlds
            const worldCount = msg.getU8()

            // Read world info
            const worlds = []
            for (let i = 0; i < worldCount; i++) {
                const worldId = msg.getU8()
                const worldName = msg.getString()
                const worldIp = msg.getString()
                const worldPort = msg.getU16()
                const preview = msg.getU8() // Preview state

                worlds.push({ worldId, worldName, worldIp, worldPort, preview })
            }

            // Read number of characters
            const charCount = msg.getU8()

            // Read character info
            for (let i = 0; i < charCount; i++) {
                const worldId = msg.getU8()
                const name = msg.getString()

                const world = worlds.find(w => w.worldId === worldId)

                characters.push({
                    id: i,
                    name,
                    world: world?.worldName || 'Unknown',
                    worldName: world?.worldName || 'Unknown',
                    worldId,
                    worldIp: world?.worldIp,
                    worldPort: world?.worldPort,
                    level: 1, // Not sent in basic protocol
                    vocation: 'None', // Not sent in basic protocol
                    preview: world?.preview || 0,
                })
            }
        } else {
            const charCount = msg.getU8()

            for (let i = 0; i < charCount; i++) {
                const name = msg.getString()
                const worldName = msg.getString()
                const worldIp = ipToString(msg.getU32())
                const worldPort = msg.getU16()
                let preview = 0

                if (version >= 980) {
                    preview = msg.getU8()
                }

                characters.push({
                    id: i,
                    name,
                    world: worldName,
                    worldName,
                    worldIp,
                    worldPort,
                    level: 1, // Not sent in basic protocol
                    vocation: 'None', // Not sent in basic protocol
                    preview,
                })
            }
        }

        console.log('[Protocol] Parsed character list:', characters)
    } catch (error) {
        console.error('[Protocol] Error parsing character list:', error)
        throw error
    }

    return characters
}

/**
 * Parse login error packet
 * @param {InputMessage} msg - Input message
 * @returns {Object} Error info
 */
export function parseLoginError(msg) {
    try {
        const errorMessage = msg.getString()

        console.log('[Protocol] Parsed login error:', errorMessage)

        return {
            message: errorMessage,
        }
    } catch (error) {
        console.error('[Protocol] Error parsing login error:', error)
        return {
            message: 'Unknown error occurred.',
        }
    }
}
