/**
 * MapView – port of OTClient src/client/mapview.h + mapview.cpp
 * Copyright (c) 2010-2026 OTClient; ported to JS for this project.
 *
 * OTC: não existe loadFromOtState nem setMapState. A view lê tiles direto do mapa (g_map.getTile).
 * - preLoad(): if (m_updateVisibleTiles) updateVisibleTiles(); g_map.updateAttachedWidgets
 * - updateVisibleTiles(): OTC L286 – camera valid, clear cache, diagonal loop, tilePos = camera.translated(ix - vc); g_map.getTile(tilePos)
 * - onTileUpdate(pos, thing, op): se op==CLEAN requestUpdateVisibleTiles; se thing opaque REMOVE m_resetCoveredCache
 * - onCameraMove(offset): requestUpdateMapPosInfo; se isFollowingCreature updateViewport
 * - onMapCenterChange(): requestUpdateVisibleTiles
 */

import * as THREE from 'three'
import { g_drawPool } from '../graphics/DrawPoolManager'
import { g_painter, Rect } from '../graphics/Painter'
import { DrawPool, DrawPoolType, DrawOrder } from '../graphics/DrawPool'
import { DEFAULT_DRAW_FLAGS, DRAW_THINGS_FLAGS } from '../graphics/drawFlags'
import { g_player } from './LocalPlayer'
import { g_map } from './ClientMap'
import { g_dispatcher } from '../framework/EventDispatcher'
import { Position } from './Position'
import { LightView } from './LightView'
import { Creature } from './Creature'
import { Tile } from './Tile'
import { getThings } from '../protocol/things'
import type { Point } from './types'
import { g_gameConfig } from './gameConfig'

const TILE_PIXELS = 32

export class MapView {
  /** OTC: m_visibleDimension – área visível (ex.: 15x11). */
  m_visibleDimension: { width: number, height: number }
  /** OTC: m_drawDimension – área desenhada (ex.: visibleDimension + Size(3,3) = 18x14). */
  m_drawDimension: { width: number, height: number }
  /** OTC mapview.h: m_pool = g_drawPool.get(DrawPoolType::MAP). */
  m_pool: DrawPool
  /** Project-specific: container do canvas (OTC usa o widget UIMap). */
  host: HTMLElement
  m_cachedFirstVisibleFloor: number
  m_cachedLastVisibleFloor: number
  m_cachedVisibleTiles: any[]
  /** OTC mapview.h: m_updateVisibleTiles – true quando precisa rodar updateVisibleTiles(). */
  m_updateVisibleTiles: boolean
  m_smoothCameraX: number | null
  m_smoothCameraY: number | null
  m_fitAwareArea: boolean
  m_zoomLevel: number
  /** OTC mapview.cpp L255: m_resetCoveredCache – onTileUpdate(thing opaque REMOVE) */
  m_resetCoveredCache: boolean = false
  /** OTC: não existe GameMap; view usa g_map.getTile(tilePos) direto. */
  _lastCenter: Position | null = null
  /** OTC mapview.h L247: m_lastCameraPosition – usada em updateVisibleTiles e passada em onMapCenterChange. */
  m_lastCameraPosition: Position | null = null
  /** OTC mapview.h L223: m_lockedFirstVisibleFloor – forced first floor when floor view mode is LOCKED. */
  m_lockedFirstVisibleFloor: number = -1
  /** OTC mapview.h: m_floorMin / m_floorMax – range of floors that have visible tiles. */
  m_floorMin: number = 0
  m_floorMax: number = 0
  /** OTC mapview.h: m_drawCoveredThings – when false, skip tiles that are completely covered. */
  m_drawCoveredThings: boolean = false
  /** OTC mapview.h: m_followingCreature – criatura seguida pela câmera (local player). */
  m_followingCreature: Creature | null = null
  /** OTC: m_customCameraPosition – posição da câmera quando não está seguindo criatura (pan manual). */
  m_customCameraPosition: Position | null = null
  /** OTC: LightView – mapa de luz por tile, desenhado com MULTIPLY por cima da cena. */
  m_lightView: LightView
  /** OTC: m_virtualCenterOffset = (drawDimension/2 - Size(1)).toPoint() – mapview.cpp L489. */
  m_virtualCenterOffset: Point = { x: 0, y: 0 }
  /** OTC mapview.h: m_posInfo – rect e srcRect para preDraw (UIMap::draw). */
  m_posInfo: { rect: Rect, srcRect: Rect } = {
    rect: { x: 0, y: 0, width: 1, height: 1 },
    srcRect: { x: 0, y: 0, width: 1, height: 1 },
  }
  /** OTC: m_floorViewMode – Otc::ALWAYS_WITH_TRANSPARENCY etc. 0 = normal. */
  m_floorViewMode: number = 0
  /** OTC: m_drawViewportEdge. */
  m_drawViewportEdge: boolean = false
  /** OTC: m_shadowFloorIntensity – opacity for floor above camera. */
  m_shadowFloorIntensity: number = 0
  /** OTC: m_rectDimension – rect for shadow fill (draw dimension in pixels). */
  m_rectDimension: Rect = { x: 0, y: 0, width: 0, height: 0 }
  /** OTC: m_crosshairTexture. */
  m_crosshairTexture: unknown = null
  /** OTC: m_mousePosition. */
  m_mousePosition: Position | null = null
  /** OTC: m_lastHighlightTile. */
  m_lastHighlightTile: Tile | null = null
  /** Project: backend WebGL (não existe no OTC; lá é platform/window). Criado lazy em ensureBackend(). */
  private _renderer: THREE.WebGLRenderer | null = null
  private _camera: THREE.OrthographicCamera | null = null
  private _scene: THREE.Scene | null = null
  private _lightTexture: THREE.CanvasTexture | null = null
  private _lightOverlayMesh: THREE.Mesh | null = null

