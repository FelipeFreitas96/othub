/**
 * MapView – 1:1 port of OTClient src/client/mapview.h + mapview.cpp
 * Copyright (c) 2010-2020 OTClient; ported to JS for this project.
 *
 * - visibleDimension (Size w,h)
 * - cachedVisibleTiles (draw order: z descending, then diagonal)
 * - updateVisibleTilesCache() – fills cache; calcFirstVisibleFloor, calcLastVisibleFloor
 * - draw() – uses cache, one tile.draw() per cached tile
 */

import * as THREE from 'three'
import { GameMap } from '../render/GameMap.js'
import { DrawPool } from '../graphics/DrawPool.js'
import { DEFAULT_DRAW_FLAGS } from '../graphics/drawFlags.js'
import { localPlayer } from '../game/LocalPlayer.js'
import { g_map } from './ClientMap.js'

const TILE_PIXELS = 32
/** LERP 0 = câmera fixa no alvo (sem suavização). */
const CAMERA_FOLLOW_LERP = 0

export class MapView {
  constructor({ host, w, h, thingsRef, mapStoreRef }) {
    this.m_visibleDimension = { width: w, height: h }
    this.w = w
    this.h = h
    this.thingsRef = thingsRef
    this.mapStoreRef = mapStoreRef ?? g_map

    this.m_cachedFirstVisibleFloor = 7
    this.m_cachedLastVisibleFloor = 7
    this.m_cachedVisibleTiles = []
    this.m_mustUpdateVisibleTilesCache = true

    // Smooth camera: lerp toward (center + walk offset) so the view follows the player smoothly when walking
    this.m_smoothCameraX = null
    this.m_smoothCameraY = null

    this.scene = new THREE.Scene()
    this.camera = new THREE.OrthographicCamera(-w / 2, w / 2, h / 2, -h / 2, 0.1, 100)
    this.camera.position.set(0, 0, 10)

    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
    this.renderer.setPixelRatio(window.devicePixelRatio || 1)
    host.appendChild(this.renderer.domElement)

    const debugQueue = typeof window !== 'undefined' && !!window.__otDebugQueue
    const debugDelayMs = typeof window !== 'undefined' ? (window.__otDebugDelayMs ?? 25) : 25
    this.pipeline = new DrawPool({ scene: this.scene, w, h, thingsRef, mapStoreRef: this.mapStoreRef, debugQueue, debugDelayMs })
    this.map = new GameMap()
    this.pipeline.setMap(this.map)

    this.resize(host)
  }

  getVisibleDimension() { return this.m_visibleDimension }
  getCachedFirstVisibleFloor() { return this.m_cachedFirstVisibleFloor }
  getCachedLastVisibleFloor() { return this.m_cachedLastVisibleFloor }

  requestVisibleTilesCacheUpdate() {
    this.m_mustUpdateVisibleTilesCache = true
  }

  /** OTC MapView::onCameraMove(const Point& offset) – mapview.cpp L518-524: requestUpdateMapPosInfo(); if isFollowingCreature() updateViewport(direction). */
  onCameraMove(offset) {
    this.requestVisibleTilesCacheUpdate()
  }

  /** OTC MapView::onTileUpdate(pos, thing, operation) – mapview.cpp L544-555: if thing&&isOpaque&&op==REMOVE m_resetCoveredCache; if op==CLEAN destroyHighlightTile, requestUpdateVisibleTiles. */
  onTileUpdate(pos, thing, operation) {
    if (operation === 'clean') this.requestVisibleTilesCacheUpdate()
  }

  setMapState(state) {
    this.map.loadFromOtState(state, this.thingsRef)
    this.pipeline.setMap(this.map)
    this.requestVisibleTilesCacheUpdate()
  }

