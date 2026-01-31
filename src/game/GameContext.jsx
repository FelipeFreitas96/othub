/**
 * g_game reimaginado do OTClient - contexto React.
 * API: isOnline(), getLocalPlayer(), getCharacterName(), getClientVersion(), getFeature(),
 *      connect(event, callback), disconnect(event, callback),
 *      startGame(player), endGame().
 * Eventos: 'onGameStart', 'onGameEnd'.
 */
import { createContext, useContext, useState, useCallback, useMemo, useRef } from 'react'
import { DEFAULT_PLAYER } from './defaultPlayer'
import { getGameClientVersion, setGameClientVersion } from './g_game'

const GameContext = createContext(null)

const EVENTS = {
  ON_GAME_START: 'onGameStart',
  ON_GAME_END: 'onGameEnd',
  onGameStart: 'onGameStart',
  onGameEnd: 'onGameEnd',
}

/** Versão do cliente (ex.: 1098, 1412). */
const DEFAULT_CLIENT_VERSION = 860

/** Features do protocolo (para hideOldClientStats etc.) */
const FEATURES = {
  GameOfflineTrainingTime: true,
  GamePlayerRegenerationTime: true,
  GameExperienceBonus: true,
  GameEnterGameShowAppearance: true,
  GameCharacterStats: true,
  GameAdditionalSkills: true,
  GameForgeSkillStats: true,
  GameForgeSkillStats1332: true,
}

export function GameProvider({ children }) {
  const [isOnline, setIsOnline] = useState(false)
  const [player, setPlayer] = useState(null)
  const [clientVersion, setClientVersionState] = useState(getGameClientVersion() || DEFAULT_CLIENT_VERSION)
  const listenersRef = useRef({ [EVENTS.ON_GAME_START]: [], [EVENTS.ON_GAME_END]: [] })

  const emit = useCallback((event, ...args) => {
    const list = listenersRef.current[event] || []
    list.forEach((cb) => { try { cb(...args) } catch (_) {} })
  }, [])

  const startGame = useCallback((localPlayer = DEFAULT_PLAYER) => {
    setPlayer(localPlayer)
    setIsOnline(true)
    emit(EVENTS.ON_GAME_START)
  }, [emit])

  const endGame = useCallback(() => {
    setPlayer(null)
    setIsOnline(false)
    emit(EVENTS.ON_GAME_END)
  }, [emit])

  const connect = useCallback((event, callback) => {
    if (!listenersRef.current[event]) listenersRef.current[event] = []
    listenersRef.current[event].push(callback)
    return () => {
      listenersRef.current[event] = listenersRef.current[event].filter((cb) => cb !== callback)
    }
  }, [])

  const disconnect = useCallback((event, callback) => {
    if (!listenersRef.current[event]) return
    listenersRef.current[event] = listenersRef.current[event].filter((cb) => cb !== callback)
  }, [])

  const getLocalPlayer = useCallback(() => player, [player])
  const getCharacterName = useCallback(() => player?.name ?? '', [player])
  const getClientVersion = useCallback(() => clientVersion, [clientVersion])
  const setClientVersion = useCallback((version) => {
    const next = setGameClientVersion(version)
    setClientVersionState(next)
  }, [])
  const getFeature = useCallback((name) => FEATURES[name] ?? false, [])

  const g_game = useMemo(
    () => ({
      isOnline: () => isOnline,
      getLocalPlayer,
      getCharacterName,
      getClientVersion,
      setClientVersion,
      getFeature,
      connect,
      disconnect,
      startGame,
      endGame,
      EVENTS,
    }),
    [isOnline, getLocalPlayer, getCharacterName, getClientVersion, setClientVersion, getFeature, connect, disconnect, startGame, endGame]
  )

  const value = useMemo(
    () => ({
      g_game,
      isOnline,
      player,
      clientVersion,
      setClientVersion,
      startGame,
      endGame,
    }),
    [g_game, isOnline, player, clientVersion, setClientVersion, startGame, endGame]
  )

  return <GameContext.Provider value={value}>{children}</GameContext.Provider>
}

export function useGame() {
  const ctx = useContext(GameContext)
  if (!ctx) return null
  return ctx
}

export function useGGame() {
  const ctx = useContext(GameContext)
  return ctx?.g_game ?? null
}

export { EVENTS as GAME_EVENTS }
