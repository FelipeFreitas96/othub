/**
 * Singleton ref to g_game to avoid circular dependency.
 */

let _game: { getContainer?(id: number): unknown } | null = null

export function getGame(): typeof _game {
  return _game
}

export function setGame(g: typeof _game): void {
  _game = g
}
