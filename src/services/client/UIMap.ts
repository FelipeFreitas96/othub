/*
 * Copyright (c) 2010-2026 OTClient <https://github.com/edubart/otclient>
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in
 * all copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
 * THE SOFTWARE.
 */

/**
 * UIMap – port of OTClient src/client/uimap.h + uimap.cpp
 * Widget that owns a MapView and delegates camera, zoom, draw options to it.
 * In this project there is no UIWidget/OTML; UIMap is a plain class that creates MapView and registers with g_map.
 */

import { g_map } from './ClientMap'
import { g_drawPool } from '../graphics/DrawPoolManager'
import { DrawPoolType } from '../graphics/DrawPool'
import { MapView } from './MapView'
import { Position } from './Position'
import { Creature } from './Creature'
import { Tile } from './Tile'
import type { Point } from './types'

export interface Rect {
  x: number
  y: number
  width: number
  height: number
}

export interface Size {
  width: number
  height: number
}

export class UIMap {
  m_mapView: MapView
  m_keepAspectRatio: boolean = true
  m_limitVisibleRange: boolean = false
  m_maxZoomIn: number = 3
  m_maxZoomOut: number = 513
  m_zoom: number
  m_aspectRatio: number
  m_mapRect: Rect = { x: 0, y: 0, width: 1, height: 1 }
  m_mapviewRect: Rect = { x: 0, y: 0, width: 1, height: 1 }

  constructor(host: HTMLElement, drawWidth: number, drawHeight: number) {
    this.m_mapView = new MapView({ host, w: drawWidth, h: drawHeight })
    const dim = this.m_mapView.getVisibleDimension()
    this.m_zoom = dim.height
    this.m_aspectRatio = dim.width / dim.height
    this.m_mapRect = { x: 0, y: 0, width: 1, height: 1 }
    g_map.addMapView(this.m_mapView)
  }

  dispose(): void {
    g_map.removeMapView(this.m_mapView)
    this.m_mapView.dispose()
  }

  /** OTC uimap.cpp L52-73: draw(drawPane) – preDraw for MAP, LIGHT, CREATURE_INFORMATION, FOREGROUND_MAP. */
  draw(drawPane: DrawPoolType): void {
    const vw = this.m_mapView.host?.clientWidth ?? 0
    const vh = this.m_mapView.host?.clientHeight ?? 0
    if (vw > 0 && vh > 0) {
      const rect = { x: 0, y: 0, width: vw, height: vh }
      if (drawPane === DrawPoolType.MAP) {
        this.m_mapView.updateRect(rect)
        this.m_mapView.preLoad()
        this.m_mapView.updateRect(rect)
      } else {
        this.m_mapView.updateRect(rect)
      }
    }
    const rect = this.m_mapView.m_posInfo.rect
    const srcRect = this.m_mapView.m_posInfo.srcRect
    const black = { r: 0, g: 0, b: 0, a: 255 }

    if (drawPane === DrawPoolType.MAP) {
      g_drawPool.preDraw(
        drawPane,
        () => this.m_mapView.drawFloor(),
        () => this.m_mapView.registerEvents(),
        rect,
        srcRect,
        black
      )
    } else if (drawPane === DrawPoolType.LIGHT) {
      g_drawPool.preDraw(drawPane, () => {
        this.m_mapView.m_lightView.clear()
        this.m_mapView.drawLights()
        if (typeof (this.m_mapView.m_lightView as any).draw === 'function') {
          (this.m_mapView.m_lightView as any).draw(rect, srcRect)
        }
      }, undefined, rect, srcRect, undefined)
    } else if (drawPane === DrawPoolType.CREATURE_INFORMATION) {
      g_drawPool.preDraw(drawPane, () => this.m_mapView.drawCreatureInformation())
    } else if (drawPane === DrawPoolType.FOREGROUND_MAP) {
      g_drawPool.preDraw(drawPane, () => this.m_mapView.drawForeground(this.m_mapviewRect))
    }
  }

  /** OTC: updateMapRect() – m_mapView->updateRect(m_mapviewRect). */
  updateMapRect(): void {
    this.m_mapView.updateRect(this.m_mapviewRect)
  }

  // ----------------- delegates to MapView -----------------

