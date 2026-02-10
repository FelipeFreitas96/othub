import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import OtcImage from '../../../components/OtcImage'
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

const IMG = {
  consoleButtons: '/images/ui/console_buttons.png',
  consoleButtonTab: '/images/ui/console_button.png',
  consoleSay: '/images/ui/console_say.png',
  consoleWhisper: '/images/ui/console_whisper.png',
  consoleYell: '/images/ui/console_yell.png',
  frameOuter: '/images/ui/2pixel_up_frame_borderimage.png',
  frameBuffer: '/images/ui/3pixel_frame_borderimage.png',
  flashLeft: '/images/ui/console_flash_left.png',
  flashRight: '/images/ui/console_flash_right.png',
  readOnly: '/images/game/console/readOnly.png',
}

const LAYOUT = {
  contentTop: 20,
  contentBottom: 25,
  contentLeft: 3,
  contentRight: 6,
  tabsTop: 0,
  tabsLeft: 18,
  tabsRight: 176,
}

function getTabWidth(label) {
  const text = String(label || '')
  return Math.max(96, Math.min(220, Math.round(text.length * 7.5 + 40)))
}

function messageColor(mode) {
  switch (mode) {
    case MessageModeEnum.MessageChannelManagement:
    case MessageModeEnum.MessageGuild:
    case MessageModeEnum.MessagePartyManagement:
    case MessageModeEnum.MessageParty:
      return '#ffffff'
    case MessageModeEnum.MessageChannelHighlight:
      return '#f6a731'
    case MessageModeEnum.MessagePrivateFrom:
    case MessageModeEnum.MessagePrivateTo:
      return '#9f9dfd'
    case MessageModeEnum.MessageNpcFrom:
    case MessageModeEnum.MessageNpcTo:
      return '#5ff7f7'
    case MessageModeEnum.MessageGamemasterBroadcast:
    case MessageModeEnum.MessageGamemasterChannel:
    case MessageModeEnum.MessageGamemasterPrivateFrom:
    case MessageModeEnum.MessageGamemasterPrivateTo:
      return '#f55e5e'
    case MessageModeEnum.MessageMonsterSay:
    case MessageModeEnum.MessageMonsterYell:
      return '#ff9a57'
    default:
      return '#ffff00'
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

function ToolbarIconButton({ title, x, y, clipX, clipY = 0, onClick, disabled = false }) {
  return (
    <button
      type="button"
      title={title}
      disabled={disabled}
      className="absolute z-[20] w-4 h-4 bg-no-repeat disabled:opacity-50"
      style={{
        right: `${x}px`,
        top: `${y}px`,
        backgroundImage: `url('${IMG.consoleButtons}')`,
        backgroundPosition: `-${clipX}px -${clipY}px`,
        backgroundRepeat: 'no-repeat',
      }}
      onClick={onClick}
    />
  )
}

function ConsoleTabButton({ label, active, onClick }) {
  const width = getTabWidth(label)
  return (
    <button
      type="button"
      onClick={onClick}
      className="relative h-[18px] flex-none"
      style={{ width: `${width}px` }}
    >
      <OtcImage
        src={IMG.consoleButtonTab}
        clip={active ? { x: 0, y: 0, width: 96, height: 18 } : { x: 0, y: 18, width: 96, height: 18 }}
        className="pointer-events-none"
        style={{ position: 'absolute', left: 0, top: 0, right: 0, bottom: 0 }}
      />
      <span
        className="relative z-[1] block h-[18px] leading-[18px] px-[20px] text-center truncate"
        style={{ color: active ? '#dfdfdf' : '#7f7f7f' }}
      >
        {label}
      </span>
    </button>
  )
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
  const [chatOff, setChatOff] = useState(false)
  const [sayMode, setSayMode] = useState(2)

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
    if (chatOff) return
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
  }, [activeChannelId, chatOff, text])

  const onInputKeyDown = useCallback((event) => {
    if (event.key !== 'Enter') return
    event.preventDefault()
    sendCurrentMessage()
  }, [sendCurrentMessage])

  const closeCurrentChannel = useCallback(() => {
    if (activeChannelId <= DEFAULT_CHANNEL_ID) return
    setChannels((prev) => {
      if (!prev[activeChannelId]) return prev
      const next = { ...prev }
      delete next[activeChannelId]
      return next
    })
    setMessages((prev) => {
      if (!prev[activeChannelId]) return prev
      const next = { ...prev }
      delete next[activeChannelId]
      return next
    })
    setChannelOrder((prev) => prev.filter((id) => id !== activeChannelId))
    setActiveChannelId(DEFAULT_CHANNEL_ID)
  }, [activeChannelId])

  const cycleSayMode = useCallback(() => {
    setSayMode((prev) => (prev === 3 ? 1 : prev + 1))
  }, [])

  const sayModeImage = sayMode === 1 ? IMG.consoleWhisper : sayMode === 3 ? IMG.consoleYell : IMG.consoleSay

  return (
    <div className="w-full h-full min-h-0 min-w-0 relative text-[14px] font-verdana leading-[14px]">
      <OtcImage
        src={IMG.frameOuter}
        border={3}
        className="pointer-events-none z-0"
        style={{ position: 'absolute', left: 0, right: 0, top: 16, bottom: 0 }}
      />

      <OtcImage
        src={IMG.frameBuffer}
        border={4}
        className="z-[5] bg-[#111416]"
        style={{
          position: 'absolute',
          left: `${LAYOUT.contentLeft}px`,
          right: `${LAYOUT.contentRight}px`,
          top: `${LAYOUT.contentTop}px`,
          bottom: `${LAYOUT.contentBottom}px`,
        }}
      >
        <div className="absolute inset-[4px] bg-[#111416]" />
        <div ref={logRef} className="absolute inset-[4px] overflow-y-auto pr-[8px] leading-[20px] text-[#ffff00]">
          {activeMessages.map((entry) => (
            <div key={entry.id} className="break-words">
              <span className="text-ot-text/40">[{formatClock(entry.timestamp)}] </span>
              {entry.sender ? <span className="text-ot-text/70">{entry.sender}: </span> : null}
              <span style={{ color: entry.color }}>{entry.text}</span>
            </div>
          ))}
        </div>
      </OtcImage>

      <button
        type="button"
        className="absolute right-[5px] top-0 z-[20] w-[96px] h-[18px] text-[#dfdfdf] text-[14px] flex items-center px-[20px] gap-1 truncate"
        title="Read-only"
      >
        <OtcImage
          src={IMG.consoleButtonTab}
          clip={{ x: 0, y: 0, width: 96, height: 18 }}
          className="pointer-events-none"
          style={{ position: 'absolute', left: 0, top: 0, right: 0, bottom: 0 }}
        />
        <span className="w-[14px] h-[14px] bg-no-repeat bg-center shrink-0" style={{ backgroundImage: `url('${IMG.readOnly}')` }} />
        <span className="relative z-[1] truncate">Read-only</span>
      </button>

      <button
        type="button"
        className="absolute z-[20] w-[18px] h-[18px] bg-no-repeat"
        style={{
          left: '0px',
          top: `${LAYOUT.tabsTop}px`,
          backgroundImage: `url('${IMG.flashLeft}')`,
          backgroundPosition: '0 0',
          backgroundRepeat: 'no-repeat',
        }}
      />

      <div
        className="absolute z-[20] h-[18px] flex items-stretch gap-[2px] overflow-x-auto overflow-y-hidden"
        style={{
          left: `${LAYOUT.tabsLeft}px`,
          right: `${LAYOUT.tabsRight}px`,
          top: `${LAYOUT.tabsTop}px`,
        }}
      >
        {channelOrder.map((channelId) => {
          const channel = channels[channelId]
          if (!channel) return null
          const active = channelId === activeChannelId
          return (
            <ConsoleTabButton
              key={channelId}
              label={channel.name}
              active={active}
              onClick={() => setActiveChannelId(channelId)}
            />
          )
        })}
      </div>

      <button
        type="button"
        className="absolute z-[20] w-[18px] h-[18px] bg-no-repeat"
        style={{
          right: `${LAYOUT.tabsRight}px`,
          top: `${LAYOUT.tabsTop}px`,
          backgroundImage: `url('${IMG.flashRight}')`,
          backgroundPosition: '0 0',
          backgroundRepeat: 'no-repeat',
        }}
      />

      <ToolbarIconButton title="Close this channel" x={140} y={3} clipX={0} clipY={48} onClick={closeCurrentChannel} />
      <ToolbarIconButton title="Open new channel" x={123} y={3} clipX={0} clipY={0} onClick={() => g_game.requestChannels()} />
      <ToolbarIconButton title="Ignore players" x={106} y={3} clipX={0} clipY={32} />

      <button
        type="button"
        onClick={cycleSayMode}
        className="absolute left-[5px] bottom-[4px] w-[18px] h-[18px] bg-no-repeat z-[20]"
        style={{
          backgroundImage: `url('${sayModeImage}')`,
          backgroundPosition: '0 0',
          backgroundRepeat: 'no-repeat',
        }}
        title="Set talk type"
      />

      <input
        type="text"
        value={text}
        onChange={(event) => setText(event.target.value)}
        onKeyDown={onInputKeyDown}
        disabled={chatOff}
        className="absolute left-[28px] right-[72px] bottom-[3px] h-[18px] px-2 bg-[#111416] border border-ot-border text-ot-text text-[14px] leading-none focus:outline-none focus:border-ot-border-light z-[20]"
        placeholder="Type a message..."
      />

      <button
        type="button"
        onClick={() => setChatOff((v) => !v)}
        className="absolute right-[3px] bottom-[3px] w-[64px] h-[18px] border border-ot-border bg-[#202020] text-[#c0c0c0] text-[14px] leading-none z-[20]"
      >
        {chatOff ? 'Chat Off' : 'Chat On'}
      </button>
    </div>
  )
}
