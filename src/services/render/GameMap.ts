import { Tile } from '../client/Tile'
import { Position } from '../client/Position'
import { DEFAULT_DRAW_FLAGS } from '../graphics/drawFlags'
import { ThingTypeManager } from '../things/thingTypeManager'
import { DrawPool } from '../graphics/DrawPool'

/** OTC: MapView lê tiles direto do mapa (g_map.getTile). Interface para GameMap delegar. */
export interface MapSource {
  getTile(pos: PositionLike): Tile | null
  getCentralPosition(): Position
  getAwareRange(): { left: number, right: number, top: number, bottom: number }
}
export type PositionLike = Position | { x: number, y: number, z: number }

export class GameMap {
  tiles: Map<string, Tile>
  worldTiles: Map<string, Tile>
  z: number
  zMin: number
  zMax: number
  cameraZ: number
  cameraX: number
  cameraY: number
  range: { left: number, right: number, top: number, bottom: number } | null
  multifloor: boolean = false
  /** OTC: view usa o mapa como fonte; não existe loadFromOtState no mapview.cpp */
  sourceMap: MapSource | null = null

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

  /** OTC mapview.cpp: view lê do mapa; setSourceMap(g_map). */
  setSourceMap(map: MapSource | null) {
    this.sourceMap = map
  }

  _key(x: number, y: number, z: number) {
    return `${x},${y},${z}`
  }

  _wkey(x: number, y: number, z: number) {
    return `${x},${y},${z}`
  }

  /**
   * getTile(ix, iy, z): índices de view. OTC mapview.cpp L354-356: tilePos = camera.translated(ix - virtualCenterOffset.x, iy - virtualCenterOffset.y); tilePos.coveredUp(camera.z - iz); g_map.getTile(tilePos).
   */
  getTile(x: number, y: number, z: number) {
    if (this.sourceMap) {
      const r = this.range ?? { left: 8, top: 6 }
      const vcx = r.left
      const vcy = r.top
      const wx = this.cameraX + (x - vcx) + (this.cameraZ - z)
      const wy = this.cameraY + (y - vcy) + (this.cameraZ - z)
      return this.sourceMap.getTile({ x: wx, y: wy, z }) ?? null
    }
    return this.tiles.get(this._key(x, y, z)) || null
  }

  getTileWorld(x: number, y: number, z: number) {
    if (this.sourceMap) {
      return this.sourceMap.getTile({ x, y, z }) ?? null
    }
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
    const wx = checkTile?.m_position?.x ?? checkTile?.m_meta?.wx ?? checkTile?.x
    const wy = checkTile?.m_position?.y ?? checkTile?.m_meta?.wy ?? checkTile?.y
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

  /**
   * OTC mapview.cpp: view só precisa da câmera e do range; tiles vêm de g_map.getTile (setSourceMap).
   * Não existe loadFromOtState no OTClient.
   */
  setCameraFromMap(source: MapSource) {
    const pos = source.getCentralPosition()
    const r = source.getAwareRange()
    this.cameraX = pos.x
    this.cameraY = pos.y
    this.cameraZ = pos.z
    this.z = this.cameraZ
    this.range = r
    this.zMin = Math.max(0, this.cameraZ - 2)
    this.zMax = Math.min(15, this.cameraZ + 2)
    this.multifloor = this.zMax > this.zMin
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
