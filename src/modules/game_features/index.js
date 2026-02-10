let initialized = false

export function initGameFeatures() {
  if (initialized) return true
  initialized = true
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('ot:gameFeaturesReady'))
  }
  return true
}

export default {
  init: initGameFeatures,
}
