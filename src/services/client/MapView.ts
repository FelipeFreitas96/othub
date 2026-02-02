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

const TILE_PIXELS = 32

export class MapView {
  m_visibleDimension: { width: number, height: number }
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

  constructor({ host, w, h, thingsRef }: { host: HTMLElement, w: number, h: number, thingsRef: any }) {
    this.m_visibleDimension = { width: w, height: h }
    this.w = w
    this.h = h
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

    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
    this.renderer.setPixelRatio(window.devicePixelRatio || 1)
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

  /** OTC mapview.cpp: requestUpdateVisibleTiles(). Não existe setMapState no OTClient – view lê direto do mapa. */
  requestVisibleTilesCacheUpdate() {
    this.m_mustUpdateVisibleTilesCache = true
  }

  /** OTC mapview.cpp L518-524: onCameraMove – requestUpdateMapPosInfo(); if isFollowingCreature() updateViewport(direction). */
  onCameraMove(_offset: { x: number, y: number }) {
    this.requestVisibleTilesCacheUpdate()
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
    this.map.setCameraFromMap(g_map)

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
      this.map.setCameraFromMap(g_map)
      const center = g_map.getCentralPosition()
      if (this._lastCenter == null || this._lastCenter.x !== center.x || this._lastCenter.y !== center.y || this._lastCenter.z !== center.z) {
        this.requestVisibleTilesCacheUpdate()
        this._lastCenter = center.clone()
      }
    }

    if (this.m_mustUpdateVisibleTilesCache) this.updateVisibleTilesCache()

    let cameraOffsetX = 0
    let cameraOffsetY = 0
    if (g_map?.center) {
      const pos = g_map.center as Position
      const playerId = g_player?.getId?.()
      const creature = playerId != null ? g_map.getCreatureById?.(playerId) : null
      if (creature?.m_walking && creature.m_lastStepToPosition && creature.getWalkOffset) {
        const off = creature.getWalkOffset()
        const visualX = creature.m_lastStepToPosition.x + (off.x / TILE_PIXELS)
        const visualY = creature.m_lastStepToPosition.y + (off.y / TILE_PIXELS)
        cameraOffsetX = visualX - pos.x
        cameraOffsetY = -(visualY - pos.y)
        if (!Number.isFinite(cameraOffsetX)) cameraOffsetX = 0
        if (!Number.isFinite(cameraOffsetY)) cameraOffsetY = 0
      }
      this.camera.position.set(cameraOffsetX, cameraOffsetY, 10)
    }

    this.pipeline.beginFrame()
    for (const entry of this.m_cachedVisibleTiles) {
      entry.tile.draw(this.pipeline, DEFAULT_DRAW_FLAGS, entry.x, entry.y)
    }
    this.pipeline.endFrame()
    this.render()
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
    
    // Calcula as dimensões do viewport baseado no zoom
    const worldW = this.w / this.m_zoomLevel
    const worldH = this.h / this.m_zoomLevel
    
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

    // O mapa completo é 18x14 (área aware), mas a câmera mostra apenas 15x11 (área visível)
    // Isso cria um "zoom" natural - a câmera está mais perto, mostrando menos tiles
    const { width: viewportW, height: viewportH } = this.getViewportDimensions()
    
    // Usa viewport (15x11) se fit está ativo, senão usa o mapa completo
    const cameraW = this.m_fitAwareArea ? viewportW : this.w
    const cameraH = this.m_fitAwareArea ? viewportH : this.h

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
