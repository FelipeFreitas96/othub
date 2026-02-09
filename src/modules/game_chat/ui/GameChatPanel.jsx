import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { g_game } from '../../../services/client/Game'
import { MessageModeEnum } from '../../../services/client/Const'

const MAX_MESSAGES = 500
const SERVER_CHANNEL_ID = 0
const DEFAULT_CHANNEL_ID = 1

const BASE_CHANNELS = {
  [SERVER_CHANNEL_ID]: { id: SERVER_CHANNEL_ID, name: 'Server Log', kind: 'server' },
  [DEFAULT_CHANNEL_ID]: { id: DEFAULT_CHANNEL_ID, name: 'Default', kind: 'default' },
}

const BASE_ORDER = [SERVER_CHANNEL_ID, DEFAULT_CHANNEL_ID]

function messageColor(mode) {
  switch (mode) {
    case MessageModeEnum.MessageChannelManagement:
    case MessageModeEnum.MessageGuild:
    case MessageModeEnum.MessagePartyManagement:
    case MessageModeEnum.MessageParty:
      return '#FFFFFF'
    case MessageModeEnum.MessageChannelHighlight:
      return '#F6A731'
    case MessageModeEnum.MessagePrivateFrom:
    case MessageModeEnum.MessagePrivateTo:
      return '#9F9DFD'
    case MessageModeEnum.MessageNpcFrom:
    case MessageModeEnum.MessageNpcTo:
      return '#5FF7F7'
    case MessageModeEnum.MessageGamemasterBroadcast:
    case MessageModeEnum.MessageGamemasterChannel:
    case MessageModeEnum.MessageGamemasterPrivateFrom:
    case MessageModeEnum.MessageGamemasterPrivateTo:
      return '#F55E5E'
    case MessageModeEnum.MessageMonsterSay:
    case MessageModeEnum.MessageMonsterYell:
      return '#FF9A57'
    default:
      return '#FFFF00'
  }
}

function isPrivateMode(mode) {
  return mode === MessageModeEnum.MessagePrivateFrom ||
    mode === MessageModeEnum.MessagePrivateTo ||
    mode === MessageModeEnum.MessageGamemasterPrivateFrom ||
    mode === MessageModeEnum.MessageGamemasterPrivateTo
}

function isChannelMode(mode) {
  return mode === MessageModeEnum.MessageChannel ||
    mode === MessageModeEnum.MessageChannelManagement ||
    mode === MessageModeEnum.MessageChannelHighlight ||
    mode === MessageModeEnum.MessageGamemasterChannel ||
    mode === MessageModeEnum.MessageGuild ||
    mode === MessageModeEnum.MessagePartyManagement ||
    mode === MessageModeEnum.MessageParty
}

