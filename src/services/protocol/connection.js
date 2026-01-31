/**
 * Connection - WebSocket bridge to native TCP sockets
 * Handles packet framing, checksum and XTEA encryption.
 */

import { adler32, readU16LE, readU32LE, writeU16LE, writeU32LE, xteaDecrypt, xteaEncrypt } from './crypto'

const WS_URL = 'ws://127.0.0.1:17899'

export class Connection {
    constructor() {
        this.connected = false
        this.connecting = false
        this.ws = null
        this.wsReady = null
        this.recvBuffer = new Uint8Array(0)
        this.checksumEnabled = false
        this.xteaEnabled = false
        this.xteaKey = null
        this.eventHandlers = {
            connect: [],
            disconnect: [],
            error: [],
            receive: [],
        }
    }

    enableChecksum(enabled = true) {
        this.checksumEnabled = enabled
    }

    enableXtea(key) {
        this.xteaKey = key
        this.xteaEnabled = true
    }

    disableXtea() {
        this.xteaKey = null
        this.xteaEnabled = false
    }

    resetCrypto() {
        this.recvBuffer = new Uint8Array(0)
        this.checksumEnabled = false
        this.xteaEnabled = false
        this.xteaKey = null
    }

    async ensureSocket() {
        if (this.ws) {
            if (this.ws.readyState === WebSocket.OPEN) {
                return this.ws
            }
            if (this.ws.readyState === WebSocket.CONNECTING && this.wsReady) {
                return this.wsReady
            }
        }

        this.ws = new WebSocket(WS_URL)
        this.ws.binaryType = 'arraybuffer'

        this.wsReady = new Promise((resolve, reject) => {
            const onOpen = () => {
                cleanup()
                resolve(this.ws)
            }

            const onError = () => {
                cleanup()
                reject(new Error('WebSocket error'))
            }

            const cleanup = () => {
                this.ws.removeEventListener('open', onOpen)
                this.ws.removeEventListener('error', onError)
            }

            this.ws.addEventListener('open', onOpen)
            this.ws.addEventListener('error', onError)
        })

        this.ws.addEventListener('message', (event) => this.handleMessage(event))
        this.ws.addEventListener('close', () => {
            const wasConnected = this.connected || this.connecting
            this.connected = false
            this.connecting = false
            if (wasConnected) {
                this.emit('disconnect', { reason: 'WebSocket closed' })
            }
        })
        this.ws.addEventListener('error', () => {
            if (this.connecting) {
                this.connecting = false
                this.emit('error', new Error('WebSocket error'))
            }
        })

        return this.wsReady
    }

    handleMessage(event) {
        const { data } = event

        if (typeof data === 'string') {
            let message = null
            try {
                message = JSON.parse(data)
            } catch (error) {
                this.emit('error', new Error('Invalid WebSocket message'))
                return
            }

            if (message.type === 'connect') {
                if (message.ok) {
                    this.connected = true
                    this.connecting = false
                    this.emit('connect')
                } else {
                    this.connected = false
                    this.connecting = false
                    this.emit('error', new Error(message.error || 'Connection failed'))
                }
                return
            }

            if (message.type === 'disconnect') {
                const wasConnected = this.connected || this.connecting
                this.connected = false
                this.connecting = false
                if (wasConnected) {
                    this.emit('disconnect', { reason: message.reason || 'Connection closed' })
                }
                return
            }

            if (message.type === 'error') {
                this.emit('error', new Error(message.message || 'Unknown error'))
            }

            return
        }

        if (data instanceof ArrayBuffer) {
            this.pushData(new Uint8Array(data))
            return
        }

        if (data instanceof Blob) {
            data.arrayBuffer().then((buffer) => {
                this.pushData(new Uint8Array(buffer))
            })
        }
    }

