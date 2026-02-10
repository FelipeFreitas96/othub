const STORAGE_KEY = 'client_options'
const CHANGE_EVENT = 'ot:clientOptionsChange'

const DEFAULT_OPTIONS = {
  crosshairCursor: true,
  crosshair: 'default',
  showPing: false,
  mouseControlMode: 0,
  lootControlMode: 0,
  autoChaseOverride: true,
  returnDisablesChat: false,
  moveStack: false,
  smartWalk: false,
  openMaximized: false,
  displayText: true,
  hotkeyDelay: 70,
  walkTurnDelay: 100,
  walkTeleportDelay: 50,
  walkStairsDelay: 50,
  enableHighlightMouseTarget: true,
  showDragIcon: true,
  showLeftPanel: true,
  showRightExtraPanel: false,
  showSpellGroupCooldowns: true,
  framesRarity: 'frames',
  showExpiryInInvetory: true,
  showExpiryInContainers: true,
  showExpiryOnUnusedItems: true,
  displayNames: true,
  displayHealth: true,
  displayMana: true,
  displayHarmony: true,
  rightJoystick: false,
  hudScale: 2,
  creatureInformationScale: 2,
  staticTextScale: 2,
  animatedTextScale: 2,
  showInfoMessagesInConsole: true,
  showEventMessagesInConsole: true,
  showStatusMessagesInConsole: true,
  showOthersStatusMessagesInConsole: false,
  showTimestampsInConsole: true,
  showLevelsInConsole: true,
  showPrivateMessagesInConsole: true,
  showPrivateMessagesOnScreen: true,
  showLootMessagesOnScreen: true,
  showHighlightedUnderline: false,
  showAssignedHKButton: true,
  showHKObjectsBars: true,
  showSpellParameters: true,
  graphicalCooldown: true,
  cooldownSecond: true,
  actionTooltip: true,
  allActionBar13: true,
  actionBarShowBottom1: true,
  actionBarShowBottom2: false,
  actionBarShowBottom3: false,
  allActionBar46: false,
  actionBarShowLeft1: false,
  actionBarShowLeft2: false,
  actionBarShowLeft3: false,
  allActionBar79: false,
  actionBarShowRight1: false,
  actionBarShowRight2: false,
  actionBarShowRight3: false,
  antialiasingMode: 1,
  fullscreen: false,
  vsync: true,
  showFps: false,
  backgroundFrameRate: 501,
  optimizeFps: true,
  forceEffectOptimization: false,
  asyncTxtLoading: false,
  dontStretchShrink: false,
  enableLights: true,
  ambientLight: 0,
  shadowFloorIntensity: 30,
  floorFading: 500,
  floorViewMode: 1,
  drawEffectOnTop: false,
  limitVisibleDimension: false,
  floatingEffect: false,
  setEffectAlphaScroll: 100,
  setMissileAlphaScroll: 100,
  enableAudio: true,
  enableMusicSound: true,
  musicSoundVolume: 100,
  profile: 1,
}

function normalizeCrosshair(options, source = null) {
  const next = { ...options }
  const hasCrosshair = !!source && Object.prototype.hasOwnProperty.call(source, 'crosshair')
  const hasCrosshairCursor = !!source && Object.prototype.hasOwnProperty.call(source, 'crosshairCursor')

  if (hasCrosshair) {
    const crosshair = typeof next.crosshair === 'string' ? next.crosshair : 'default'
    next.crosshair = crosshair
    next.crosshairCursor = crosshair !== 'disabled'
  } else if (hasCrosshairCursor) {
    next.crosshairCursor = !!next.crosshairCursor
    next.crosshair = next.crosshairCursor ? 'default' : 'disabled'
  } else if (typeof next.crosshair === 'string') {
    next.crosshairCursor = next.crosshair !== 'disabled'
  } else {
    next.crosshair = next.crosshairCursor ? 'default' : 'disabled'
  }
  return next
}

function normalizeOptions(raw, source = null) {
  const merged = {
    ...DEFAULT_OPTIONS,
    ...(raw && typeof raw === 'object' ? raw : {}),
  }
  return normalizeCrosshair(merged, source)
}

function emitChange(options) {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent(CHANGE_EVENT, { detail: options }))
}

export function getClientOptions() {
  if (typeof window === 'undefined') return { ...DEFAULT_OPTIONS }
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return { ...DEFAULT_OPTIONS }
    const parsed = JSON.parse(raw)
    return normalizeOptions(parsed, parsed)
  } catch {
    return { ...DEFAULT_OPTIONS }
  }
}

export function getClientOption(key) {
  return getClientOptions()[key]
}

export function updateClientOptions(patch) {
  const patchObject = patch ?? {}
  const next = normalizeOptions({ ...getClientOptions(), ...patchObject }, patchObject)
  if (typeof window !== 'undefined') {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  }
  emitChange(next)
  return next
}

export function setClientOption(key, value) {
  return updateClientOptions({ [key]: value })
}

export function resetClientOptions() {
  if (typeof window !== 'undefined') {
    window.localStorage.removeItem(STORAGE_KEY)
  }
  const next = getClientOptions()
  emitChange(next)
  return next
}

export function subscribeClientOptions(callback) {
  if (typeof window === 'undefined') return () => {}
  const handler = (event) => callback(event?.detail ?? getClientOptions())
  window.addEventListener(CHANGE_EVENT, handler)
  return () => window.removeEventListener(CHANGE_EVENT, handler)
}