function formatClock(timestamp) {
  const d = new Date(timestamp)
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

export default function GameChatPanel() {
  const [channels, setChannels] = useState(BASE_CHANNELS)
  const [channelOrder, setChannelOrder] = useState(BASE_ORDER)
  const [messages, setMessages] = useState({
    [SERVER_CHANNEL_ID]: [],
    [DEFAULT_CHANNEL_ID]: [],
  })
  const [activeChannelId, setActiveChannelId] = useState(DEFAULT_CHANNEL_ID)
  const [text, setText] = useState('')

  const channelsRef = useRef(channels)
  const privateChannelsRef = useRef(new Map())
  const nextPrivateIdRef = useRef(-1)
  const messageIdRef = useRef(0)
  const logRef = useRef(null)

  useEffect(() => {
    channelsRef.current = channels
  }, [channels])

  const ensureChannel = useCallback((id, name, kind = 'channel', extra = {}) => {
    const channelId = Number(id)
    const channelName = String(name || `Channel ${channelId}`)
    setChannels((prev) => {
      const current = prev[channelId]
      if (current && current.name === channelName && current.kind === kind) return prev
      return { ...prev, [channelId]: { ...(current ?? {}), id: channelId, name: channelName, kind, ...extra } }
    })
    setMessages((prev) => (prev[channelId] ? prev : { ...prev, [channelId]: [] }))
    setChannelOrder((prev) => (prev.includes(channelId) ? prev : [...prev, channelId]))
    return channelId
  }, [])

  const ensurePrivateChannel = useCallback((name) => {
    const privateName = String(name || 'Private').trim() || 'Private'
    const key = privateName.toLowerCase()
    const existing = privateChannelsRef.current.get(key)
    if (typeof existing === 'number') {
      ensureChannel(existing, privateName, 'private', { privateName })
      return existing
    }
    const id = nextPrivateIdRef.current--
    privateChannelsRef.current.set(key, id)
    ensureChannel(id, privateName, 'private', { privateName })
    return id
  }, [ensureChannel])

  const appendMessage = useCallback((channelId, entry) => {
    setMessages((prev) => {
      const list = prev[channelId] ?? []
      const next = [...list, entry]
      if (next.length > MAX_MESSAGES) next.splice(0, next.length - MAX_MESSAGES)
      return { ...prev, [channelId]: next }
    })
  }, [])

  const resetChat = useCallback(() => {
    privateChannelsRef.current.clear()
    nextPrivateIdRef.current = -1
    setChannels(BASE_CHANNELS)
    setChannelOrder(BASE_ORDER)
    setMessages({
      [SERVER_CHANNEL_ID]: [],
      [DEFAULT_CHANNEL_ID]: [],
    })
    setActiveChannelId(DEFAULT_CHANNEL_ID)
    setText('')
  }, [])

  useEffect(() => {
    const onTalk = (event) => {
      const detail = event?.detail ?? {}
      const mode = Number(detail.mode)
      const sender = String(detail.name || '').trim()
      const messageText = String(detail.text || '')
      if (!messageText) return

      let channelId = DEFAULT_CHANNEL_ID
      if (isPrivateMode(mode)) {
        channelId = ensurePrivateChannel(sender || 'Private')
      } else if (isChannelMode(mode) && Number(detail.channelId) > 0) {
        channelId = ensureChannel(Number(detail.channelId), channelsRef.current[Number(detail.channelId)]?.name ?? `Channel ${detail.channelId}`)
      } else {
        ensureChannel(DEFAULT_CHANNEL_ID, 'Default', 'default')
      }

      appendMessage(channelId, {
        id: ++messageIdRef.current,
        timestamp: Date.now(),
        mode,
        sender,
        text: messageText,
        color: messageColor(mode),
      })
    }

    const onTextMessage = (event) => {
      const detail = event?.detail ?? {}
      const mode = Number(detail.mode)
      const messageText = String(detail.text || '')
      if (!messageText) return

      let channelId = SERVER_CHANNEL_ID
      if (Number(detail.channelId) > 0) {
        channelId = ensureChannel(Number(detail.channelId), channelsRef.current[Number(detail.channelId)]?.name ?? `Channel ${detail.channelId}`)
      } else {
        ensureChannel(SERVER_CHANNEL_ID, 'Server Log', 'server')
      }

      appendMessage(channelId, {
        id: ++messageIdRef.current,
        timestamp: Date.now(),
        mode,
        sender: '',
        text: messageText,
        color: messageColor(mode),
      })
    }

    const onChannelList = (event) => {
      const list = event?.detail?.channelList ?? []
      for (const entry of list) {
        const channelId = Number(entry?.[0] ?? 0)
        const channelName = String(entry?.[1] ?? '')
        if (channelId > 0 && channelName) ensureChannel(channelId, channelName)
      }
    }

    const onOpenChannel = (event) => {
      const detail = event?.detail ?? {}
      const channelId = Number(detail.channelId ?? 0)
      const channelName = String(detail.channelName ?? `Channel ${channelId}`)
      if (channelId <= 0) return
      ensureChannel(channelId, channelName)
      setActiveChannelId(channelId)
    }

    const onOpenPrivateChannel = (event) => {
      const name = String(event?.detail?.name ?? '')
      const id = ensurePrivateChannel(name || 'Private')
      setActiveChannelId(id)
    }

    const onOpenOwnPrivateChannel = (event) => {
      const detail = event?.detail ?? {}
      const channelId = Number(detail.channelId ?? 0)
      const channelName = String(detail.channelName ?? `Channel ${channelId}`)
      if (channelId <= 0) return
      ensureChannel(channelId, channelName, 'own')
      setActiveChannelId(channelId)
    }

    const onCloseChannel = (event) => {
      const channelId = Number(event?.detail?.channelId ?? 0)
      if (channelId <= DEFAULT_CHANNEL_ID) return

      setChannels((prev) => {
        if (!prev[channelId]) return prev
        const next = { ...prev }
        delete next[channelId]
        return next
      })
      setMessages((prev) => {
        if (!prev[channelId]) return prev
        const next = { ...prev }
        delete next[channelId]
        return next
      })
      setChannelOrder((prev) => prev.filter((id) => id !== channelId))
      setActiveChannelId((prev) => (prev === channelId ? DEFAULT_CHANNEL_ID : prev))
    }

    window.addEventListener('g_game:onTalk', onTalk)
    window.addEventListener('g_game:onTextMessage', onTextMessage)
    window.addEventListener('g_game:onChannelList', onChannelList)
    window.addEventListener('g_game:onOpenChannel', onOpenChannel)
    window.addEventListener('g_game:onOpenPrivateChannel', onOpenPrivateChannel)
    window.addEventListener('g_game:onOpenOwnPrivateChannel', onOpenOwnPrivateChannel)
    window.addEventListener('g_game:onCloseChannel', onCloseChannel)
    window.addEventListener('g_game:onGameEnd', resetChat)

    return () => {
      window.removeEventListener('g_game:onTalk', onTalk)
      window.removeEventListener('g_game:onTextMessage', onTextMessage)
      window.removeEventListener('g_game:onChannelList', onChannelList)
      window.removeEventListener('g_game:onOpenChannel', onOpenChannel)
      window.removeEventListener('g_game:onOpenPrivateChannel', onOpenPrivateChannel)
      window.removeEventListener('g_game:onOpenOwnPrivateChannel', onOpenOwnPrivateChannel)
      window.removeEventListener('g_game:onCloseChannel', onCloseChannel)
      window.removeEventListener('g_game:onGameEnd', resetChat)
    }
  }, [appendMessage, ensureChannel, ensurePrivateChannel, resetChat])

  const activeMessages = useMemo(() => messages[activeChannelId] ?? [], [messages, activeChannelId])

  useEffect(() => {
    if (!logRef.current) return
    logRef.current.scrollTop = logRef.current.scrollHeight
  }, [activeMessages, activeChannelId])

  const sendCurrentMessage = useCallback(() => {
    const message = text.trim()
    if (!message) return

    const channel = channelsRef.current[activeChannelId]
    if (channel?.kind === 'private' && channel.privateName) {
      g_game.talkPrivate(MessageModeEnum.MessagePrivateTo, channel.privateName, message)
    } else if ((channel?.kind === 'channel' || channel?.kind === 'own') && Number(channel.id) > 0) {
      g_game.talkChannel(MessageModeEnum.MessageChannel, Number(channel.id), message)
    } else {
      g_game.talk(message)
    }

    setText('')
  }, [activeChannelId, text])

  const onInputKeyDown = useCallback((event) => {
    if (event.key !== 'Enter') return
    event.preventDefault()
    sendCurrentMessage()
  }, [sendCurrentMessage])

  return (
    <div className="h-full min-h-0 flex flex-col bg-ot-dark/40 border border-ot-border">
      <div className="h-6 flex items-center gap-1 px-1 border-b border-ot-border overflow-x-auto">
        {channelOrder.map((channelId) => {
          const channel = channels[channelId]
          if (!channel) return null
          const active = channelId === activeChannelId
          return (
            <button
              key={channelId}
              type="button"
              onClick={() => setActiveChannelId(channelId)}
              className={`px-2 h-5 text-[10px] whitespace-nowrap border ${active ? 'bg-ot-hover text-ot-text-bright border-ot-border-light' : 'bg-ot-dark text-ot-text/80 border-ot-border'}`}
            >
              {channel.name}
            </button>
          )
        })}
        <button
          type="button"
          onClick={() => g_game.requestChannels()}
          className="ml-auto px-2 h-5 text-[10px] border border-ot-border bg-ot-dark text-ot-text/80 hover:bg-ot-hover"
          title="Request channels"
        >
          Channels
        </button>
      </div>

      <div ref={logRef} className="flex-1 min-h-0 overflow-y-auto px-1 py-1 font-mono text-[11px] leading-4">
        {activeMessages.map((entry) => (
          <div key={entry.id} className="break-words">
            <span className="text-ot-text/40">[{formatClock(entry.timestamp)}] </span>
            {entry.sender ? <span className="text-ot-text/70">{entry.sender}: </span> : null}
            <span style={{ color: entry.color }}>{entry.text}</span>
          </div>
        ))}
      </div>

      <div className="h-8 border-t border-ot-border flex items-center gap-1 px-1">
        <input
          type="text"
          value={text}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={onInputKeyDown}
          className="flex-1 min-w-0 h-6 px-2 bg-ot-dark border border-ot-border text-ot-text text-[11px] focus:outline-none focus:border-ot-border-light"
          placeholder="Type a message..."
        />
        <button
          type="button"
          onClick={sendCurrentMessage}
          className="h-6 px-2 text-[10px] border border-ot-border bg-ot-dark text-ot-text/80 hover:bg-ot-hover"
        >
          Send
        </button>
      </div>
    </div>
  )
}