  constructor({ host, w, h }: { host: HTMLElement, w: number, h: number }) {
    const visible = this.getViewportDimensions()
    this.m_visibleDimension = { width: visible.width, height: visible.height }
    this.m_drawDimension = { width: w, height: h }
    this.m_virtualCenterOffset = {
      x: (this.m_drawDimension.width / 2) - 1,
      y: (this.m_drawDimension.height / 2) - 1,
    }
    this.host = host

    /** OTC: m_pool(g_drawPool.get(DrawPoolType::MAP)) – pool é do manager, não criado aqui. */
    const pool = g_drawPool.get(DrawPoolType.MAP)
    if (!pool) throw new Error('MapView: g_drawPool.init() must be called before creating MapView')
    this.m_pool = pool

    this.m_cachedFirstVisibleFloor = 7
    this.m_cachedLastVisibleFloor = 7
    this.m_cachedVisibleTiles = []
    this.m_updateVisibleTiles = true

    // Smooth camera: lerp toward (center + walk offset) so the view follows the player smoothly when walking
    this.m_smoothCameraX = null
    this.m_smoothCameraY = null

    this.m_fitAwareArea = true
    this.m_zoomLevel = 1.0

    this.m_lightView = new LightView()
    this.m_lightView.resize(w, h, TILE_PIXELS)
    this.m_lightView.setGlobalLight(g_map?.getLight?.() ?? { intensity: 250, color: 215 })

    this.m_pool.setMap(null)
    this.m_pool.w = this.m_drawDimension.width
    this.m_pool.h = this.m_drawDimension.height
    const bufferSize = { width: this.m_drawDimension.width * TILE_PIXELS, height: this.m_drawDimension.height * TILE_PIXELS }
    this.m_pool.getFrameBuffer()?.resize(bufferSize)
    this.m_rectDimension = { x: 0, y: 0, width: bufferSize.width, height: bufferSize.height }
    // Do not share this.m_pool with FOREGROUND_MAP/CREATURE_INFORMATION: each preDraw calls release()
    // and overwrites m_objectsDraw[0], so the last preDraw would leave the MAP pool with only 1 object.

    this.ensureBackend(host)
    this.resize(host)
  }

  /** Project: cria renderer/câmera (e lazy: scene + light overlay). Não existe no OTC. */
  private ensureBackend(host: HTMLElement): void {
    if (this._renderer) return
    this._renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
    this._renderer.setPixelRatio(window.devicePixelRatio || 1)
    this._renderer.outputColorSpace = THREE.SRGBColorSpace
    this._renderer.toneMapping = THREE.NoToneMapping
    this._renderer.toneMappingExposure = 1
    // Canvas must fill its container via CSS; setSize(w,h,false) only sets the internal
    // buffer, so on HiDPI the canvas would overflow without these styles.
    this._renderer.domElement.style.width = '100%'
    this._renderer.domElement.style.height = '100%'
    host.appendChild(this._renderer.domElement)
    const viewW = this.m_drawDimension.width * TILE_PIXELS
    const viewH = this.m_drawDimension.height * TILE_PIXELS
    this._camera = new THREE.OrthographicCamera(0, viewW, 0, viewH, 0.1, 100)
    this._camera.position.set(0, 0, 10)
    g_painter.setRenderer(this._renderer)
  }

  /** Project: scene + overlay de luz a partir de m_lightView.getCanvas(). Chamado em render(). */
  private ensureLightOverlay(): void {
    if (this._scene) return
    this._scene = new THREE.Scene()
    const lightCanvas = this.m_lightView.getCanvas()
    if (lightCanvas) {
      this._lightTexture = new THREE.CanvasTexture(lightCanvas)
      this._lightTexture.colorSpace = THREE.SRGBColorSpace
      const lightMat = new THREE.MeshBasicMaterial({
        map: this._lightTexture,
        transparent: true,
        blending: THREE.MultiplyBlending,
        depthTest: false,
        depthWrite: false,
      })
      const viewW = this.m_drawDimension.width * TILE_PIXELS
      const viewH = this.m_drawDimension.height * TILE_PIXELS
      const lightPlane = new THREE.PlaneGeometry(viewW + 10, viewH + 10)
      this._lightOverlayMesh = new THREE.Mesh(lightPlane, lightMat)
      this._lightOverlayMesh.position.set(viewW / 2, -viewH / 2, 5)
      this._lightOverlayMesh.renderOrder = 1000
      this._scene.add(this._lightOverlayMesh)
    }
  }