  /**
   * Simplified port of OTC MapView::updateVisibleTiles() (opentibiabr/otclient mapview.cpp ~L294–L414).
   *
   * OTC updateVisibleTiles() is ~120 lines and does:
   * 1. Early return if !camera.isValid().
   * 2. Clear per-floor cache: for (m_floorMin..m_floorMax) m_floors[z].cachedVisibleTiles.clear().
   * 3. lockedFirstVisibleFloor = (floorViewMode == LOCKED) ? camera.z : -1.
   * 4. If lastCameraPosition != camera: onFloorChange if z changed; recalc first/last visible floor; m_floorMin = m_floorMax = camera.z.
   * 5. cachedFirstVisibleFloor for processing: if ALWAYS_WITH_TRANSPARENCY || canFloorFade() then calcFirstVisibleFloor(false), else use cached.
   * 6. Fading (Kondra): FadeType NONE/FADE_OUT/FADE_IN, fadingTimers per floor, getFadeLevel() used in draw.
   * 7. lastCameraPosition = camera; destroyHighlightTile().
   * 8. checkIsCovered = !m_drawCoveredThings && getFadeLevel(firstVisibleFloor) == 1.f.
   * 9. numDiagonals = m_drawDimension.width() + m_drawDimension.height() - 1 (OTC uses drawDimension = visibleDimension + 3).
   * 10. processDiagonalRange: tilePos = camera.translated(ix - virtualCenterOffset.x, iy - virtualCenterOffset.y).coveredUp(camera.z - iz);
   *     addTile logic with isCompletelyCovered + ALWAYS_WITH_TRANSPARENCY + isCovered; tile->onAddInMapView(); shades for lights; update m_floorMin/m_floorMax.
   * 11. Optional multithreading: split diagonals across threads, merge m_floorThreads into m_floors.
   * 12. m_updateVisibleTiles = false; m_resetCoveredCache = false; updateHighlightTile(m_mousePosition).
   *
   * Our simplified version:
   * - Same loop structure: floors (last→first), diagonals, (iy,ix). Same numDiagonals formula; we use visible (w,h) not drawDimension (w+3, h+3).
   * - We use map.getTile(ix, iy, z) (view grid); OTC uses world tilePos = camera.translated(ix-vcx, iy-vcy).coveredUp(camera.z - iz).
   * - We always check isCompletelyCovered; we have no FloorViewMode, no fading, no per-floor cache (single flat array), no shades/lights, no onAddInMapView, no multithreading, no highlight at end.
   * - Extra: firstVisibleFloor capped at cameraZ in DrawPool.calcFirstVisibleFloor.
   */
  updateVisibleTilesCache() {
    const things = this.thingsRef?.current
    const types = things?.types
    this.m_cachedFirstVisibleFloor = this.pipeline.calcFirstVisibleFloor?.(types) ?? this.map.cameraZ ?? 7
    this.m_cachedLastVisibleFloor = this.pipeline.calcLastVisibleFloor?.(this.m_cachedFirstVisibleFloor) ?? this.map.cameraZ ?? 7
    this.m_cachedFirstVisibleFloor = Math.max(0, Math.min(15, this.m_cachedFirstVisibleFloor))
    this.m_cachedLastVisibleFloor = Math.max(0, Math.min(15, this.m_cachedLastVisibleFloor))
    if (this.m_cachedLastVisibleFloor < this.m_cachedFirstVisibleFloor) this.m_cachedLastVisibleFloor = this.m_cachedFirstVisibleFloor

    this.m_cachedVisibleTiles = []
    const w = this.w
    const h = this.h
    const firstFloor = this.m_cachedFirstVisibleFloor
    const lastFloor = this.m_cachedLastVisibleFloor

    for (let z = lastFloor; z >= firstFloor; z--) {
      const numDiagonals = w + h - 1
      for (let diagonal = 0; diagonal < numDiagonals; diagonal++) {
        const advance = (diagonal >= h) ? diagonal - h : 0
        for (let iy = diagonal - advance, ix = advance; iy >= 0 && ix < w; iy--, ix++) {
          const tile = this.map.getTile(ix, iy, z)
          if (!tile) continue
          const onCameraFloor = z === this.map.cameraZ
          if (!onCameraFloor && !tile.isDrawable()) continue
          if (tile.isCompletelyCovered(firstFloor, false, this.map, types)) continue;

          this.m_cachedVisibleTiles.push({ z, tile, x: ix, y: iy })
        }
      }
    }

    if (typeof window !== 'undefined' && window.__otDebugFloors) {
      const tilesByZ = {}
      for (const e of this.m_cachedVisibleTiles) tilesByZ[e.z] = (tilesByZ[e.z] ?? 0) + 1
      console.debug('[floors] first=', firstFloor, 'last=', lastFloor, 'total=', this.m_cachedVisibleTiles.length, 'tilesByZ=', tilesByZ)
    }

    this.m_mustUpdateVisibleTilesCache = false
  }

