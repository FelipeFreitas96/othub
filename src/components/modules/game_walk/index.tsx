/**
 * Walk Module - React integration
 * 1:1 port from OTClient modules/game_walk
 */
import { useEffect } from 'react'
import { initWalkController, terminateWalkController, resetWalkState } from './walk'

export * from './walk'

/**
 * Hook to initialize walk controller on mount
 * Use this in your main game component (e.g., GameInterface)
 */
export function useWalkController() {
  useEffect(() => {
    initWalkController()

    // Listen for game end to reset state
    const onGameEnd = () => resetWalkState()
    window.addEventListener('g_game:onGameEnd', onGameEnd)

    return () => {
      window.removeEventListener('g_game:onGameEnd', onGameEnd)
      terminateWalkController()
    }
  }, [])
}

/**
 * WalkController component - alternative to hook
 * Just mount this component to enable walk controls
 */
export function WalkController() {
  useWalkController()
  return null
}

export default WalkController
