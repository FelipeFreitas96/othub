/**
 * Walk Module - 1:1 port from OTClient modules/game_walk/walk.lua
 */
import { g_game } from '../../../services/client/Game'
import { g_map } from '../../../services/client/ClientMap'
import { g_player } from '../../../services/client/LocalPlayer'
import { Direction, DirectionType, Position } from '../../../services/client/Position'
import { isFeatureEnabled } from '../../../services/protocol/features'

// State
let smartWalkDirs: DirectionType[] = []
let smartWalkDir: DirectionType | null = null
let walkEvent: ReturnType<typeof setTimeout> | null = null
let lastTurn = 0
let nextWalkDir: DirectionType | null = null
let lastWalkDir: DirectionType | null = null
let lastCancelWalkTime = 0

// Key mappings
const keys: [string, DirectionType][] = [
  ['ArrowUp', Direction.North],
  ['ArrowRight', Direction.East],
  ['ArrowDown', Direction.South],
  ['ArrowLeft', Direction.West],
  ['Numpad8', Direction.North],
  ['Numpad9', Direction.NorthEast],
  ['Numpad6', Direction.East],
  ['Numpad3', Direction.SouthEast],
  ['Numpad2', Direction.South],
  ['Numpad1', Direction.SouthWest],
  ['Numpad4', Direction.West],
  ['Numpad7', Direction.NorthWest],
  // WASD
  ['KeyW', Direction.North],
  ['KeyD', Direction.East],
  ['KeyS', Direction.South],
  ['KeyA', Direction.West],
]

const turnKeys: [string, DirectionType][] = [
  ['Ctrl+ArrowUp', Direction.North],
  ['Ctrl+ArrowRight', Direction.East],
  ['Ctrl+ArrowDown', Direction.South],
  ['Ctrl+ArrowLeft', Direction.West],
]

// Settings (pode ser configurável depois)
const settings = {
  smartWalk: true,
  walkTurnDelay: 50,
  walkTeleportDelay: 200,
  walkStairsDelay: 50,
}

/** Stops the smart walking process */
function stopSmartWalk() {
  smartWalkDirs = []
  smartWalkDir = null
}

/** Cancels the current walk event if active */
function cancelWalkEvent() {
  if (walkEvent) {
    clearTimeout(walkEvent)
    walkEvent = null
  }
  nextWalkDir = null
}

/** Generalized floor change check */
function canChangeFloor(pos: Position, deltaZ: number): boolean {
  if (deltaZ === 0) return false

  const player = g_player
  if (!player) return false

  const toPos = new Position(pos.x, pos.y, pos.z + deltaZ)
  const toTile = g_map.getTile(toPos)
  if (!toTile) return false

  if (deltaZ > 0) {
    // Going DOWN
    return toTile.isWalkable() && (toTile.hasElevation(3) || toTile.hasFloorChange())
  }

  // Going UP
  const fromTile = g_map.getTile(player.getPosition()!)
  return !!fromTile && fromTile.hasElevation(3) && toTile.isWalkable()
}

/** Makes the player walk in the given direction */
export function walk(dir: DirectionType): boolean {
  const player = g_player
  if (!player || player.isDead()) {
    return false
  }

  if (player.isWalkLocked()) {
    nextWalkDir = null
    return false
  }

  // if (g_game.isFollowing()) {
  //   g_game.cancelFollow()
  // }

  const isAutoWalking = player.isAutoWalking()
  if (isAutoWalking || player.isServerWalking()) {
    g_game.stop()
    if (isAutoWalking) {
      player.stopAutoWalk()
    }
    player.lockWalk(player.getStepDuration() + 50)
    return false
  }

  if (!player.canWalk()) {
    if (lastWalkDir !== dir) {
      nextWalkDir = dir
    }
    return false
  }

  nextWalkDir = null
  lastWalkDir = dir

  if (isFeatureEnabled('GameAllowPreWalk')) {
    const playerPos = player.getPosition()
    if (playerPos) {
      const toPos = playerPos.translatedToDirection(dir)
      const toTile = g_map.getTile(toPos)
      if (!toTile || !toTile.isWalkable()) {
        if (!canChangeFloor(toPos, 1) && !canChangeFloor(toPos, -1)) {
          return false
        }
      } else {
        player.preWalk(dir)
      }
    }
  }

  g_game.walk(dir)
  return true
}

/** Adds a walk event with an optional delay */
function addWalkEvent(dir: DirectionType, delay?: number) {
  const now = performance.now()
  if (now - lastCancelWalkTime > 20) {
    cancelWalkEvent()
    lastCancelWalkTime = now
  }

  const action = () => {
    // Check no modifier keys (except for WASD which doesn't need modifiers)
    walk(smartWalkDir ?? dir)
  }

  if (delay != null && delay > 0) {
    walkEvent = setTimeout(action, delay)
  } else {
    // Use setTimeout(0) for next tick instead of immediate
    walkEvent = setTimeout(action, 0)
  }
}

/** Initiates a smart walk in the given direction */
export function smartWalk(dir: DirectionType) {
  addWalkEvent(dir)
}

