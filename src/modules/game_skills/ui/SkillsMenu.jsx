/**
 * Menu de contexto do Skills - idêntico ao OTClient SkillsListSubMenu (skills.otui).
 * Ordem: Reset Experience Counter, separador, Level/Stamina/.../Fishing, separador,
 * Offence Stats, Defence Stats, Misc. Stats, separador, Show all Skill Bars.
 */
import ContextMenu, { ContextMenuItem, ContextMenuSeparator } from '../../../components/ContextMenu'
import { SkillsService } from '../service/skillsService'

const { BAR_OPTIONS, MENU_LABELS } = SkillsService

const STATS_KEYS = ['showOffenceStats', 'showDefenceStats', 'showMiscStats']

export default function SkillsMenu({ open, anchor, onClose, visibility, onToggle, onResetExperience }) {
  return (
    <ContextMenu open={open ? anchor : null} onClose={onClose}>
      <ContextMenuItem
        onClick={() => {
          if (onResetExperience) onResetExperience()
          onClose()
        }}
      >
        Reset Experience Counter
      </ContextMenuItem>
      <ContextMenuSeparator />
      {BAR_OPTIONS.map(({ key }) => (
        <ContextMenuItem
          key={key}
          checkbox
          checked={visibility[key]}
          onClick={() => onToggle(key)}
        >
          {MENU_LABELS[key]}
        </ContextMenuItem>
      ))}
      <ContextMenuSeparator />
      {STATS_KEYS.map((key) => (
        <ContextMenuItem
          key={key}
          checkbox
          checked={visibility[key]}
          onClick={() => onToggle(key)}
        >
          {MENU_LABELS[key]}
        </ContextMenuItem>
      ))}
      <ContextMenuSeparator />
      <ContextMenuItem
        checkbox
        checked={visibility.showAllSkillBars}
        onClick={() => onToggle('showAllSkillBars')}
      >
        {MENU_LABELS.showAllSkillBars}
      </ContextMenuItem>
    </ContextMenu>
  )
}
