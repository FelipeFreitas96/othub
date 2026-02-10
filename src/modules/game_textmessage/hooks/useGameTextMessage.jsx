import { createContext, useContext, useMemo, useEffect, useRef, useState, useCallback } from 'react'
import { MessageModeEnum } from '../../../services/client/Const'
import { g_game } from '../../../services/client/Game'
import {
  calculateVisibleTime,
  getMessageType,
  MessageSettings,
} from '../service/gameTextMessageService'

const GameTextMessageContext = createContext(null)

function makeLabelState() {
  return {
    highCenterLabel: null,
    middleCenterLabel: null,
    lowCenterLabel: null,
    privateLabel: null,
    statusLabel: null,
  }
}

export function GameTextMessageProvider({ children }) {
  const [labels, setLabels] = useState(makeLabelState)
  const hideTimersRef = useRef(new Map())

  const clearMessages = useCallback(() => {
    for (const timer of hideTimersRef.current.values()) clearTimeout(timer)
    hideTimersRef.current.clear()
    setLabels(makeLabelState())
  }, [])

  const setScreenLabel = useCallback((target, text, color) => {
    if (!target) return

    const currentTimer = hideTimersRef.current.get(target)
    if (currentTimer) clearTimeout(currentTimer)

    setLabels((prev) => ({
      ...prev,
      [target]: { text: String(text || ''), color: color || '#ffffff' },
    }))

    const nextTimer = setTimeout(() => {
      setLabels((prev) => ({ ...prev, [target]: null }))
      hideTimersRef.current.delete(target)
    }, calculateVisibleTime(text))

    hideTimersRef.current.set(target, nextTimer)
  }, [])

  const displayMessage = useCallback((mode, text) => {
    if (!g_game.isOnline()) return
    const msgtype = getMessageType(mode, g_game.getClientVersion?.() ?? 860)
    if (!msgtype || msgtype === MessageSettings.none) return
    if (msgtype.screenTarget) {
      setScreenLabel(msgtype.screenTarget, text, msgtype.color)
    }
  }, [setScreenLabel])

  const displayPrivateMessage = useCallback((text) => {
    setScreenLabel('privateLabel', text, MessageSettings.private.color)
  }, [setScreenLabel])

  const displayStatusMessage = useCallback((text) => {
    displayMessage(MessageModeEnum.MessageStatus, text)
  }, [displayMessage])

  const displayFailureMessage = useCallback((text) => {
    displayMessage(MessageModeEnum.MessageFailure, text)
  }, [displayMessage])

  const displayGameMessage = useCallback((text) => {
    displayMessage(MessageModeEnum.MessageGame, text)
  }, [displayMessage])

  const displayBroadcastMessage = useCallback((text) => {
    displayMessage(MessageModeEnum.MessageWarning, text)
  }, [displayMessage])

  useEffect(() => {
    const onTextMessage = (event) => {
      const detail = event?.detail ?? {}
      const mode = Number(detail.mode)
      const text = String(detail.text ?? '')
      if (!text) return
      displayMessage(mode, text)
    }

    const onGameEnd = () => clearMessages()
    const onAutoWalkFail = () => displayFailureMessage('There is no way.')

    window.addEventListener('g_game:onTextMessage', onTextMessage)
    window.addEventListener('g_game:onGameEnd', onGameEnd)
    window.addEventListener('ot:autoWalkFail', onAutoWalkFail)

    return () => {
      window.removeEventListener('g_game:onTextMessage', onTextMessage)
      window.removeEventListener('g_game:onGameEnd', onGameEnd)
      window.removeEventListener('ot:autoWalkFail', onAutoWalkFail)
      clearMessages()
    }
  }, [clearMessages, displayFailureMessage, displayMessage])

  const value = useMemo(() => ({
    labels,
    displayMessage,
    displayPrivateMessage,
    displayStatusMessage,
    displayFailureMessage,
    displayGameMessage,
    displayBroadcastMessage,
    clearMessages,
    showMessage: displayGameMessage,
  }), [
    labels,
    displayMessage,
    displayPrivateMessage,
    displayStatusMessage,
    displayFailureMessage,
    displayGameMessage,
    displayBroadcastMessage,
    clearMessages,
  ])

  return (
    <GameTextMessageContext.Provider value={value}>
      {children}
      <GameTextMessageOverlay labels={labels} />
    </GameTextMessageContext.Provider>
  )
}

function Label({ text, color, className = '' }) {
  if (!text) return null
  return (
    <div className={`text-[11px] font-bold text-center pointer-events-none select-none ${className}`} style={{ color }}>
      {text}
    </div>
  )
}

function GameTextMessageOverlay({ labels }) {
  return (
    <div className="fixed inset-0 pointer-events-none z-[3000]">
      <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[303px] flex flex-col gap-0.5">
        <Label text={labels.highCenterLabel?.text} color={labels.highCenterLabel?.color} />
        <Label text={labels.middleCenterLabel?.text} color={labels.middleCenterLabel?.color} />
        <Label text={labels.lowCenterLabel?.text} color={labels.lowCenterLabel?.color} />
      </div>
      <div className="absolute left-1/2 top-6 -translate-x-1/2 w-[290px]">
        <Label text={labels.privateLabel?.text} color={labels.privateLabel?.color} />
      </div>
      <div className="absolute left-1/2 bottom-2 -translate-x-1/2 w-[300px]">
        <Label text={labels.statusLabel?.text} color={labels.statusLabel?.color} />
      </div>
    </div>
  )
}

export function useGameTextMessage() {
  const ctx = useContext(GameTextMessageContext)
  if (!ctx) {
    return {
      labels: makeLabelState(),
      displayMessage: () => {},
      displayPrivateMessage: () => {},
      displayStatusMessage: () => {},
      displayFailureMessage: () => {},
      displayGameMessage: () => {},
      displayBroadcastMessage: () => {},
      clearMessages: () => {},
      showMessage: () => {},
    }
  }
  return ctx
}
