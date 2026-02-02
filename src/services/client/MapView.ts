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
import { GameMap } from '../render/GameMap'
import { DrawPool, DrawOrder } from '../graphics/DrawPool'
import { DEFAULT_DRAW_FLAGS } from '../graphics/drawFlags'
import { g_player } from './LocalPlayer'
import { g_map } from './ClientMap'
import { Position } from './Position'
import { Creature } from './Creature'

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

  requestVisibleTilesCacheUpdate() {
    this.m_mustUpdateVisibleTilesCache = true
  }

  /** OTC MapView::onCameraMove(const Point& offset) – mapview.cpp L518-524: requestUpdateMapPosInfo(); if isFollowingCreature() updateViewport(direction). */
  onCameraMove(offset: { x: number, y: number }) {
    this.requestVisibleTilesCacheUpdate()
  }

  /** OTC MapView::onTileUpdate(pos, thing, operation) – mapview.cpp L544-555: if thing&&isOpaque&&op==REMOVE m_resetCoveredCache; if op==CLEAN destroyHighlightTile, requestUpdateVisibleTiles. */
  onTileUpdate(pos: Position, thing: any, operation: string) {
    if (operation === 'clean') this.requestVisibleTilesCacheUpdate()
  }

  setMapState(state: any) {
    if (!state) return
    this.map.loadFromOtState(state, this.thingsRef)
    this.pipeline.setMap(this.map)
    this.requestVisibleTilesCacheUpdate()
  }

  /**
   * Simplified port of OTC MapView::updateVisibleTiles() (opentibiabr/otclient mapview.cpp ~L294–L414).
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

    if (typeof window !== 'undefined' && (window as any).__otDebugFloors) {
      const tilesByZ: Record<number, number> = {}
      for (const e of this.m_cachedVisibleTiles) tilesByZ[e.z] = (tilesByZ[e.z] ?? 0) + 1
      console.debug('[floors] first=', firstFloor, 'last=', lastFloor, 'total=', this.m_cachedVisibleTiles.length, 'tilesByZ=', tilesByZ)
    }

    this.m_mustUpdateVisibleTilesCache = false
  }

  draw() {
    const now = typeof performance !== 'undefined' ? performance.now() : Date.now()
    
    // Sincronização com o g_map.center (posição do servidor)
    if (g_map?.center) {
      const pos = g_map.center as Position
      
      // Atualiza o estado do mapa apenas se houver mudança real de posição ou dados
      const last = this._lastCenter
      if (!last || last.x !== pos.x || last.y !== pos.y || last.z !== pos.z) {
        this._lastCenter = pos.clone()
        
        // Em vez de setMapState (que reconstrói tudo), atualizamos apenas os dados necessários
        // para o pipeline de renderização saber onde a câmera está.
        this.map.cameraX = pos.x
        this.map.cameraY = pos.y
        this.map.cameraZ = pos.z
        
        // Se o g_map tiver um estado novo, carregamos
        const mapState = g_map.getMapStateForView()
        if (mapState) {
          this.map.loadFromOtState(mapState, this.thingsRef)
        }
        
        this.requestVisibleTilesCacheUpdate()
      }

      // Calcula o offset da câmera baseado na animação de walk do jogador
      let cameraOffsetX = 0
      let cameraOffsetY = 0
      
      const playerId = g_player?.getId?.()
      const creature = playerId != null ? g_map.getCreatureById?.(playerId) : null
      
      if (creature?.m_walking && creature.m_lastStepToPosition && creature.getWalkOffset) {
        const off = creature.getWalkOffset()
        
        // OTC: visual position is target + offset
        // Tibia: X aumenta direita, Y aumenta baixo.
        // Three.js: X aumenta direita, Y aumenta cima.
        const visualX = creature.m_lastStepToPosition.x + (off.x / TILE_PIXELS)
        const visualY = creature.m_lastStepToPosition.y + (off.y / TILE_PIXELS)
        
        // Offset da câmera em unidades de tile
        cameraOffsetX = visualX - pos.x
        cameraOffsetY = -(visualY - pos.y)
        
        // Segurança contra valores inválidos que causam tela preta
        if (!Number.isFinite(cameraOffsetX)) cameraOffsetX = 0
        if (!Number.isFinite(cameraOffsetY)) cameraOffsetY = 0
      }
      
      this.camera.position.set(cameraOffsetX, cameraOffsetY, 10)
    }
    
    if (this.m_mustUpdateVisibleTilesCache) this.updateVisibleTilesCache()
    
    // Inicia o frame - limpa os tileGroups (meshes Three.js)
    this.pipeline.beginFrame()
    
    // Desenha os tiles do cache (inclui m_walkingCreatures de cada tile)
    for (const entry of this.m_cachedVisibleTiles) {
      entry.tile.draw(this.pipeline, DEFAULT_DRAW_FLAGS, entry.x, entry.y)
    }
    
    // Atualiza estado de walk para criaturas conhecidas (desenho é feito pelo Tile)
    this._updateWalkingCreatures()
    
    // Finaliza o frame - executa as ações de desenho (cria meshes)
    this.pipeline.endFrame()
    
    // Renderiza a cena Three.js
    this.render()
  }

  /**
   * Update walk state and DRAW walking creatures.
   * Since GameMap tiles are separate from g_map tiles, we must draw walking creatures here.
   */
  _updateWalkingCreatures() {
    if (!g_map?.m_knownCreatures) return
    
    const cameraX = this.map.cameraX ?? 0
    const cameraY = this.map.cameraY ?? 0
    const cameraZ = this.map.cameraZ ?? 7
    
    // Use aware range offsets (not half of width/height)
    // Aware range: left=8, right=9, top=6, bottom=7
    // View coordinate (0,0) = world coordinate (center.x - left, center.y - top)
    const range = g_map?.getAwareRange?.() ?? { left: 8, top: 6 }
    const offsetX = range.left  // 8
    const offsetY = range.top   // 6
    
    // Get local player ID to handle camera compensation
    const localPlayerId = g_player?.getId?.()
    
    for (const creature of g_map.m_knownCreatures.values()) {
      if (!creature.m_walking) continue
      
      // Update walk state (animation, offset, etc.)
      creature.updateWalk()
      
      // Get creature position and walk offset
      const pos = creature.getPosition()
      if (!pos || pos.z !== cameraZ) continue
      
      const walkOffset = creature.getWalkOffset()
      
      // Convert world position to view position
      // viewX = worldX - (cameraX - offsetX) = worldX - cameraX + offsetX
      const viewX = pos.x - cameraX + offsetX
      const viewY = pos.y - cameraY + offsetY
      
      // Check if creature is within visible area (with some margin for walk offset)
      if (viewX < -1 || viewX >= this.w + 1 || viewY < -1 || viewY >= this.h + 1) continue
      
      // Draw the walking creature with walkOffset for smooth interpolation
      // Camera follows the player's visual position, so walkOffset is needed for all creatures
      this.pipeline.setDrawOrder(3) // DrawOrder.THIRD
      creature.draw(this.pipeline, viewX, viewY, 0, 0, pos.z, walkOffset.x, walkOffset.y, true)
      this.pipeline.resetDrawOrder()
    }
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