  getVisibleDimension() { return this.m_visibleDimension }
  getCachedFirstVisibleFloor() { return this.m_cachedFirstVisibleFloor }
  getCachedLastVisibleFloor() { return this.m_cachedLastVisibleFloor }

  /**
   * OTC: MapView::transformPositionTo2D(position [, relativePosition]) – mapview.h L212-221.
   * Converte Position (mapa 3D) em Point (2D em pixels). relativePosition = câmera por padrão.
   */
  transformPositionTo2D(position: Position, relativePosition?: Position): Point {
    const rel = relativePosition ?? this.getCameraPosition()
    const vcx = this.m_virtualCenterOffset.x
    const vcy = this.m_virtualCenterOffset.y
    return {
      x: (vcx + (position.x - rel.x) - (rel.z - position.z)) * TILE_PIXELS,
      y: (vcy + (position.y - rel.y) - (rel.z - position.z)) * TILE_PIXELS,
    }
  }

  /**
   * OTC: MapView::calcFramebufferSource(const Size& destSize)
   * drawOffset = ((m_drawDimension - m_visibleDimension - Size(1)) / 2) * m_tileSize;
   * if (isFollowingCreature()) drawOffset += getWalkOffset() * scaleFactor;
   * else if (!m_moveOffset.isNull()) drawOffset += m_moveOffset * scaleFactor;
   * srcVisible = m_visibleDimension * m_tileSize; srcSize = destSize scaled to srcVisible (KeepAspectRatio);
   * drawOffset += (srcVisible - srcSize) / 2; return Rect(drawOffset, srcSize);
   * Retornamos Rect em unidades de mundo (x,y = offset da câmera; width,height = área visível em tiles).
   */
  calcFramebufferSource(destSize?: { width: number, height: number }): { x: number, y: number, width: number, height: number } {
    const scaleFactor = 1 / TILE_PIXELS
    const drawW = this.m_drawDimension.width
    const drawH = this.m_drawDimension.height
    const visibleW = this.m_visibleDimension.width
    const visibleH = this.m_visibleDimension.height

    // drawOffset = ((m_drawDimension - m_visibleDimension - Size(1)).toPoint() / 2) * m_tileSize (em pixels no OTC)
    let drawOffsetPxX = ((drawW - visibleW - 1) / 2) * TILE_PIXELS
    let drawOffsetPxY = ((drawH - visibleH - 1) / 2) * TILE_PIXELS

    if (this.isFollowingCreature()) {
      const creature = this.getFollowingCreature()
      if (creature) {
        const walkOffset = creature.getWalkOffset()
        // OTC: drawOffset += getWalkOffset() * scaleFactor; scaleFactor = m_tileSize/Otc::TILE_PIXELS (≈ 1)
        drawOffsetPxX += walkOffset.x
        drawOffsetPxY += walkOffset.y
      }
    }
    // else if (!m_moveOffset.isNull()) drawOffset += m_moveOffset * scaleFactor; // TODO: m_moveOffset

    const srcVisiblePxW = visibleW * TILE_PIXELS
    const srcVisiblePxH = visibleH * TILE_PIXELS

    let srcSizePxW = srcVisiblePxW
    let srcSizePxH = srcVisiblePxH
    if (destSize && destSize.width > 0 && destSize.height > 0) {
      const destAspect = destSize.width / destSize.height
      const visibleAspect = srcVisiblePxW / srcVisiblePxH
      if (destAspect > visibleAspect) {
        srcSizePxH = srcVisiblePxH
        srcSizePxW = srcVisiblePxH * destAspect
      } else {
        srcSizePxW = srcVisiblePxW
        srcSizePxH = srcVisiblePxW / destAspect
      }
      drawOffsetPxX += (srcVisiblePxW - srcSizePxW) / 2
      drawOffsetPxY += (srcVisiblePxH - srcSizePxH) / 2
    }

    return {
      x: drawOffsetPxX * scaleFactor,
      y: drawOffsetPxY * scaleFactor,
      width: srcSizePxW * scaleFactor,
      height: srcSizePxH * scaleFactor,
    }
  }

  /** OTC MapView::isFollowingCreature() – true quando m_followingCreature está setado. */
  isFollowingCreature(): boolean {
    return this.m_followingCreature != null
  }

  /** OTC MapView::getFollowingCreature() / m_followingCreature. */
  getFollowingCreature(): Creature | null {
    return this.m_followingCreature
  }

