/**
 * DrawPoolManager – port do OTClient src/framework/graphics/drawpoolmanager.h + drawpoolmanager.cpp
 * Copyright (c) 2010-2026 OTClient; portado para JS neste projeto.
 * get(type), repaint(type). Usado por Map::notificateCameraMove.
 */

export class DrawPoolManager {
  m_pools: Record<number, any>

  constructor() {
    this.m_pools = {}
  }

  /** OTC: DrawPool* get(const DrawPoolType type) const */
  get(type: number) {
    return this.m_pools[type] ?? null
  }

  /** OTC: void repaint(const DrawPoolType drawPool) const { get(drawPool)->repaint(); } */
  repaint(drawPoolType: number) {
    const pool = this.get(drawPoolType)
    if (pool && typeof pool.repaint === 'function') pool.repaint()
  }

  /** Liga um pool a um tipo (MapView registra seu pipeline em Map::addMapView). */
  setPool(type: number, pool: any) {
    if (type != null) this.m_pools[type] = pool ?? null
  }
}

/** OTC: g_drawPool (drawpoolmanager). */
export const g_drawPool = new DrawPoolManager()