    pushData(chunk) {
        if (!chunk || chunk.length === 0) {
            return
        }

        const combined = new Uint8Array(this.recvBuffer.length + chunk.length)
        combined.set(this.recvBuffer, 0)
        combined.set(chunk, this.recvBuffer.length)
        this.recvBuffer = combined

        while (this.recvBuffer.length >= 2) {
            const packetSize = readU16LE(this.recvBuffer, 0)
            const totalSize = packetSize + 2

            if (this.recvBuffer.length < totalSize) {
                break
            }

            const packet = this.recvBuffer.slice(2, totalSize)
            this.recvBuffer = this.recvBuffer.slice(totalSize)

            const payload = this.decodePacket(packet)
            if (payload) {
                if (typeof window !== 'undefined' && window.__otDebugBridge) {
                    const opcode = payload[0]
                    const label = opcode === 0x64 ? 'MapDescription' : opcode >= 101 && opcode <= 104 ? `MapRow${opcode - 100}` : ''
                    console.log('[Connection] decoded packet', payload.length, 'bytes, opcode=0x' + opcode.toString(16), label || '')
                }
                this.emit('receive', payload)
            }
        }
    }

    decodePacket(packet) {
        let data = packet

        if (this.checksumEnabled) {
            if (data.length < 4) {
                this.emit('error', new Error('Invalid packet checksum header'))
                return null
            }
            const received = readU32LE(data, 0)
            const body = data.slice(4)
            const computed = adler32(body)
            if (received !== computed) {
                this.emit('error', new Error('Invalid packet checksum'))
                return null
            }
            data = body
        }

        if (this.xteaEnabled) {
            if (!this.xteaKey) {
                this.emit('error', new Error('Missing XTEA key'))
                return null
            }
            if (data.length % 8 !== 0) {
                this.emit('error', new Error('Invalid XTEA packet size'))
                return null
            }

            const decrypted = xteaDecrypt(data, this.xteaKey)
            // OTC: clientVersion < 1405 → [size_lo, size_hi, message...]; clientVersion >= 1405 → [padding_byte, message..., padding...]
            const innerSize = readU16LE(decrypted, 0)
            const end = 2 + innerSize
            if (end <= decrypted.length) {
                data = decrypted.slice(2, end)
            } else {
                // Formato 1405+: 1 byte = tamanho do padding no fim; mensagem = bytes 1 .. (length - padding); opcode = data[0]
                const paddingSize = decrypted[0]
                if (paddingSize <= 7 && decrypted.length - 1 - paddingSize > 0) {
                    data = decrypted.slice(1, decrypted.length - paddingSize)
                    if (typeof window !== 'undefined' && window.__otDebugBridge) {
                        const op = data[0]
                        console.log('[Connection] XTEA formato 1405+, opcode=0x' + op.toString(16), op >= 101 && op <= 104 ? '(MapRow)' : '')
                    }
                } else {
                    this.emit('error', new Error('Invalid XTEA payload size'))
                    return null
                }
            }
        }

        return data
    }

    buildPacket(payload) {
        let body = payload

        if (this.xteaEnabled) {
            if (!this.xteaKey) {
                throw new Error('Missing XTEA key')
            }
            const inner = new Uint8Array(payload.length + 2)
            writeU16LE(inner, 0, payload.length)
            inner.set(payload, 2)

            const pad = (8 - (inner.length % 8)) % 8
            const padded = pad > 0 ? new Uint8Array(inner.length + pad) : inner
            if (pad > 0) {
                padded.set(inner, 0)
            }

            body = xteaEncrypt(padded, this.xteaKey)
        }

        if (this.checksumEnabled) {
            const checksum = adler32(body)
            const withChecksum = new Uint8Array(body.length + 4)
            writeU32LE(withChecksum, 0, checksum)
            withChecksum.set(body, 4)
            body = withChecksum
        }

        const packet = new Uint8Array(body.length + 2)
        writeU16LE(packet, 0, body.length)
        packet.set(body, 2)
        return packet
    }