  /** OTC mapview.cpp L686-698: getCameraPosition() = m_followingCreature ? creature->getPosition() : m_customCameraPosition (ou central).
   * During walk: use source position (m_lastStepFromPosition) so camera stays at (x,y) and character animates from (x,y) to (x+1,y).
   * After walk: use getPosition() (destination).
   */
  getCameraPosition(): Position {
    if (this.m_followingCreature) {
      const c = this.m_followingCreature as Creature
      if (c.m_walking && c.m_lastStepFromPosition) {
        return c.m_lastStepFromPosition.clone()
      }
      const pos = c.getPosition()
      return pos ? pos.clone() : g_map.getCentralPosition()
    }
    if (this.m_customCameraPosition) return this.m_customCameraPosition.clone()
    return g_map.getCentralPosition()
  }

  /** OTC mapview.h L103: resetLastCamera() – m_lastCameraPosition = {}. */
  resetLastCamera() {
    this.m_lastCameraPosition = null
  }

  /** Para Map::setCentralPosition chamar onMapCenterChange(centralPosition, mapView->m_lastCameraPosition). */
  getLastCameraPosition(): Position | null {
    return this.m_lastCameraPosition
  }

  /** OTC mapview.cpp L581-584: onMapCenterChange(newPos, oldPos) – requestUpdateVisibleTiles. */
  onMapCenterChange(_newPos: Position, _oldPos: Position | null) {
    this.requestUpdateVisibleTiles()
  }

  /** OTC mapview.cpp L644-664: followCreature(creature) – seta m_followingCreature, setCameraFollowing(true), m_lastCameraPosition = {}. */
  followCreature(creature: Creature | null) {
    if (creature === this.m_followingCreature) return
    if (!creature) {
      const pos = this.m_followingCreature?.getPosition() ?? g_map.getCentralPosition()
      this.setCameraPosition(pos)
      return
    }
    if (this.m_followingCreature) this.m_followingCreature.setCameraFollowing(false)
    this.m_followingCreature = creature
    creature.setCameraFollowing(true)
    this.m_lastCameraPosition = null
    this.requestUpdateVisibleTiles()
  }

  /** OTC mapview.cpp L666-675: setCameraPosition(pos) – clear following, m_customCameraPosition = pos. */
  setCameraPosition(pos: Position) {
    if (this.m_followingCreature) {
      this.m_followingCreature.setCameraFollowing(false)
      this.m_followingCreature = null
    }
    this.m_customCameraPosition = pos.clone()
    this.requestUpdateVisibleTiles()
  }

  /** OTC mapview.cpp L434-438: lockFirstVisibleFloor(floor) – force first visible floor. */
  lockFirstVisibleFloor(floor: number): void {
    this.m_lockedFirstVisibleFloor = floor
    this.requestUpdateVisibleTiles()
  }

  /** OTC mapview.cpp L440-444: unlockFirstVisibleFloor(). */
  unlockFirstVisibleFloor(): void {
    this.m_lockedFirstVisibleFloor = -1
    this.requestUpdateVisibleTiles()
  }

  /** OTC mapview.cpp: requestUpdateVisibleTiles(). Não existe setMapState no OTClient – view lê direto do mapa. */
  /** OTC mapview.h L187: requestUpdateVisibleTiles() { m_updateVisibleTiles = true; } */
  requestUpdateVisibleTiles(): void {
    this.m_updateVisibleTiles = true
  }

  /** OTC mapview.cpp L518-524: onCameraMove(offset) – requestUpdateMapPosInfo(); if isFollowingCreature() updateViewport(direction). */
  onCameraMove(_offset: { x: number, y: number }) {
    this.requestUpdateVisibleTiles()
    // OTC: if (isFollowingCreature()) updateViewport(m_followingCreature->isWalking() ? getDirection() : InvalidDirection); – viewport edge; we only request cache update.
  }

  /** OTC mapview.cpp L544-555: onTileUpdate – if thing&&isOpaque&&op==REMOVE m_resetCoveredCache; if op==CLEAN requestUpdateVisibleTiles. */
  onTileUpdate(pos: Position, thing: any, operation: string) {
    if (thing?.isOpaque?.() && operation === 'remove') this.m_resetCoveredCache = true
    if (operation === 'clean') this.requestUpdateVisibleTiles()
  }

