export class FileStream {
  constructor(arrayBuffer) {
    this.b = new Uint8Array(arrayBuffer)
    this.p = 0
  }
  tell() { return this.p }
  seek(pos) { this.p = Math.max(0, Math.min(this.b.length, pos | 0)) }
  eof() { return this.p >= this.b.length }
  can(n) { return this.p + n <= this.b.length }
  u8() { if (!this.can(1)) throw new Error('EOF'); return this.b[this.p++] }
  u16() { if (!this.can(2)) throw new Error('EOF'); const v = this.b[this.p] | (this.b[this.p + 1] << 8); this.p += 2; return v }
  u32() {
    if (!this.can(4)) throw new Error('EOF')
    const v = (this.b[this.p]) | (this.b[this.p + 1] << 8) | (this.b[this.p + 2] << 16) | (this.b[this.p + 3] << 24)
    this.p += 4
    return v >>> 0
  }
  str() {
    const n = this.u16()
    if (!this.can(n)) throw new Error('EOF')
    let s = ''
    for (let i = 0; i < n; i++) s += String.fromCharCode(this.b[this.p++])
    return s
  }
}
