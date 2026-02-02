/**
 * MapView – port of OTClient src/client/mapview.h + mapview.cpp
 * Copyright (c) 2010-2026 OTClient; ported to JS for this project.
 *
 * OTC: não existe loadFromOtState nem setMapState. A view lê tiles direto do mapa (g_map.getTile).
 * - preLoad(): se m_updateVisibleTiles, updateVisibleTiles(); g_map.updateAttachedWidgets
 * - updateVisibleTiles(): usa m_posInfo.camera, tilePos = camera.translated(ix - virtualCenterOffset); g_map.getTile(tilePos)
 * - onTileUpdate(pos, thing, op): se op==CLEAN requestUpdateVisibleTiles; se thing opaque REMOVE m_resetCoveredCache
 * - onCameraMove(offset): requestUpdateMapPosInfo; se isFollowingCreature updateViewport
 * - onMapCenterChange(): requestUpdateVisibleTiles
 */

import * as THREE from 'three'
import { GameMap } from '../render/GameMap'
import { DrawPool, DrawOrder } from '../graphics/DrawPool'
import { DEFAULT_DRAW_FLAGS } from '../graphics/drawFlags'
import { g_player } from './LocalPlayer'
import { g_map } from './ClientMap'
import { g_dispatcher } from '../framework/EventDispatcher'
import { Position } from './Position'
import { LightView } from './LightView'
import { Creature } from './Creature'

const TILE_PIXELS = 32

export class MapView {
  /** OTC: m_visibleDimension – área visível (ex.: 15x11). */
  m_visibleDimension: { width: number, height: number }
  /** OTC: m_drawDimension – área desenhada (ex.: visibleDimension + Size(3,3) = 18x14). */
  m_drawDimension: { width: number, height: number }
  /** Atalho para m_drawDimension (loop, pipeline, lightView). */
  w: number
  h: number
  thingsRef: any
  host: HTMLElement
  m_cachedFirstVisibleFloor: number
  m_cachedLastVisibleFloor: number
  m_cachedVisibleTiles: any[]
  m_mustUpdateVisibleTilesCache: boolean
  m_smoothCameraX: number | null
  m_smoothCameraY: number | null
  m_fitAwareArea: boolean
  m_zoomLevel: number
  /** OTC mapview.cpp L255: m_resetCoveredCache – onTileUpdate(thing opaque REMOVE) */
  m_resetCoveredCache: boolean = false
  scene: THREE.Scene
  camera: THREE.OrthographicCamera
  renderer: THREE.WebGLRenderer
  pipeline: DrawPool
  map: GameMap
  _lastCenter: Position | null = null
  /** OTC mapview.h L247: m_lastCameraPosition – usada em updateVisibleTiles e passada em onMapCenterChange. */
  m_lastCameraPosition: Position | null = null
  /** OTC mapview.h: m_followingCreature – criatura seguida pela câmera (local player). */
  m_followingCreature: Creature | null = null
  /** OTC: m_customCameraPosition – posição da câmera quando não está seguindo criatura (pan manual). */
  m_customCameraPosition: Position | null = null
  /** OTC: LightView – mapa de luz por tile, desenhado com MULTIPLY por cima da cena. */
  m_lightView: LightView
  private lightOverlayMesh: THREE.Mesh | null = null
  private lightTexture: THREE.CanvasTexture | null = null