  /**
   * OTC mapview.cpp L451-499: calcFirstVisibleFloor(checkLimitsFloorsView).
   * Returns first (top) visible floor; respects locked floor, sea floor, and tiles that limit floor view.
   */
  calcFirstVisibleFloor(checkLimitsFloorsView: boolean): number {
    let z = g_gameConfig.getMapSeaFloor()
    if (this.m_lockedFirstVisibleFloor !== -1) {
      z = this.m_lockedFirstVisibleFloor
    } else {
      const cameraPos = Position.from(this.getCameraPosition())
      if (cameraPos.isValid()) {
        let firstFloor = 0
        if (cameraPos.z > g_gameConfig.getMapSeaFloor()) {
          firstFloor = Math.max(
            cameraPos.z - g_gameConfig.getMapAwareUndergroundFloorRange(),
            g_gameConfig.getMapUndergroundFloorRange()
          )
        }
        for (let ix = -1; checkLimitsFloorsView && ix <= 1 && firstFloor < cameraPos.z; ix++) {
          for (let iy = -1; iy <= 1 && firstFloor < cameraPos.z; iy++) {
            const pos = cameraPos.translated(ix, iy)
            const isLookPossible = g_map.isLookPossible(pos)
            if ((ix === 0 && iy === 0) || (Math.abs(ix) !== Math.abs(iy) && isLookPossible)) {
              let upperPos = pos.clone()
              let coveredPos = pos.clone()
              while (coveredPos.coveredUp(1) && upperPos.up(1) && upperPos.z >= firstFloor) {
                const upperTile = g_map.getTile(upperPos)
                if (upperTile?.limitsFloorsView?.(!isLookPossible)) {
                  firstFloor = upperPos.z + 1
                  break
                }
                const coveredTile = g_map.getTile(coveredPos)
                if (coveredTile?.limitsFloorsView?.(isLookPossible)) {
                  firstFloor = coveredPos.z + 1
                  break
                }
              }
            }
          }
        }
        z = firstFloor
      }
    }
    return Math.max(0, Math.min(g_gameConfig.getMapMaxZ(), z))
  }

  /**
   * OTC mapview.cpp L501-521: calcLastVisibleFloor().
   * Returns last (bottom) visible floor; when below sea level shows underground range.
   */
  calcLastVisibleFloor(): number {
    let z = g_gameConfig.getMapSeaFloor()
    const cameraPos = Position.from(this.getCameraPosition())
    if (cameraPos.isValid()) {
      if (cameraPos.z > g_gameConfig.getMapSeaFloor()) {
        z = cameraPos.z + g_gameConfig.getMapAwareUndergroundFloorRange()
      } else {
        z = g_gameConfig.getMapSeaFloor()
      }
    }
    if (this.m_lockedFirstVisibleFloor !== -1) {
      z = Math.max(this.m_lockedFirstVisibleFloor, z)
    }
    return Math.max(0, Math.min(g_gameConfig.getMapMaxZ(), z))
  }

  /**
   * OTC mapview.cpp L286-327: updateVisibleTiles() – 1:1 with C++.
   * Early return if camera invalid; clear cache; calc first/last visible floor; cache visible tiles in diagonal order (tilePos = camera.translated(ix - vc); tilePos.coveredUp(camera.z - iz); g_map.getTile(tilePos)); m_updateVisibleTiles = false.
   */
  updateVisibleTiles(): void {
    const cameraPos = Position.from(this.getCameraPosition())
    if (!cameraPos.isValid()) return

    // OTC: no GameMap; view uses g_map.getTile(tilePos) only.

    // OTC L296-299: clear current visible tiles cache (per-floor in C++; we use a flat list)
    this.m_cachedVisibleTiles = []

    // OTC L305-314: when camera changed, recompute first/last floor and set floorMin/Max
    const lastCam = this.m_lastCameraPosition
    const lastCamPos = lastCam ? Position.from(lastCam) : null
    const lastCamValid = lastCamPos?.isValid() ?? false
    const cameraChanged = !lastCamValid || lastCamPos!.x !== cameraPos.x || lastCamPos!.y !== cameraPos.y || lastCamPos!.z !== cameraPos.z
    if (cameraChanged) {
      if (lastCamValid && lastCamPos!.z !== cameraPos.z) {
        // onFloorChange(cameraPos.z, lastCamPos.z) – OTC L307; we don't implement fade/light here
      }
      const cachedFirstVisibleFloor = this.calcFirstVisibleFloor(true)
      this.m_cachedFirstVisibleFloor = cachedFirstVisibleFloor
      this.m_cachedLastVisibleFloor = Math.max(cachedFirstVisibleFloor, this.calcLastVisibleFloor())
      this.m_floorMin = cameraPos.z
      this.m_floorMax = cameraPos.z
    }

    const cachedFirstVisibleFloor = this.m_cachedFirstVisibleFloor
    // OTC L318-320: optional ALWAYS_WITH_TRANSPARENCY / canFloorFade – we skip, use same cached first floor

    this.m_lastCameraPosition = cameraPos.clone()

    // OTC L342: checkIsCovered – skip fully covered tiles unless drawing them
    const checkIsCovered = !this.m_drawCoveredThings

    const w = this.m_drawDimension.width
    const h = this.m_drawDimension.height
    const vcx = this.m_virtualCenterOffset.x
    const vcy = this.m_virtualCenterOffset.y
    const numDiagonals = w + h - 1

    g_drawPool.select(DrawPoolType.MAP)
    // OTC L348-386: cache visible tiles in draw order (diagonal loop, tilePos = camera.translated(ix - vc); tilePos.coveredUp(camera.z - iz); g_map.getTile(tilePos))
    for (let iz = this.m_cachedLastVisibleFloor; iz >= cachedFirstVisibleFloor; iz--) {
      for (let diagonal = 0; diagonal < numDiagonals; diagonal++) {
        const advance = (diagonal >= h) ? diagonal - h : 0
        for (let iy = diagonal - advance, ix = advance; iy >= 0 && ix < w; iy--, ix++) {
          const tilePos = cameraPos.translated(ix - vcx, iy - vcy).clone()
          if (!tilePos.coveredUp(cameraPos.z - iz)) continue
          const tile = g_map.getTile(tilePos)
          if (!tile || !tile.isDrawable()) continue

          // OTC mapview.cpp L361-366: if (checkIsCovered && tile->isCompletelyCovered(firstFloor, resetCache)) { if (floorViewMode != ALWAYS_WITH_TRANSPARENCY || (tilePos.z < camera.z && tile->isCovered(firstFloor))) addTile = false; }
          let addTile = true
          if (checkIsCovered && tile.isCompletelyCovered(this.m_cachedFirstVisibleFloor, this.m_resetCoveredCache)) {
            const tilePosZ = tile.getPosition().z
            const inTransparencyMode = false
            if (!inTransparencyMode || (tilePosZ < cameraPos.z && tile.isCovered(this.m_cachedFirstVisibleFloor))) addTile = false
          }
          if (addTile) {
            this.m_cachedVisibleTiles.push({ z: iz, tile, x: ix, y: iy })
            tile.onAddInMapView()
          }
          if (addTile) {
            if (iz < this.m_floorMin) this.m_floorMin = iz
            else if (iz > this.m_floorMax) this.m_floorMax = iz
          }
        }
      }
    }

    this.m_updateVisibleTiles = false
    this.m_resetCoveredCache = false
  }