  movePixels(x: number, y: number): void {
    ;(this.m_mapView as any).move?.(x, y)
  }

  followCreature(creature: Creature | null): void {
    this.m_mapView.followCreature(creature)
  }

  setCameraPosition(pos: Position): void {
    this.m_mapView.setCameraPosition(pos)
  }

  lockVisibleFloor(floor: number): void {
    this.m_mapView.lockFirstVisibleFloor(floor)
  }

  unlockVisibleFloor(): void {
    this.m_mapView.unlockFirstVisibleFloor()
  }

  setFloorViewMode(_viewMode: number): void {
    // m_mapView.setFloorViewMode(viewMode) – MapView has no floor view mode enum yet
  }

  setDrawNames(_enable: boolean): void {
    // m_mapView.setDrawNames(enable)
  }

  setDrawHealthBars(_enable: boolean): void {
    // m_mapView.setDrawHealthBars(enable)
  }

  setDrawLights(_enable: boolean): void {
    ;(this.m_mapView.m_lightView as any).setEnabled?.(_enable)
  }

  setLimitVisibleDimension(_enable: boolean): void {
    // m_mapView.setLimitVisibleDimension(enable); updateVisibleDimension()
  }

  setDrawManaBar(_enable: boolean): void {}
  setDrawHarmony(_enable: boolean): void {}
  setShader(_name: string, _fadein: number, _fadeout: number): void {}
  setMinimumAmbientLight(intensity: number): void {
    this.m_mapView.onGlobalLightChange?.({ intensity: intensity * 255, color: 215 })
  }
  setDrawViewportEdge(_force: boolean): void {}
  setShadowFloorIntensity(_intensity: number): void {}
  setCrosshairTexture(_texturePath: string): void {}
  setDrawHighlightTarget(_enable: boolean): void {}
  setAntiAliasingMode(_mode: number): void {}
  setFloorFading(_v: number): void {}

  isDrawingNames(): boolean { return true }
  isDrawingHealthBars(): boolean { return true }
  isDrawingLights(): boolean { return this.m_mapView.m_lightView?.isEnabled?.() ?? false }
  isLimitedVisibleDimension(): boolean { return false }
  isDrawingManaBar(): boolean { return false }
  isSwitchingShader(): boolean { return false }

  getSpectators(_multiFloor: boolean): Creature[] { return [] }
  getSightSpectators(_multiFloor: boolean): Creature[] { return [] }
  isInRange(pos: Position): boolean {
    return this.m_mapView.getCameraPosition?.() != null && (this.m_mapView as any).isInRange?.(pos) !== false
  }
  getShader(): unknown { return null }
  getNextShader(): unknown { return null }
  getFloorViewMode(): number { return 0 }
  getFollowingCreature(): Creature | null { return this.m_mapView.getFollowingCreature() }
  getCameraPosition(): Position { return this.m_mapView.getCameraPosition() }
  getPosition(mousePos: Point): Position {
    return (this.m_mapView as any).getPosition?.(mousePos) ?? new Position(0xFFFF, 0xFFFF, 0xFF)
  }
  getTile(mousePos: Point): Tile | null {
    const pos = this.getPosition(mousePos)
    return (this.m_mapView as any).getTopTile?.(pos) ?? g_map.getTile(pos)
  }
  getVisibleDimension(): Size {
    const d = this.m_mapView.getVisibleDimension()
    return { width: d.width, height: d.height }
  }
  getMinimumAmbientLight(): number { return 0 }
  getMapView(): MapView { return this.m_mapView }
  clearTiles(): void {
    (this.m_mapView as any).m_foregroundTiles = (this.m_mapView as any).m_foregroundTiles ?? []
    ;(this.m_mapView as any).m_foregroundTiles.length = 0
  }

  // -------------------------------------------------------------------------------

  setZoom(zoom: number): boolean {
    this.m_zoom = Math.max(this.m_maxZoomIn, Math.min(this.m_maxZoomOut, zoom))
    this.updateVisibleDimension()
    return false
  }

  zoomIn(): boolean {
    let delta = 2
    if (this.m_zoom - delta < this.m_maxZoomIn) delta = 1
    if (this.m_zoom - delta < this.m_maxZoomIn) return false
    const oldZoom = this.m_zoom
    this.m_zoom -= delta
    this.updateVisibleDimension()
    return true
  }