  draw() {
    const mapStore = this.mapStoreRef?.current
    const now = typeof performance !== 'undefined' ? performance.now() : Date.now()
    if (mapStore?.center) {
      const pos = mapStore.center
      const last = this._lastMapStoreCenter
      if (!last || last.x !== pos.x || last.y !== pos.y || last.z !== pos.z) {
        this._lastMapStoreCenter = { x: pos.x, y: pos.y, z: pos.z }
        this.setMapState(mapStore.getMapStateForView())
        if (this.m_smoothCameraX == null || this.m_smoothCameraY == null) {
          this.m_smoothCameraX = pos.x
          this.m_smoothCameraY = pos.y
        }
      }

      // OTC: camera = center + getWalkOffset() em pixels (sem lerp). calcFramebufferSource: drawOffset += m_followingCreature->getWalkOffset() * scaleFactor.
      let targetX = pos.x
      let targetY = pos.y
      const playerId = localPlayer?.getId?.()
      if (playerId != null && mapStore.getCreatureById) {
        const creature = mapStore.getCreatureById(playerId)
        if (creature?.m_walking && creature.getWalkOffset) {
          const off = creature.getWalkOffset()
          targetX = pos.x + (off.x ?? 0) / TILE_PIXELS
          targetY = pos.y + (off.y ?? 0) / TILE_PIXELS
        }
      }
      if (this.m_smoothCameraX == null) this.m_smoothCameraX = targetX
      if (this.m_smoothCameraY == null) this.m_smoothCameraY = targetY
      if (CAMERA_FOLLOW_LERP <= 0) {
        this.m_smoothCameraX = targetX
        this.m_smoothCameraY = targetY
      } else {
        this.m_smoothCameraX += (targetX - this.m_smoothCameraX) * CAMERA_FOLLOW_LERP
        this.m_smoothCameraY += (targetY - this.m_smoothCameraY) * CAMERA_FOLLOW_LERP
      }
      const offsetX = this.m_smoothCameraX - pos.x
      const offsetY = this.m_smoothCameraY - pos.y
      this.camera.position.set(-offsetX, -offsetY, 10)
    }
    if (this.m_mustUpdateVisibleTilesCache) this.updateVisibleTilesCache()
    this.pipeline.beginFrame()
    // OTC: tile->draw(transformPositionTo2D(tile->getPosition()), flags). Walking creatures ficam no Tile (m_walkingCreatures); o Tile obtém via pipeline.mapStoreRef.
    for (const entry of this.m_cachedVisibleTiles) {
      entry.tile.draw(this.pipeline, DEFAULT_DRAW_FLAGS, entry.x, entry.y)
    }
    this.pipeline.endFrame()
  }

  resize(host) {
    const vw = Math.max(1, host.clientWidth)
    const vh = Math.max(1, host.clientHeight)
    this.renderer.setSize(vw, vh, false)

    const viewAspect = vw / vh
    const worldAspect = this.w / this.h
    if (viewAspect > worldAspect) {
      const halfW = (this.h * viewAspect) / 2
      this.camera.left = -halfW
      this.camera.right = halfW
      this.camera.top = this.h / 2
      this.camera.bottom = -this.h / 2
    } else {
      const halfH = (this.w / viewAspect) / 2
      this.camera.left = -this.w / 2
      this.camera.right = this.w / 2
      this.camera.top = halfH
      this.camera.bottom = -halfH
    }
    this.camera.updateProjectionMatrix()
  }

  render() {
    this.renderer.render(this.scene, this.camera)
  }

  dispose() {
    this.renderer.dispose()
  }
}