  /** OTC MapView::onGlobalLightChange – atualiza luz global (ex.: subterrâneo). */
  onGlobalLightChange(light: { intensity: number, color: number }) {
    this.m_lightView.setGlobalLight(light)
  }

  /** OTC mapview.cpp L104-118: preLoad() – updateVisibleTiles se necessário; updateAttachedWidgets. */
  private m_preLoadLogCount = 0
  preLoad(): void {
    const needsUpdate = this.m_updateVisibleTiles
    if (needsUpdate) this.updateVisibleTiles()
    ;(g_map as any).updateAttachedWidgets?.(this)

    // DIAGNOSTIC: log first 5 calls
    if (this.m_preLoadLogCount < 5) {
      const cam = this.getCameraPosition()
      const camValid = cam?.isValid?.() ?? false
      const mapCenter = g_map.getCentralPosition?.()
      const tileCount = this.m_cachedVisibleTiles.length
      const floorRange = `${this.m_floorMin}..${this.m_floorMax}`
      const firstFloor = this.m_cachedFirstVisibleFloor
      const lastFloor = this.m_cachedLastVisibleFloor
      const drawDim = `${this.m_drawDimension.width}x${this.m_drawDimension.height}`
      const following = this.m_followingCreature
      const followPos = following?.getPosition?.()
      console.log(
        `[preLoad #${this.m_preLoadLogCount}] needsUpdate=${needsUpdate}` +
        ` cam=(${cam?.x},${cam?.y},${cam?.z}) valid=${camValid}` +
        ` mapCenter=(${mapCenter?.x},${mapCenter?.y},${mapCenter?.z})` +
        ` tiles=${tileCount} floors=${floorRange} first/last=${firstFloor}/${lastFloor}` +
        ` drawDim=${drawDim} following=${!!following} followPos=(${followPos?.x},${followPos?.y},${followPos?.z})`
      )
      // Also check if g_map has any tiles at all
      const centerTile = g_map.getTile?.(cam)
      const hasCenterTile = centerTile != null
      console.log(`[preLoad #${this.m_preLoadLogCount}] g_map.getTile(cam)=${hasCenterTile ? 'EXISTS' : 'NULL'} g_map.tileCount=${(g_map as any).m_tiles?.size ?? (g_map as any).m_tileMap?.size ?? '?'}`)
      this.m_preLoadLogCount++
    }
  }

  /** OTC: getFadeLevel(z) – 0 = skip floor; < .99 use setOpacity. Port: no fade, return 1. */
  getFadeLevel(_z: number): number {
    return 1
  }

  /** OTC: canFloorFade() – reset opacity after floor. Port: false. */
  canFloorFade(): boolean {
    return false
  }

  /** OTC: destroyHighlightTile(). */
  destroyHighlightTile(): void {
    this.m_lastHighlightTile = null
  }