    /**
     * Connect to the server using local WebSocket bridge
     * @param {string} host - Server hostname/IP
     * @param {number} port - Server port
     * @returns {Promise<void>}
     */
    async connect(host, port) {
        if (this.connected || this.connecting) {
            throw new Error('Already connected or connecting')
        }

        await this.ensureSocket()
        this.connecting = true
        console.log(`[Connection] Connecting to ${host}:${port}...`)

        try {
            this.ws.send(
                JSON.stringify({
                    type: 'connect',
                    host: host,
                    port: port,
                })
            )

            console.log('[Connection] Connection initiated successfully')

            // Wait for connection event with timeout
            return new Promise((resolve, reject) => {
                const timeout = setTimeout(() => {
                    if (this.connecting) {
                        this.connecting = false
                        reject(new Error('Connection timeout'))
                    }
                }, 10000) // 10 second timeout

                const connectHandler = () => {
                    clearTimeout(timeout)
                    this.off('connect', connectHandler)
                    this.off('error', errorHandler)
                    resolve()
                }

                const errorHandler = (error) => {
                    clearTimeout(timeout)
                    this.off('connect', connectHandler)
                    this.off('error', errorHandler)
                    reject(error)
                }

                this.on('connect', connectHandler)
                this.on('error', errorHandler)
            })
        } catch (error) {
            this.connecting = false
            console.error('[Connection] Failed to connect:', error)
            throw new Error(`Connection failed: ${error}`)
        }
    }

    /**
     * Send packet to server
     * @param {Uint8Array} payload - Packet payload without size header
     */
    async send(payload) {
        if (!this.connected) {
            throw new Error('Not connected to server')
        }

        console.log('[Connection] Sending packet:', payload.length, 'bytes')

        try {
            await this.ensureSocket()
            const packet = this.buildPacket(payload)
            this.ws.send(packet)
        } catch (error) {
            console.error('[Connection] Failed to send packet:', error)
            throw new Error(`Send failed: ${error}`)
        }
    }

    /**
     * Close connection
     */
    async close() {
        if (this.connected || this.connecting) {
            console.log('[Connection] Closing connection')

            try {
                await this.ensureSocket()
                this.ws.send(JSON.stringify({ type: 'disconnect' }))
                this.ws.close()
            } catch (error) {
                console.error('[Connection] Error during disconnect:', error)
            }

            this.connected = false
            this.connecting = false
        }
    }

    /**
     * Check if connected
     * @returns {boolean}
     */
    isConnected() {
        return this.connected
    }

    /**
     * Register event handler
     * @param {string} event - Event name (connect, disconnect, error, receive)
     * @param {Function} handler - Event handler function
     */
    on(event, handler) {
        if (this.eventHandlers[event]) {
            this.eventHandlers[event].push(handler)
        }
    }

    /**
     * Unregister event handler
     * @param {string} event - Event name
     * @param {Function} handler - Event handler function
     */
    off(event, handler) {
        if (this.eventHandlers[event]) {
            const index = this.eventHandlers[event].indexOf(handler)
            if (index > -1) {
                this.eventHandlers[event].splice(index, 1)
            }
        }
    }

    /**
     * Emit event to all registered handlers
     * @param {string} event - Event name
     * @param {*} data - Event data
     */
    emit(event, data) {
        if (this.eventHandlers[event]) {
            this.eventHandlers[event].forEach((handler) => {
                try {
                    handler(data)
                } catch (error) {
                    console.error(`[Connection] Error in ${event} handler:`, error)
                }
            })
        }
    }

    /**
     * Clear all event handlers
     */
    clearHandlers() {
        this.eventHandlers = {
            connect: [],
            disconnect: [],
            error: [],
            receive: [],
        }
    }

    /**
     * Cleanup listeners on destroy
     */
    destroy() {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.close()
        }
        this.ws = null
        this.wsReady = null
        this.resetCrypto()
        this.clearHandlers()
    }
}

// Singleton instance
let connectionInstance = null

/**
 * Get the global connection instance
 * @returns {Connection}
 */
export function getConnection() {
    if (!connectionInstance) {
        connectionInstance = new Connection()
    }
    return connectionInstance
}

/**
 * Reset the global connection instance
 */
export function resetConnection() {
    if (connectionInstance) {
        connectionInstance.close()
        connectionInstance.destroy()
    }
    connectionInstance = null
}
