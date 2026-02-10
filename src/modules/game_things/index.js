import { loadThings } from '../../services/protocol/things'
import { g_game } from '../../services/client/Game'

let loading = null

export function initGameThings() {
  if (!loading) {
    loading = loadThings(g_game.getClientVersion?.() ?? 860).catch(() => null)
  }
  return loading
}

export default {
  init: initGameThings,
}
