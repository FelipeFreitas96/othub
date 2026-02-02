const ADLER_MOD = 65521
const XTEA_DELTA = 0x9e3779b9

export function writeU16LE(buffer: Uint8Array, offset: number, value: number) {
    buffer[offset] = value & 0xff
    buffer[offset + 1] = (value >> 8) & 0xff
}

export function writeU32LE(buffer: Uint8Array, offset: number, value: number) {
    buffer[offset] = value & 0xff
    buffer[offset + 1] = (value >> 8) & 0xff
    buffer[offset + 2] = (value >> 16) & 0xff
    buffer[offset + 3] = (value >> 24) & 0xff
}

export function readU16LE(buffer: Uint8Array, offset: number = 0) {
    return buffer[offset] | (buffer[offset + 1] << 8)
}

export function readU32LE(buffer: Uint8Array, offset: number = 0) {
    return (
        buffer[offset] |
        (buffer[offset + 1] << 8) |
        (buffer[offset + 2] << 16) |
        (buffer[offset + 3] << 24)
    ) >>> 0
}

export function adler32(buffer: Uint8Array) {
    let a = 1
    let b = 0
    for (let i = 0; i < buffer.length; i++) {
        a = (a + buffer[i]) % ADLER_MOD
        b = (b + a) % ADLER_MOD
    }
    return ((b << 16) | a) >>> 0
}

function getRandomValues(array: Uint8Array | Uint32Array) {
    if (globalThis.crypto && typeof globalThis.crypto.getRandomValues === 'function') {
        return globalThis.crypto.getRandomValues(array)
    }
    for (let i = 0; i < array.length; i++) {
        array[i] = Math.floor(Math.random() * 256)
    }
    return array
}

export function randomBytes(length: number) {
    const bytes = new Uint8Array(length)
    return getRandomValues(bytes)
}

export function generateXteaKey() {
    const key = new Uint32Array(4)
    if (globalThis.crypto && typeof globalThis.crypto.getRandomValues === 'function') {
        globalThis.crypto.getRandomValues(key)
    } else {
        for (let i = 0; i < key.length; i++) {
            key[i] = (Math.random() * 0xffffffff) >>> 0
        }
    }
    return Array.from(key)
}

export function xteaEncrypt(data: Uint8Array, key: number[]) {
    const out = new Uint8Array(data.length)
    out.set(data)

    for (let offset = 0; offset < out.length; offset += 8) {
        let v0 = readU32LE(out, offset)
        let v1 = readU32LE(out, offset + 4)
        let sum = 0 >>> 0

        for (let i = 0; i < 32; i++) {
            v0 = (v0 + ((((v1 << 4) ^ (v1 >>> 5)) + v1) ^ (sum + key[sum & 3]))) >>> 0
            sum = (sum + XTEA_DELTA) >>> 0
            v1 = (v1 + ((((v0 << 4) ^ (v0 >>> 5)) + v0) ^ (sum + key[(sum >>> 11) & 3]))) >>> 0
        }

        writeU32LE(out, offset, v0)
        writeU32LE(out, offset + 4, v1)
    }

    return out
}

export function xteaDecrypt(data: Uint8Array, key: number[]) {
    const out = new Uint8Array(data.length)
    out.set(data)

    for (let offset = 0; offset < out.length; offset += 8) {
        let v0 = readU32LE(out, offset)
        let v1 = readU32LE(out, offset + 4)
        let sum = (XTEA_DELTA << 5) >>> 0

        for (let i = 0; i < 32; i++) {
            v1 = (v1 - ((((v0 << 4) ^ (v0 >>> 5)) + v0) ^ (sum + key[(sum >>> 11) & 3]))) >>> 0
            sum = (sum - XTEA_DELTA) >>> 0
            v0 = (v0 - ((((v1 << 4) ^ (v1 >>> 5)) + v1) ^ (sum + key[sum & 3]))) >>> 0
        }

        writeU32LE(out, offset, v0)
        writeU32LE(out, offset + 4, v1)
    }

    return out
}

function modPow(base: bigint, exponent: bigint, modulus: bigint) {
    let result = 1n
    let b = base % modulus
    let e = exponent

    while (e > 0n) {
        if (e & 1n) {
            result = (result * b) % modulus
        }
        e >>= 1n
        b = (b * b) % modulus
    }

    return result
}

export function getRsaKeySize(rsaN: string) {
    const modulus = BigInt(rsaN)
    const bitLength = modulus.toString(2).length
    const byteLength = Math.ceil(bitLength / 8)
    const aligned = Math.floor(byteLength / 128) * 128
    return aligned > 0 ? aligned : byteLength
}

export function rsaEncrypt(block: Uint8Array, rsaN: string, rsaE: string = '65537') {
    const modulus = BigInt(rsaN)
    const exponent = BigInt(rsaE)
    const keySize = block.length

    let m = 0n
    for (let i = 0; i < block.length; i++) {
        m = (m << 8n) + BigInt(block[i])
    }

    const c = modPow(m, exponent, modulus)
    const out = new Uint8Array(keySize)
    let value = c
    for (let i = keySize - 1; i >= 0; i--) {
        out[i] = Number(value & 0xffn)
        value >>= 8n
    }

    return out
}
