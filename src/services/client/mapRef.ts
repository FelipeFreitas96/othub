/**
 * Singleton ref to g_map to avoid circular dependency (Thing -> ClientMap -> Tile -> Thing).
 */

let _map: { getTile(pos: { x: number; y: number; z: number }): unknown; getMapView?(i?: number): unknown } | null = null

export function getMap(): typeof _map {
  return _map
}

export function setMap(m: typeof _map): void {
  _map = m
}
