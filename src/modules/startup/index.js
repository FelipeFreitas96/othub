import { initClientStyles } from '../client_styles'
import { initGameFeatures } from '../game_features'
import { initGameThings } from '../game_things'
import { registerModule, loadModules } from '../modulelib'

let started = false

export function initStartup() {
  if (started) return true
  started = true

  registerModule('client_styles', initClientStyles)
  registerModule('game_features', initGameFeatures)
  registerModule('game_things', initGameThings)
  loadModules()
  return true
}

export default {
  init: initStartup,
}