  /** OTC mapview.cpp MapView::drawFloor() – 1:1 with C++. */
  drawFloor(): void {
    const cameraPosition = this.getCameraPosition()
    const camPos = Position.from(cameraPosition)
    const flags = DRAW_THINGS_FLAGS
    for (let z = this.m_floorMax; z >= this.m_floorMin; z--) {
      const fadeLevel = this.getFadeLevel(z)
      if (fadeLevel === 0) break
      if (fadeLevel < 0.99) g_drawPool.setOpacity(fadeLevel)

      const _camera = cameraPosition.clone()
      const alwaysTransparent =
        this.m_floorViewMode === 1 /* Otc::ALWAYS_WITH_TRANSPARENCY */ &&
        z < this.m_cachedFirstVisibleFloor &&
        _camera.coveredUp(camPos.z - z)

      const tilesOnFloor = this.m_cachedVisibleTiles.filter((e: { z: number }) => e.z === z)

      const v = this.m_visibleDimension
      const viewPort = {
        left: Math.floor((v.width - 1) / 2),
        right: v.width - 1 - Math.floor((v.width - 1) / 2),
        top: Math.floor((v.height - 1) / 2),
        bottom: v.height - 1 - Math.floor((v.height - 1) / 2),
      }
      for (const entry of tilesOnFloor) {
        const tile = entry.tile
        if (!this.m_drawViewportEdge && !tile.canRender(flags, cameraPosition, viewPort))
          continue

        if (alwaysTransparent) {
          const range = g_gameConfig.getTileTransparentFloorViewRange()
          const inRange = tile.getPosition().isInRange(_camera, range, range, true)
          g_drawPool.setOpacity(inRange ? 0.16 : 0.7)
        }

        tile.draw(this.transformPositionTo2D(tile.getPosition()), flags)  
        if (alwaysTransparent)
          g_drawPool.resetOpacity()
      }

      for (const missile of g_map.getFloorMissiles(z)) {
        const missileDest = this.transformPositionTo2D(missile.getPosition())
        missile.draw(missileDest, true, this.m_lightView ?? undefined)
      }

      if (this.m_shadowFloorIntensity > 0 && z === camPos.z + 1) {
        g_drawPool.setOpacity(this.m_shadowFloorIntensity, true)
        g_drawPool.setDrawOrder(DrawOrder.FIFTH)
        g_drawPool.addFilledRect(this.m_rectDimension, { r: 0, g: 0, b: 0 })
        g_drawPool.resetDrawOrder()
      }

      if (this.canFloorFade()) g_drawPool.resetOpacity()
      g_drawPool.flush()
    }

    if (this.m_posInfo.rect && this.m_crosshairTexture && this.m_mousePosition?.isValid?.()) {
      const point = this.transformPositionTo2D(this.m_mousePosition)
      const crosshairRect = { x: point.x, y: point.y, width: TILE_PIXELS, height: TILE_PIXELS }
      g_drawPool.addTexturedRect(crosshairRect, this.m_crosshairTexture)
    } else if (this.m_lastHighlightTile) {
      this.m_mousePosition = null
      this.destroyHighlightTile()
    }
  }

  /** OTC mapview.cpp L175-208: drawLights() – clear lightView; shades; tile.drawLight; missiles. */
  drawLights(): void {
    this.m_lightView.clear()
    for (const entry of this.m_cachedVisibleTiles) {
      const dest = this.transformPositionTo2D(entry.tile.getPosition())
      // FIX: tile.draw(dest, drawFlags, lightView) – arguments were in wrong order.
      entry.tile.draw(dest, DEFAULT_DRAW_FLAGS, this.m_lightView)
    }
    this.m_lightView.updatePixels()
  }

  /** OTC mapview.cpp L210-238: drawCreatureInformation() – names, health bars, etc. Stub. */
  drawCreatureInformation(): void {
    // TODO: g_drawPool.scale; flags; loop g_map.getCreatures(); creature->drawInformation
  }

  /** OTC mapview.cpp L240-284: drawForeground(rect) – static texts, animated texts, foreground tiles. Stub. */
  drawForeground(_rect: { x: number, y: number, width: number, height: number }): void {
    // TODO: staticTexts, animatedTexts, m_foregroundTiles
  }

  /** OTC mapview.cpp L59-102: registerEvents() – pool onBeforeDraw/onAfterDraw (shader, opacity). No-op em port. */
  registerEvents(): void {
    // OTC: m_pool->onBeforeDraw / onAfterDraw; we don't use shader/fade in this port
  }

