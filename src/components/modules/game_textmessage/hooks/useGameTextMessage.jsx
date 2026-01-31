/**
 * game_textmessage - contexto e hook para mensagens de jogo (toast).
 * Qualquer módulo pode chamar showMessage(text) para exibir uma mensagem na tela.
 */
import { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react'
import { TOAST_DURATION_MS } from '../service/gameTextMessageService'
import GameTextMessageToast from '../ui/GameTextMessageToast'

const GameTextMessageContext = createContext(null)

export function GameTextMessageProvider({ children }) {
  const [message, setMessage] = useState(null)
  const timeoutRef = useRef(null)

  const showMessage = useCallback((text) => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current)
    setMessage(text ?? null)
    if (text) {
      timeoutRef.current = setTimeout(() => {
        setMessage(null)
        timeoutRef.current = null
      }, TOAST_DURATION_MS)
    }
  }, [])

  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current)
    }
  }, [])

  const value = { message, showMessage }

  return (
    <GameTextMessageContext.Provider value={value}>
      {children}
      <GameTextMessageToast message={message} />
    </GameTextMessageContext.Provider>
  )
}

export function useGameTextMessage() {
  const ctx = useContext(GameTextMessageContext)
  if (!ctx) {
    return {
      message: null,
      showMessage: () => {},
    }
  }
  return ctx
}