  constructor({ host, w, h, thingsRef }: { host: HTMLElement, w: number, h: number, thingsRef: any }) {
    const visible = this.getViewportDimensions()
    this.m_visibleDimension = { width: visible.width, height: visible.height }
    this.m_drawDimension = { width: w, height: h }
    this.w = this.m_drawDimension.width
    this.h = this.m_drawDimension.height
    this.thingsRef = thingsRef
    this.host = host

    this.m_cachedFirstVisibleFloor = 7
    this.m_cachedLastVisibleFloor = 7
    this.m_cachedVisibleTiles = []
    this.m_mustUpdateVisibleTilesCache = true

    // Smooth camera: lerp toward (center + walk offset) so the view follows the player smoothly when walking
    this.m_smoothCameraX = null
    this.m_smoothCameraY = null

    // Sistema de zoom para área aware
    this.m_fitAwareArea = true // Ativa o sistema de fit automático
    this.m_zoomLevel = 1.0     // Zoom calculado para encaixar a área aware

    this.scene = new THREE.Scene()
    this.camera = new THREE.OrthographicCamera(-w / 2, w / 2, h / 2, -h / 2, 0.1, 100)
    this.camera.position.set(0, 0, 10)

    this.m_lightView = new LightView()
    this.m_lightView.resize(w, h, TILE_PIXELS)
    this.m_lightView.setGlobalLight(g_map?.getLight?.() ?? { intensity: 250, color: 215 })
    this.m_lightView.updatePixels()
    const lightCanvas = this.m_lightView.getCanvas()
    if (lightCanvas) {
      this.lightTexture = new THREE.CanvasTexture(lightCanvas)
      this.lightTexture.colorSpace = THREE.SRGBColorSpace
      const lightMat = new THREE.MeshBasicMaterial({
        map: this.lightTexture,
        transparent: true,
        blending: THREE.MultiplyBlending,
        depthTest: false,
        depthWrite: false,
      })
      const lightPlane = new THREE.PlaneGeometry(w, h)
      this.lightOverlayMesh = new THREE.Mesh(lightPlane, lightMat)
      this.lightOverlayMesh.position.set(0, 0, 5)
      this.lightOverlayMesh.renderOrder = 1000
      this.scene.add(this.lightOverlayMesh)
    }

    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
    this.renderer.setPixelRatio(window.devicePixelRatio || 1)
    this.renderer.outputColorSpace = THREE.SRGBColorSpace
    this.renderer.toneMapping = THREE.NoToneMapping
    this.renderer.toneMappingExposure = 1
    host.appendChild(this.renderer.domElement)

    const debugQueue = typeof window !== 'undefined' && !!(window as any).__otDebugQueue
    const debugDelayMs = typeof window !== 'undefined' ? ((window as any).__otDebugDelayMs ?? 25) : 25
    this.pipeline = new DrawPool({ scene: this.scene, w, h, thingsRef, debugQueue, debugDelayMs })
    this.map = new GameMap()
    this.pipeline.setMap(this.map)

    this.resize(host)
  }