  /**
   * Define um zoom manual (desativa o fit automático).
   * @param {number} zoom - Nível de zoom (1.0 = 100%, 2.0 = 200%, etc.)
   */
  setManualZoom(zoom: number) {
    this.m_fitAwareArea = false
    this.m_zoomLevel = Math.max(0.1, Math.min(5.0, zoom))
    
    const vw = Math.max(1, this.host.clientWidth)
    const vh = Math.max(1, this.host.clientHeight)
    
    // Calcula as dimensões do viewport baseado no zoom (usa m_drawDimension)
    const worldW = this.m_drawDimension.width / this.m_zoomLevel
    const worldH = this.m_drawDimension.height / this.m_zoomLevel
    
    const viewAspect = vw / vh
    const worldAspect = worldW / worldH
    
    // Y-down camera
    if (viewAspect > worldAspect) {
      const halfW = (worldH * viewAspect) / 2
      if (this._camera) {
        this._camera.left = -halfW
        this._camera.right = halfW
        this._camera.top = -worldH / 2
        this._camera.bottom = worldH / 2
      }
    } else {
      const halfH = (worldW / viewAspect) / 2
      if (this._camera) {
        this._camera.left = -worldW / 2
        this._camera.right = worldW / 2
        this._camera.top = -halfH
        this._camera.bottom = halfH
      }
    }
    this._camera?.updateProjectionMatrix()
  }

  /**
   * Obtém as dimensões da área visível do viewport (câmera).
   * No Tibia, a área visível é 15x11 tiles (jogador no centro).
   * A área aware (18x14) é maior pois inclui buffer de tiles nas bordas.
   */
  getViewportDimensions() {
    // Área visível real do Tibia: 15x11 tiles
    return { width: 15, height: 11 }
  }

  /**
   * Ativa/desativa o sistema de fit automático para a área aware.
   * @param {boolean} enabled - Se true, a câmera faz zoom para encaixar a área aware na tela
   */
  setFitAwareArea(enabled: boolean) {
    this.m_fitAwareArea = enabled
    if (this.host) this.resize(this.host)
  }

  /**
   * Retorna se o sistema de fit automático está ativo.
   */
  isFitAwareAreaEnabled() {
    return this.m_fitAwareArea
  }

  /**
   * Obtém o nível de zoom atual calculado para encaixar a área aware.
   */
  getZoomLevel() {
    return this.m_zoomLevel
  }

  resize(host: HTMLElement) {
    if (!this._renderer || !this._camera) return
    const vw = Math.max(1, host.clientWidth)
    const vh = Math.max(1, host.clientHeight)
    this._renderer.setSize(vw, vh, false)

    if (this.m_pool.hasFrameBuffer()) {
      const bufferSize = { width: this.m_drawDimension.width * TILE_PIXELS, height: this.m_drawDimension.height * TILE_PIXELS }
      this.m_pool.getFrameBuffer()!.resize(bufferSize)
      this.m_rectDimension = { x: 0, y: 0, width: bufferSize.width, height: bufferSize.height }
    }

    const viewportW = this.m_visibleDimension.width
    const viewportH = this.m_visibleDimension.height
    const cameraW = this.m_fitAwareArea ? viewportW : this.m_drawDimension.width
    const cameraH = this.m_fitAwareArea ? viewportH : this.m_drawDimension.height
    const viewW = this.m_drawDimension.width * TILE_PIXELS
    const viewH = this.m_drawDimension.height * TILE_PIXELS
    const centerX = viewW / 2
    const centerY = -viewH / 2

    const viewAspect = vw / vh
    const cameraAspect = cameraW / cameraH

    let halfWPx: number
    let halfHPx: number
    if (viewAspect > cameraAspect) {
      halfHPx = (cameraH * TILE_PIXELS) / 2
      halfWPx = (cameraH * viewAspect * TILE_PIXELS) / 2
      this.m_zoomLevel = vh / (cameraH * TILE_PIXELS)
    } else {
      halfWPx = (cameraW * TILE_PIXELS) / 2
      halfHPx = (cameraW / viewAspect * TILE_PIXELS) / 2
      this.m_zoomLevel = vw / (cameraW * TILE_PIXELS)
    }
    // Y-down camera: top=0 is top of screen, bottom=h is bottom.
    this._camera.left = centerX - halfWPx
    this._camera.right = centerX + halfWPx
    this._camera.top = centerY - halfHPx
    this._camera.bottom = centerY + halfHPx
    this._camera.updateProjectionMatrix()

    if (this._lightOverlayMesh && viewW > 0 && viewH > 0) {
      const actualFrustumW = this._camera.right - this._camera.left
      const actualFrustumH = this._camera.top - this._camera.bottom
      const margin = 1.05
      const baseW = viewW + 10
      const baseH = viewH + 10
      this._lightOverlayMesh.scale.set((actualFrustumW * margin) / baseW, (actualFrustumH * margin) / baseH, 1)
    }

    // Camera uses Y-down: top=0, bottom=h. Blit quad dest uses positive Y (0..vh).
    this.m_posInfo.rect = { x: 0, y: 0, width: vw, height: vh }
    this.m_posInfo.srcRect = this.calcFramebufferSource({ width: vw, height: vh })
  }

  dispose() {
    this._renderer?.dispose()
  }
}
