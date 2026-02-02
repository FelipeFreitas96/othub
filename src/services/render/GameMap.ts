import { Tile } from '../client/Tile'
import { Position } from '../client/Position'
import { DEFAULT_DRAW_FLAGS } from '../graphics/drawFlags'
import { ThingTypeManager } from '../things/thingTypeManager'
import { DrawPool } from '../graphics/DrawPool'

export class GameMap {
  tiles: Map<string, Tile>
  worldTiles: Map<string, Tile>
  z: number
  zMin: number
  zMax: number
  cameraZ: number
  cameraX: number
  cameraY: number
  range: any
  multifloor: boolean = false

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

  _key(x: number, y: number, z: number) {
    return `${x},${y},${z}`
  }

  _wkey(x: number, y: number, z: number) {
    return `${x},${y},${z}`
  }

  getTile(x: number, y: number, z: number) {
    return this.tiles.get(this._key(x, y, z)) || null
  }

  getTileWorld(x: number, y: number, z: number) {
    return this.worldTiles.get(this._wkey(x, y, z)) || null
  }

  /**
   * OTC Position::coveredUp() – tile above (one floor up).
   */
  coveredUp(pos: Position): Position {
    return new Position(pos.x + 1, pos.y + 1, pos.z - 1)
  }

  /**
   * OTC Map::isCompletelyCovered(const Position& pos, int firstFloor)
   * Only check: for each floor above (coveredUp), 2x2 at tilePos.translated(-x,-y) (x,y in 0..1)
   * must all be isFullyOpaque. No hasTopGround block in OTC.
   */
  isCompletelyCovered(tile: Tile, firstFloor: number, types: ThingTypeManager) {
    const checkTile = tile
    const wx = checkTile?.m_meta?.wx ?? checkTile?.x
    const wy = checkTile?.m_meta?.wy ?? checkTile?.y
    if (!Number.isFinite(wx) || !Number.isFinite(wy)) return false
    let pos: Position = new Position(wx, wy, checkTile.z)
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

  ensureTile(x: number, y: number, z: number) {
    const k = this._key(x, y, z)
    let t = this.tiles.get(k)
    if (!t) {
      t = new Tile(x, y, z)
      this.tiles.set(k, t)
    }
    return t
  }

  loadFromOtState(state: any, thingsRef: { current: { types: ThingTypeManager } }) {
    // NOTA: Removido tiles.clear() e worldTiles.clear() para evitar frame preto durante o walk.
    // O mapa agora é atualizado de forma incremental.
    
    this.cameraZ = state?.pos?.z ?? 0
    this.z = this.cameraZ
    this.zMin = state?.zMin ?? this.cameraZ
    this.zMax = state?.zMax ?? this.cameraZ
    this.range = state?.range || null
    this.cameraX = state?.pos?.x ?? 0
    this.cameraY = state?.pos?.y ?? 0

    this.multifloor = !!(this.zMax > this.zMin)

    const types = thingsRef?.current?.types ?? null
    const floors = state?.floors || { [this.cameraZ]: { tiles: state?.tiles || [] } }
    
    // Lista de chaves de tiles que foram atualizados neste ciclo
    const updatedKeys = new Set<string>()

    for (const [zStr, floor] of Object.entries(floors)) {
      const z = parseInt(zStr, 10)
      if (!Number.isFinite(z)) continue
      const rows = (floor as any)?.tiles || []
      for (let y = 0; y < rows.length; y++) {
        for (let x = 0; x < rows[y].length; x++) {
          const cell = rows[y][x]
          if (!cell) continue
          
          const k = this._key(x, y, z)
          updatedKeys.add(k)
          
          const tile = this.ensureTile(x, y, z)
          tile.setStack(cell.stack || [], cell, types)
          
          const wx = cell.wx
          const wy = cell.wy
          if (Number.isFinite(wx) && Number.isFinite(wy)) {
            // OTC: Tile/Item variation uses WORLD position (m_position), not view position.
            // Item::updatePatterns() uses m_position.x/y/z for variation.
            const worldPos: Position = new Position(Number(wx), Number(wy), z)
            tile.m_position = worldPos
            for (const thing of tile.m_things) {
              if (thing?.setPosition) thing.setPosition(worldPos)
            }
            const wk = this._wkey(wx, wy, z)
            this.worldTiles.set(wk, tile)
          }
        }
      }
    }

    // Remove tiles que não estão mais no estado (fora da área aware)
    for (const key of this.tiles.keys()) {
      if (!updatedKeys.has(key)) {
        this.tiles.delete(key)
      }
    }
  }

  draw(pipeline: DrawPool) {
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
          t.draw(pipeline, drawFlags, x, y)
        }
      }
    }
  }
}