/** Changes the current walking direction */
function changeWalkDir(dir: DirectionType, pop = false) {
  // Remove all occurrences of the specified direction
  smartWalkDirs = smartWalkDirs.filter(d => d !== dir)

  if (pop) {
    if (smartWalkDirs.length === 0) {
      stopSmartWalk()
      return
    }
  } else {
    smartWalkDirs.unshift(dir)
  }

  smartWalkDir = smartWalkDirs[0] ?? null

  // Smart walk diagonal detection
  if (settings.smartWalk && smartWalkDirs.length > 1) {
    const diagonalMap: Record<number, Record<number, DirectionType>> = {
      [Direction.North]: { [Direction.West]: Direction.NorthWest, [Direction.East]: Direction.NorthEast },
      [Direction.South]: { [Direction.West]: Direction.SouthWest, [Direction.East]: Direction.SouthEast },
      [Direction.West]: { [Direction.North]: Direction.NorthWest, [Direction.South]: Direction.SouthWest },
      [Direction.East]: { [Direction.North]: Direction.NorthEast, [Direction.South]: Direction.SouthEast },
    }

    for (const d of smartWalkDirs) {
      if (smartWalkDir != null && diagonalMap[smartWalkDir]?.[d] != null) {
        smartWalkDir = diagonalMap[smartWalkDir][d]
        break
      }
    }
  }
}

/** Handles turning the player */
function turn(dir: DirectionType, repeated: boolean) {
  const player = g_player
  if (!player) return

  if (player.isWalking() && player.getDirection() === dir) {
    return
  }

  cancelWalkEvent()

  const TURN_DELAY_REPEATED = 150
  const TURN_DELAY_DEFAULT = 50
  const delay = repeated ? TURN_DELAY_REPEATED : TURN_DELAY_DEFAULT
  const now = performance.now()

  if (lastTurn + delay < now) {
    g_game.turn(dir)
    changeWalkDir(dir)
    lastTurn = now
    player.lockWalk(settings.walkTurnDelay)
  }
}

/** Handles player teleportation events */
export function onTeleport(newPos: Position, oldPos: Position) {
  if (!newPos || !oldPos) return

  const player = g_player
  if (!player) return

  const offsetX = Math.abs(newPos.x - oldPos.x)
  const offsetY = Math.abs(newPos.y - oldPos.y)
  const offsetZ = Math.abs(newPos.z - oldPos.z)

  const delay = (offsetX >= 3 || offsetY >= 3 || offsetZ >= 2)
    ? settings.walkTeleportDelay
    : settings.walkStairsDelay

  player.lockWalk(delay)
}

/** Handles the end of a walking event */
export function onWalkFinish() {
  if (nextWalkDir != null) {
    if (!isFeatureEnabled('GameAllowPreWalk')) {
      walk(nextWalkDir)
    } else {
      addWalkEvent(nextWalkDir, 50)
    }
  }
}

/** Handles cancellation of a walking event */
export function onCancelWalk() {
  const player = g_player
  if (player) {
    player.lockWalk(50)
  }
}

// Key state tracking
const keysHeld = new Set<string>()
const keyDownTimers = new Map<string, ReturnType<typeof setInterval>>()

/** Key to direction mapping */
function getKeyDirection(code: string): DirectionType | null {
  const found = keys.find(([key]) => key === code)
  return found ? found[1] : null
}

/** Turn key check */
function getTurnKeyDirection(code: string, ctrlKey: boolean): DirectionType | null {
  if (!ctrlKey) return null
  const baseKey = code.replace('Key', '').replace('Arrow', '')
  const found = turnKeys.find(([key]) => key === `Ctrl+Arrow${baseKey}`)
  return found ? found[1] : null
}

/** Handle key down */
function handleKeyDown(e: KeyboardEvent) {
  // Turn with Ctrl
  const turnDir = getTurnKeyDirection(e.code, e.ctrlKey)
  if (turnDir != null) {
    turn(turnDir, keysHeld.has(e.code))
    e.preventDefault()
    return
  }

  const dir = getKeyDirection(e.code)
  if (dir == null) return

  e.preventDefault()

  if (!keysHeld.has(e.code)) {
    keysHeld.add(e.code)
    changeWalkDir(dir)
    smartWalk(dir)

    // Auto-repeat
    const timer = setInterval(() => {
      if (keysHeld.has(e.code)) {
        smartWalk(smartWalkDir ?? dir)
      }
    }, 50) // Repeat every 50ms while held
    keyDownTimers.set(e.code, timer)
  }
}

/** Handle key up */
function handleKeyUp(e: KeyboardEvent) {
  const dir = getKeyDirection(e.code)
  if (dir == null) return

  e.preventDefault()
  keysHeld.delete(e.code)

  // Clear auto-repeat timer
  const timer = keyDownTimers.get(e.code)
  if (timer) {
    clearInterval(timer)
    keyDownTimers.delete(e.code)
  }

  changeWalkDir(dir, true)
}

let initialized = false

/** Initialize walk controller */
export function initWalkController() {
  if (initialized) return

  window.addEventListener('keydown', handleKeyDown, true)
  window.addEventListener('keyup', handleKeyUp, true)

  // Listen for walk events from LocalPlayer
  window.addEventListener('ot:walkFinish', onWalkFinish)
  window.addEventListener('ot:cancelWalk', onCancelWalk)

  initialized = true
}

/** Terminate walk controller */
export function terminateWalkController() {
  if (!initialized) return

  window.removeEventListener('keydown', handleKeyDown, true)
  window.removeEventListener('keyup', handleKeyUp, true)
  window.removeEventListener('ot:walkFinish', onWalkFinish)
  window.removeEventListener('ot:cancelWalk', onCancelWalk)

  // Clear all timers
  for (const timer of keyDownTimers.values()) {
    clearInterval(timer)
  }
  keyDownTimers.clear()
  keysHeld.clear()

  stopSmartWalk()
  cancelWalkEvent()

  initialized = false
}

/** Reset walk state (call on game end) */
export function resetWalkState() {
  stopSmartWalk()
  cancelWalkEvent()
  nextWalkDir = null
  lastWalkDir = null
}
