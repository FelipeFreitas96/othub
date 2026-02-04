import { useState, useCallback, useEffect, useRef } from 'react'
import MiniWindow from '../../components/MiniWindow'
import { useWindowVisibility } from '../../hooks/useWindowVisibility'
import { g_game } from '../../services/client/Game';  
import { useSkillsGameState } from './hooks/useSkillsGameState'
import SkillRow from './ui/SkillRow'
import SkillsMenu from './ui/SkillsMenu'
import { SkillsService } from './service/skillsService'
import { useGameTextMessage } from '../game_textmessage'
import { GameEventsEnum } from '../../services/client/Const';

const { ROWS, ROW_ID_TO_KEY, DEFAULT_VISIBILITY, STORAGE_KEY } = SkillsService

const SKILLS_HOTKEY = 's'

const WINDOW_CONFIG = {
  title: 'Skills',
  icon: '/images/topbuttons/skills.png',
}

const OFFENCE_ROW_IDS = ['skillId7', 'skillId8', 'skillId9', 'skillId10', 'skillId11', 'skillId12']
const MISC_ROW_IDS = ['skillId13', 'skillId14', 'skillId15', 'skillId16']

function shouldShowBar(rowId, visibility) {
  if (visibility.showAllSkillBars) return true
  const key = ROW_ID_TO_KEY[rowId]
  return key ? visibility[key] !== false : true
}

function shouldShowRow(rowId, visibility) {
  if (OFFENCE_ROW_IDS.includes(rowId)) return visibility.showOffenceStats !== false
  if (MISC_ROW_IDS.includes(rowId)) return visibility.showMiscStats !== false
  return true
}

export default function Skills(props) {
  const { id, open, onOpenChange } = props
  const [visibility, setVisibility] = useWindowVisibility(STORAGE_KEY, DEFAULT_VISIBILITY)
  const [menuAnchor, setMenuAnchor] = useState(null)
  const { showMessage } = useGameTextMessage()

  const {
    isOnline,
    refresh,
    online,
    offline,
    getRowDisplayFor,
  } = useSkillsGameState({ game: g_game, initialOnline: false })

  const openRef = useRef(open)
  const onOpenChangeRef = useRef(onOpenChange)
  const idRef = useRef(id)
  openRef.current = open
  onOpenChangeRef.current = onOpenChange
  idRef.current = id

  useEffect(() => {
    // init() - estilo OTClient: atalho Alt+S, connect g_game (onGameStart / onGameEnd)
    const handleKeyDown = (e) => {
      if (e.key.toLowerCase() !== SKILLS_HOTKEY || !e.altKey) return
      e.preventDefault()
      const currentId = idRef.current
      const currentOpen = openRef.current
      const notify = onOpenChangeRef.current
      if (currentId && notify) notify(currentId, !currentOpen)
    }

    window.addEventListener('keydown', handleKeyDown)

    let unsubStart
    let unsubEnd
    if (g_game) {
      unsubStart = g_game.connect(GameEventsEnum.onGameStart, () => { online(); refresh() })
      unsubEnd = g_game.connect(GameEventsEnum.onGameEnd, offline)
      if (g_game.isOnline()) refresh()
    } else {
      online()
      refresh()
    }

    // terminate() - cleanup ao desmontar
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      if (typeof unsubStart === 'function') unsubStart()
      if (typeof unsubEnd === 'function') unsubEnd()
      if (!g_game) offline()
    }
  }, [online, offline, refresh])

  const onToggle = useCallback(
    (key) => {
      if (key === 'showAllSkillBars') {
        setVisibility((v) => ({ ...v, showAllSkillBars: !v.showAllSkillBars }))
        return
      }
      setVisibility((v) => ({ ...v, [key]: !v[key] }))
    },
    [setVisibility]
  )

  const handleContextMenu = useCallback((e) => {
    e.preventDefault()
    setMenuAnchor({ x: e.clientX, y: e.clientY })
  }, [])

  const closeMenu = useCallback(() => setMenuAnchor(null), [])

  const resetExperienceCounter = useCallback(() => {
    showMessage('Experience counter has been reset.')
  }, [showMessage])

  const content = (
    <div
      className="flex flex-col min-h-0 py-0"
      style={{ paddingLeft: 5, paddingRight: 5 }}
      onContextMenu={handleContextMenu}
    >
      {ROWS.map((row) => {
        if (row.separator) {
          if (row.id === 'separator2' && !visibility.showOffenceStats && !visibility.showMiscStats) return null
          return (
            <div
              key={row.id}
              className="border-t border-ot-border min-w-0 flex-shrink-0"
              style={{
                marginTop: row.marginTop ?? 5,
                marginBottom: row.marginBottom ?? 5,
                marginLeft: 5,
                marginRight: 5,
              }}
            />
          )
        }
        if (row.isXpBoost) {
          return (
            <div
              key={row.id}
              className="flex items-center justify-center flex-shrink-0 cursor-pointer hover:opacity-90"
              style={{ height: 30 }}
              role="button"
              tabIndex={0}
              onClick={() => {}}
              title="Store XP Boost"
            >
              <img
                src="/images/ui/button-storexp.png"
                alt="XP Boost"
                className="h-[22px] w-auto object-contain"
              />
            </div>
          )
        }
        if (!shouldShowRow(row.id, visibility)) return null

        const showBar = row.bar ? shouldShowBar(row.id, visibility) : false
        const display = getRowDisplayFor(row.id)
        const value = display?.value ?? row.value
        const percent = display?.percent ?? row.percent ?? 0
        const valueColor = display?.color ?? null
        const rowTitle = display?.tooltip ?? undefined
        return (
          <SkillRow
            key={row.id}
            label={row.label}
            value={value}
            bar={row.bar}
            icon={row.icon}
            percent={percent}
            rowHeight={row.small ? 14 : row.rowHeight}
            marginBottom={row.marginBottom ?? 2}
            marginTop={row.marginTop}
            separator={false}
            showBar={showBar}
            valueColor={valueColor}
            title={rowTitle}
          />
        )
      })}
      <div
        className="flex-shrink-0 mt-1 mx-0.5 mb-0.5 w-3.5 h-3.5 bg-no-repeat bg-center"
        style={{
          backgroundImage: "url('/images/ui/miniborder.png')",
          backgroundSize: '14px 14px',
        }}
        aria-hidden
      />
    </div>
  )

  return (
    <>
      <MiniWindow {...props} title={WINDOW_CONFIG.title} icon={WINDOW_CONFIG.icon}>
        {content}
      </MiniWindow>
      <SkillsMenu
        open={Boolean(menuAnchor)}
        onClose={closeMenu}
        visibility={visibility}
        onToggle={onToggle}
        anchor={menuAnchor}
        onResetExperience={resetExperienceCounter}
      />
    </>
  )
}