  zoomOut(): boolean {
    let delta = 2
    if (this.m_zoom + delta > this.m_maxZoomOut) delta = 1
    if (this.m_zoom + delta > this.m_maxZoomOut) return false
    const oldZoom = this.m_zoom
    this.m_zoom += delta
    this.updateVisibleDimension()
    return true
  }

  setVisibleDimension(visibleDimension: Size): void {
    this.m_aspectRatio = visibleDimension.width / visibleDimension.height
    this.updateMapSize()
  }

  setKeepAspectRatio(enable: boolean): void {
    this.m_keepAspectRatio = enable
    if (enable) {
      const d = this.getVisibleDimension()
      this.m_aspectRatio = d.width / d.height
    }
    this.updateMapSize()
  }

  /** OTC: onGeometryChange – updateMapSize(). Called when widget rect changes. */
  onGeometryChange(_oldRect: Rect, _newRect: Rect): void {
    this.updateMapSize()
  }

  /** OTC: onMouseMove – getPosition(mousePos), onMouseMove(pos), setLastMousePosition(pos). */
  onMouseMove(mousePos: Point, _mouseMoved?: Point): boolean {
    const pos = this.getPosition(mousePos)
    if (!pos.isValid()) return false
    const last = (this.m_mapView as any).m_mousePosition
    if (last == null || last.x !== pos.x || last.y !== pos.y || last.z !== pos.z) {
      (this.m_mapView as any).onMouseMove?.(pos)
      ;(this.m_mapView as any).m_mousePosition = pos.clone?.() ?? { ...pos }
    }
    return true
  }

  updateVisibleDimension(): void {
    let dimensionHeight = this.m_zoom
    let ratio = this.m_aspectRatio
    if (!this.m_limitVisibleRange && (this.m_mapRect.width > 0 && this.m_mapRect.height > 0) && !this.m_keepAspectRatio) {
      ratio = this.m_mapRect.width / this.m_mapRect.height
    }
    if (dimensionHeight % 2 === 0) dimensionHeight += 1
    let dimensionWidth = Math.round(this.m_zoom * ratio)
    if (dimensionWidth % 2 === 0) dimensionWidth += 1
    dimensionWidth = Math.max(3, dimensionWidth)
    dimensionHeight = Math.max(3, dimensionHeight)
    ;(this.m_mapView as any).setVisibleDimension?.({ width: dimensionWidth, height: dimensionHeight })
    if (this.m_keepAspectRatio) this.updateMapSize()
  }

  updateMapSize(): void {
    const paddingRect = this.m_mapRect
    let mapSize: Size
    if (this.m_keepAspectRatio) {
      const mapRectW = Math.max(1, paddingRect.width - 2)
      const mapRectH = Math.max(1, paddingRect.height - 2)
      const aspect = this.m_aspectRatio * this.m_zoom / this.m_zoom
      const targetW = this.m_aspectRatio * this.m_zoom
      const targetH = this.m_zoom
      const scale = Math.min(
        (paddingRect.width - 2) / targetW,
        (paddingRect.height - 2) / targetH
      )
      mapSize = {
        width: Math.max(1, Math.round(targetW * scale)),
        height: Math.max(1, Math.round(targetH * scale))
      }
    } else {
      mapSize = {
        width: Math.max(1, paddingRect.width - 2),
        height: Math.max(1, paddingRect.height - 2)
      }
    }
    this.m_mapRect = {
      x: this.m_mapRect.x,
      y: this.m_mapRect.y,
      width: mapSize.width,
      height: mapSize.height
    }
    const density = typeof window !== 'undefined' ? (window as any).devicePixelRatio ?? 1 : 1
    this.m_mapviewRect = {
      x: this.m_mapRect.x * density,
      y: this.m_mapRect.y * density,
      width: this.m_mapRect.width * density,
      height: this.m_mapRect.height * density
    }
    if (!this.m_keepAspectRatio) this.updateVisibleDimension()
  }

  /** Set the rect used for layout (e.g. from a parent container). Call updateMapSize() after. */
  setMapRect(rect: Rect): void {
    this.m_mapRect = { ...rect }
    this.updateMapSize()
  }
}
