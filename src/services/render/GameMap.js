import { Tile } from '../client/Tile.js'
import { DEFAULT_DRAW_FLAGS } from '../graphics/drawFlags.js'

export class GameMap {
  constructor() {
    this.tiles = new Map()
    this.worldTiles = new Map()
    this.z = 0
    this.zMin = 0
    this.zMax = 0
    this.cameraZ = 0
    this.cameraX = 0
    this.cameraY = 0
    this.range = null
  }

  _key(x, y, z) {
    return `${x},${y},${z}`
  }

  _wkey(x, y, z) {
    return `${x},${y},${z}`
  }

  getTile(x, y, z) {
    return this.tiles.get(this._key(x, y, z)) || null
  }

  getTileWorld(x, y, z) {
    return this.worldTiles.get(this._wkey(x, y, z)) || null
  }

  /**
   * OTC Position::coveredUp() – tile above (one floor up).
   */
  coveredUp(pos) {
    return { x: pos.x + 1, y: pos.y + 1, z: pos.z - 1 }
  }

  /**
   * OTC Map::isCompletelyCovered(const Position& pos, int firstFloor)
   * Only check: for each floor above (coveredUp), 2x2 at tilePos.translated(-x,-y) (x,y in 0..1)
   * must all be isFullyOpaque. No hasTopGround block in OTC.
   */
  isCompletelyCovered(tile, firstFloor, types) {
    const checkTile = tile
    const wx = checkTile?.meta?.wx ?? checkTile?.x
    const wy = checkTile?.meta?.wy ?? checkTile?.y
    if (!Number.isFinite(wx) || !Number.isFinite(wy)) return false
    let pos = { x: wx, y: wy, z: checkTile.z }
    while (pos.z > firstFloor) {
      pos = this.coveredUp(pos)
      if (pos.z < firstFloor) break

      let covered = true
      let done = false
      for (let dx = 0; dx < 2 && !done; dx++) {
        for (let dy = 0; dy < 2 && !done; dy++) {
          const t = this.getTileWorld(pos.x - dx, pos.y - dy, pos.z)
          if (!t || !t.isFullyOpaque()) covered = false
          if (dx === 0 && dy === 0 && (!checkTile || checkTile.isSingleDimension(types))) done = true
        }
      }
      if (covered) return true
    }
    return false
  }

  ensureTile(x, y, z) {
    const k = this._key(x, y, z)
    let t = this.tiles.get(k)
    if (!t) {
      t = new Tile(x, y, z)
      this.tiles.set(k, t)
    }
    return t
  }

  loadFromOtState(state, thingsRef) {
    this.tiles.clear()
    this.worldTiles.clear()
    this.cameraZ = state?.pos?.z ?? 0
    this.z = this.cameraZ
    this.zMin = state?.zMin ?? this.cameraZ
    this.zMax = state?.zMax ?? this.cameraZ
    this.range = state?.range || null
    this.cameraX = state?.pos?.x ?? 0
    this.cameraY = state?.pos?.y ?? 0

    this.multifloor = !!(this.zMax > this.zMin)

    const types = thingsRef?.current?.types ?? thingsRef?.types ?? null
    const floors = state?.floors || { [this.cameraZ]: { tiles: state?.tiles || [] } }
    for (const [zStr, floor] of Object.entries(floors)) {
      const z = parseInt(zStr, 10)
      if (!Number.isFinite(z)) continue
      const rows = floor?.tiles || []
      for (let y = 0; y < rows.length; y++) {
        for (let x = 0; x < rows[y].length; x++) {
          const cell = rows[y][x]
          if (!cell) continue
          const tile = this.ensureTile(x, y, z)
          tile.setStack(cell.stack || [], cell, types)
          const wx = cell.wx
          const wy = cell.wy
          if (Number.isFinite(wx) && Number.isFinite(wy)) {
            this.worldTiles.set(this._wkey(wx, wy, z), tile)
          }
        }
      }
    }
  }

  draw(pipeline) {
    const things = pipeline.thingsRef.current

    // Enable multifloor when we have multiple floors available.
    this.multifloor = !!(this.zMax > this.zMin)

    // OTClient-style: decide which floors are visible.
    const firstFloor = pipeline.calcFirstVisibleFloor?.(things.types) ?? (this.zMin ?? this.cameraZ)
    const lastFloor = pipeline.calcLastVisibleFloor?.(firstFloor) ?? (this.zMax ?? this.cameraZ)

    this.zMin = firstFloor
    this.zMax = lastFloor

    const zMin = this.zMin
    const zMax = this.zMax
    const drawFlags = DEFAULT_DRAW_FLAGS
    for (let z = zMax; z >= zMin; z--) {
      this.z = z
      for (let s = 0; s <= (pipeline.w - 1) + (pipeline.h - 1); s++) {
        const yStart = Math.max(0, s - (pipeline.w - 1))
        const yEnd = Math.min(pipeline.h - 1, s)
        for (let y = yStart; y <= yEnd; y++) {
          const x = s - y
          const t = this.getTile(x, y, z)
          if (!t) continue
          if (!t.isDrawable()) continue
          if (this.isCompletelyCovered(t, firstFloor, things.types)) continue
          t.draw(pipeline, drawFlags)
        }
      }
    }
  }
}