  getVisibleDimension() { return this.m_visibleDimension }
  getCachedFirstVisibleFloor() { return this.m_cachedFirstVisibleFloor }
  getCachedLastVisibleFloor() { return this.m_cachedLastVisibleFloor }

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
    this.requestVisibleTilesCacheUpdate()
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
    this.requestVisibleTilesCacheUpdate()
  }

  /** OTC mapview.cpp L666-675: setCameraPosition(pos) – clear following, m_customCameraPosition = pos. */
  setCameraPosition(pos: Position) {
    if (this.m_followingCreature) {
      this.m_followingCreature.setCameraFollowing(false)
      this.m_followingCreature = null
    }
    this.m_customCameraPosition = pos.clone()
    this.requestVisibleTilesCacheUpdate()
  }

  /** OTC mapview.cpp: requestUpdateVisibleTiles(). Não existe setMapState no OTClient – view lê direto do mapa. */
  requestVisibleTilesCacheUpdate() {
    this.m_mustUpdateVisibleTilesCache = true
  }

  /** OTC mapview.cpp L518-524: onCameraMove(offset) – requestUpdateMapPosInfo(); if isFollowingCreature() updateViewport(direction). */
  onCameraMove(_offset: { x: number, y: number }) {
    this.requestVisibleTilesCacheUpdate()
    // OTC: if (isFollowingCreature()) updateViewport(m_followingCreature->isWalking() ? getDirection() : InvalidDirection); – viewport edge; we only request cache update.
  }

  /** OTC mapview.cpp L544-555: onTileUpdate – if thing&&isOpaque&&op==REMOVE m_resetCoveredCache; if op==CLEAN requestUpdateVisibleTiles. */
  onTileUpdate(pos: Position, thing: any, operation: string) {
    if (thing?.isOpaque?.() && operation === 'remove') this.m_resetCoveredCache = true
    if (operation === 'clean') this.requestVisibleTilesCacheUpdate()
  }

  /**
   * OTC mapview.cpp L286-426: updateVisibleTiles() – usa camera, tilePos = camera.translated(ix - virtualCenterOffset); g_map.getTile(tilePos).
   * Tiles vêm do mapa (sourceMap = g_map); não existe loadFromOtState.
   */
  updateVisibleTilesCache() {
    if (!g_map) return
    if (!this.map.sourceMap) this.map.setSourceMap(g_map)
    const cameraPos = this.getCameraPosition()
    this.map.setCameraFromMap(g_map, cameraPos)

    const things = this.thingsRef?.current
    const types = things?.types
    this.m_cachedFirstVisibleFloor = this.pipeline.calcFirstVisibleFloor?.(types) ?? this.map.cameraZ ?? 7
    this.m_cachedLastVisibleFloor = this.pipeline.calcLastVisibleFloor?.(this.m_cachedFirstVisibleFloor) ?? this.map.cameraZ ?? 7
    this.m_cachedFirstVisibleFloor = Math.max(0, Math.min(15, this.m_cachedFirstVisibleFloor))
    this.m_cachedLastVisibleFloor = Math.max(0, Math.min(15, this.m_cachedLastVisibleFloor))
    if (this.m_cachedLastVisibleFloor < this.m_cachedFirstVisibleFloor) this.m_cachedLastVisibleFloor = this.m_cachedFirstVisibleFloor

    this.m_cachedVisibleTiles = []
    const w = this.m_drawDimension.width
    const h = this.m_drawDimension.height
    const firstFloor = this.m_cachedFirstVisibleFloor
    const lastFloor = this.m_cachedLastVisibleFloor
    const resetCoveredCache = this.m_resetCoveredCache
    this.m_resetCoveredCache = false

    for (let z = lastFloor; z >= firstFloor; z--) {
      const numDiagonals = w + h - 1
      for (let diagonal = 0; diagonal < numDiagonals; diagonal++) {
        const advance = (diagonal >= h) ? diagonal - h : 0
        for (let iy = diagonal - advance, ix = advance; iy >= 0 && ix < w; iy--, ix++) {
          const tile = this.map.getTile(ix, iy, z)
          if (!tile) continue
          const onCameraFloor = z === this.map.cameraZ
          if (!onCameraFloor && !tile.isDrawable()) continue
          if (tile.isCompletelyCovered(firstFloor, resetCoveredCache, this.map, types)) continue

          this.m_cachedVisibleTiles.push({ z, tile, x: ix, y: iy })
        }
      }
    }

    if (typeof window !== 'undefined' && (window as any).__otDebugFloors) {
      const tilesByZ: Record<number, number> = {}
      for (const e of this.m_cachedVisibleTiles) tilesByZ[e.z] = (tilesByZ[e.z] ?? 0) + 1
      console.debug('[floors] first=', firstFloor, 'last=', lastFloor, 'total=', this.m_cachedVisibleTiles.length, 'tilesByZ=', tilesByZ)
    }

    this.m_mustUpdateVisibleTilesCache = false
  }

  /**
   * OTC mapview.cpp preLoad(): if (m_updateVisibleTiles) updateVisibleTiles(); g_map.updateAttachedWidgets.
   * draw(): chama preLoad logic + drawFloor.
   * OTC: não tem updateWalkStateOnly – o walk é atualizado via g_dispatcher.addEvent (Creature::nextWalkUpdate agenda para o próximo frame).
   */
  draw() {
    // OTC: g_dispatcher.poll() – executa eventos addEvent (ex.: Creature::nextWalkUpdate do local player)
    g_dispatcher.poll()

    if (g_map) {
      if (!this.map.sourceMap) this.map.setSourceMap(g_map)
      // OTC: view usa getCameraPosition() (creature->getPosition() quando following) para câmera; durante walk = destino
      const cameraPos = this.getCameraPosition()
      this.map.setCameraFromMap(g_map, cameraPos)
      if (this._lastCenter == null || this._lastCenter.x !== cameraPos.x || this._lastCenter.y !== cameraPos.y || this._lastCenter.z !== cameraPos.z) {
        this.requestVisibleTilesCacheUpdate()
        this._lastCenter = cameraPos.clone()
      }
    }

    if (this.m_mustUpdateVisibleTilesCache) this.updateVisibleTilesCache()

    // Câmera segue o jogador em tempo real: durante walk, desloca pela posição interpolada (source → dest).
    let camX = 0
    let camY = 0
    if (this.m_followingCreature) {
      const c = this.m_followingCreature as Creature
      if (c.m_walking && c.m_lastStepFromPosition && c.m_lastStepToPosition) {
        const progress = Math.min(1, c.m_walkedPixels / TILE_PIXELS)
        camX = (c.m_lastStepToPosition.x - c.m_lastStepFromPosition.x) * progress
        camY = -(c.m_lastStepToPosition.y - c.m_lastStepFromPosition.y) * progress
      }
    }
    this.camera.position.set(camX, camY, 10)

    this.pipeline.beginFrame()
    const lightView = this.m_lightView.isEnabled() ? this.m_lightView : null
    if (lightView) this.m_lightView.clear()
    for (const entry of this.m_cachedVisibleTiles) {
      entry.tile.draw(this.pipeline, DEFAULT_DRAW_FLAGS, entry.x, entry.y, lightView)
    }
    this.pipeline.endFrame()

    if (lightView) {
      this.m_lightView.updatePixels()
      if (this.lightTexture) this.lightTexture.needsUpdate = true
    }

    this.render()
  }

  /** OTC MapView::onGlobalLightChange – atualiza luz global (ex.: subterrâneo). */
  onGlobalLightChange(light: { intensity: number, color: number }) {
    this.m_lightView.setGlobalLight(light)
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
    
    if (viewAspect > worldAspect) {
      const halfW = (worldH * viewAspect) / 2
      this.camera.left = -halfW
      this.camera.right = halfW
      this.camera.top = worldH / 2
      this.camera.bottom = -worldH / 2
    } else {
      const halfH = (worldW / viewAspect) / 2
      this.camera.left = -worldW / 2
      this.camera.right = worldW / 2
      this.camera.top = halfH
      this.camera.bottom = -halfH
    }
    
    this.camera.updateProjectionMatrix()
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
    const vw = Math.max(1, host.clientWidth)
    const vh = Math.max(1, host.clientHeight)
    this.renderer.setSize(vw, vh, false)

    // OTC: m_visibleDimension (15x11) vs m_drawDimension (18x14) – câmera mostra visible, loop desenha draw
    const viewportW = this.m_visibleDimension.width
    const viewportH = this.m_visibleDimension.height
    const cameraW = this.m_fitAwareArea ? viewportW : this.m_drawDimension.width
    const cameraH = this.m_fitAwareArea ? viewportH : this.m_drawDimension.height

    const viewAspect = vw / vh
    const cameraAspect = cameraW / cameraH

    // Ajusta a câmera para mostrar apenas a área do viewport
    if (viewAspect > cameraAspect) {
      // Tela é mais larga - altura é o limitante
      const halfW = (cameraH * viewAspect) / 2
      this.camera.left = -halfW
      this.camera.right = halfW
      this.camera.top = cameraH / 2
      this.camera.bottom = -cameraH / 2
      this.m_zoomLevel = vh / (cameraH * TILE_PIXELS)
    } else {
      // Tela é mais alta - largura é o limitante
      const halfH = (cameraW / viewAspect) / 2
      this.camera.left = -cameraW / 2
      this.camera.right = cameraW / 2
      this.camera.top = halfH
      this.camera.bottom = -halfH
      this.m_zoomLevel = vw / (cameraW * TILE_PIXELS)
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
