import { useEffect, useMemo, useState } from 'react'
import UIWindow from '../../components/UIWindow'
import { getClientOptions, resetClientOptions, updateClientOptions, subscribeClientOptions } from './service/optionsService'

const WINDOW_CONFIG = {
  title: 'Options',
  icon: '/images/options/button_options.png',
}

const CATEGORIES = [
  {
    id: 'controls',
    text: 'Controls',
    icon: '/images/optionstab/controls.png',
    panels: [
      { id: 'generalPanel', text: 'General' },
      { id: 'keybindsPanel', text: 'General Hotkeys' },
    ],
  },
  {
    id: 'interface',
    text: 'Interface',
    icon: '/images/optionstab/game.png',
    panels: [
      { id: 'interface', text: 'Interface' },
      { id: 'interfaceHUD', text: 'HUD' },
      { id: 'interfaceConsole', text: 'Console' },
      { id: 'actionbars', text: 'Action Bars' },
    ],
  },
  {
    id: 'graphics',
    text: 'Graphics',
    icon: '/images/optionstab/graphics.png',
    panels: [
      { id: 'graphicsPanel', text: 'Graphics' },
      { id: 'graphicsEffectsPanel', text: 'Effects' },
    ],
  },
  {
    id: 'sound',
    text: 'Sound',
    icon: '/images/optionstab/audio.png',
    panels: [{ id: 'soundPanel', text: 'Audio' }],
  },
  {
    id: 'misc',
    text: 'Misc.',
    icon: '/images/optionstab/console.png',
    panels: [
      { id: 'misc', text: 'Misc.' },
      { id: 'miscHelp', text: 'Help' },
    ],
  },
]

const PANEL_META = Object.fromEntries(
  CATEGORIES.flatMap((category) =>
    category.panels.map((panel) => [panel.id, { ...panel, categoryId: category.id, categoryText: category.text }])
  )
)

const ACTION_BARS = [
  { key: 'allActionBar13', text: 'Bottom bars: All' },
  { key: 'actionBarShowBottom1', text: 'Bottom bar 1' },
  { key: 'actionBarShowBottom2', text: 'Bottom bar 2' },
  { key: 'actionBarShowBottom3', text: 'Bottom bar 3' },
  { key: 'allActionBar46', text: 'Left bars: All' },
  { key: 'actionBarShowLeft1', text: 'Left bar 1' },
  { key: 'actionBarShowLeft2', text: 'Left bar 2' },
  { key: 'actionBarShowLeft3', text: 'Left bar 3' },
  { key: 'allActionBar79', text: 'Right bars: All' },
  { key: 'actionBarShowRight1', text: 'Right bar 1' },
  { key: 'actionBarShowRight2', text: 'Right bar 2' },
  { key: 'actionBarShowRight3', text: 'Right bar 3' },
]

function OptionSection({ title, children }) {
  return (
    <section className="border border-ot-border bg-[#171717] p-1.5">
      {title && <h4 className="text-[10px] text-ot-text-bright uppercase tracking-wide mb-1">{title}</h4>}
      <div className="space-y-1">{children}</div>
    </section>
  )
}

function OptionCheck({ label, checked, onChange, title }) {
  return (
    <label
      className="flex items-center gap-1.5 text-[11px] text-ot-text cursor-pointer select-none leading-4"
      title={title}
    >
      <input
        type="checkbox"
        className="accent-[#6f6f6f]"
        checked={!!checked}
        onChange={(event) => onChange(event.target.checked)}
      />
      <span>{label}</span>
    </label>
  )
}

function OptionSelect({ label, value, onChange, options, title }) {
  return (
    <label className="flex items-center gap-2 text-[11px] text-ot-text" title={title}>
      <span className="min-w-[100px]">{label}</span>
      <select
        value={String(value)}
        onChange={(event) => onChange(event.target.value)}
        className="h-5 text-[11px] px-1 bg-[#111111] border border-ot-border text-ot-text flex-1 min-w-0"
      >
        {options.map((item) => (
          <option key={String(item.value)} value={String(item.value)}>
            {item.label}
          </option>
        ))}
      </select>
    </label>
  )
}

function OptionSlider({ label, value, onChange, min, max, step = 1, formatValue = (v) => v }) {
  const numeric = Number.isFinite(Number(value)) ? Number(value) : min
  return (
    <div className="space-y-1">
      <div className="text-[11px] text-ot-text leading-4">
        {label}: {formatValue(numeric)}
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={numeric}
        onChange={(event) => onChange(Number(event.target.value))}
        className="w-full h-4"
      />
    </div>
  )
}

function SectionButton({ text, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="h-5 px-2 border border-ot-border bg-[#202020] hover:bg-[#2c2c2c] text-[11px] text-ot-text"
    >
      {text}
    </button>
  )
}

function SidebarButton({ active, icon, text, onClick, compact = false }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full h-5 px-1 border text-[11px] flex items-center gap-1.5 ${
        compact ? 'pl-4' : ''
      } ${active ? 'border-[#6e6e6e] bg-[#2a2a2a] text-ot-text-bright' : 'border-ot-border bg-[#1e1e1e] text-ot-text hover:bg-[#262626]'}`}
    >
      {!compact && icon && (
        <span
          className="w-3 h-3 bg-no-repeat bg-center bg-contain flex-shrink-0"
          style={{ backgroundImage: `url('${icon}')` }}
        />
      )}
      <span className="truncate">{text}</span>
    </button>
  )
}

function openExternal(url) {
  window.open(url, '_blank', 'noopener,noreferrer')
}

function renderPanel(panelId, options, setOption, setAllOptions) {
  switch (panelId) {
    case 'generalPanel':
      return (
        <div className="space-y-1.5">
          <OptionSection title="General Controls">
            <OptionCheck label="Show connection ping" checked={options.showPing} onChange={(v) => setOption('showPing', v)} />
            <OptionSelect
              label="Mouse Control"
              value={options.mouseControlMode}
              onChange={(v) => setOption('mouseControlMode', Number(v))}
              options={[
                { label: 'Regular Controls', value: 0 },
                { label: 'Classic Controls', value: 1 },
                { label: 'Left Smart-Click', value: 2 },
              ]}
            />
            <OptionSelect
              label="Loot Control"
              value={options.lootControlMode}
              onChange={(v) => setOption('lootControlMode', Number(v))}
              options={[
                { label: 'Loot: Right', value: 0 },
                { label: 'Loot: SHIFT+Right', value: 1 },
                { label: 'Loot: Left', value: 2 },
              ]}
            />
            <OptionCheck label="Allow auto chase override" checked={options.autoChaseOverride} onChange={(v) => setOption('autoChaseOverride', v)} />
            <OptionCheck label="Enter to disable chat" checked={options.returnDisablesChat} onChange={(v) => setOption('returnDisablesChat', v)} />
            <OptionCheck label="Move stacks directly" checked={options.moveStack} onChange={(v) => setOption('moveStack', v)} />
            <OptionCheck label="Enable smart walking" checked={options.smartWalk} onChange={(v) => setOption('smartWalk', v)} />
            <OptionCheck label="Open containers maximized" checked={options.openMaximized} onChange={(v) => setOption('openMaximized', v)} />
            <OptionCheck label="Display text messages" checked={options.displayText} onChange={(v) => setOption('displayText', v)} />
          </OptionSection>
          <OptionSection title="Delays">
            <OptionSlider label="Hotkey delay" value={options.hotkeyDelay} min={30} max={250} onChange={(v) => setOption('hotkeyDelay', v)} formatValue={(v) => `${v}ms`} />
            <OptionSlider label="Walk delay after turn" value={options.walkTurnDelay} min={10} max={500} onChange={(v) => setOption('walkTurnDelay', v)} formatValue={(v) => `${v}ms`} />
            <OptionSlider label="Walk delay after teleport" value={options.walkTeleportDelay} min={50} max={500} onChange={(v) => setOption('walkTeleportDelay', v)} formatValue={(v) => `${v}ms`} />
            <OptionSlider label="Walk delay after floor change" value={options.walkStairsDelay} min={50} max={500} onChange={(v) => setOption('walkStairsDelay', v)} formatValue={(v) => `${v}ms`} />
          </OptionSection>
          <OptionSection>
            <SectionButton text="Hotkeys Manager" onClick={() => window.dispatchEvent(new CustomEvent('ot:openHotkeys'))} />
          </OptionSection>
        </div>
      )
    case 'keybindsPanel':
      return (
        <div className="space-y-1.5">
          <OptionSection title="General Hotkeys">
            <div className="text-[11px] text-ot-text/80 leading-4">
              Keybind editor is still being ported. Use the current hotkeys module while this panel is being completed.
            </div>
          </OptionSection>
          <OptionSection>
            <SectionButton text="Open Hotkeys" onClick={() => window.dispatchEvent(new CustomEvent('ot:openHotkeys'))} />
          </OptionSection>
        </div>
      )
    case 'interface':
      return (
        <div className="space-y-1.5">
          <OptionSection title="Interaction">
            <OptionCheck label="Highlight mouse target" checked={options.enableHighlightMouseTarget} onChange={(v) => setOption('enableHighlightMouseTarget', v)} />
            <OptionCheck label="Show item icon while dragging" checked={options.showDragIcon} onChange={(v) => setOption('showDragIcon', v)} />
            <OptionCheck label="Show left panel" checked={options.showLeftPanel} onChange={(v) => setOption('showLeftPanel', v)} />
            <OptionCheck label="Show an extra right panel" checked={options.showRightExtraPanel} onChange={(v) => setOption('showRightExtraPanel', v)} />
            <OptionCheck label="Show spell group cooldowns" checked={options.showSpellGroupCooldowns} onChange={(v) => setOption('showSpellGroupCooldowns', v)} />
            <OptionSelect
              label="Crosshair"
              value={options.crosshair}
              onChange={(v) => setOption('crosshair', v)}
              options={[
                { label: 'Disabled', value: 'disabled' },
                { label: 'Default', value: 'default' },
                { label: 'Full', value: 'full' },
              ]}
            />
            <OptionSelect
              label="Colourise Loot Value"
              value={options.framesRarity}
              onChange={(v) => setOption('framesRarity', v)}
              options={[
                { label: 'None', value: 'none' },
                { label: 'Frames', value: 'frames' },
                { label: 'Corners', value: 'corners' },
              ]}
            />
            <OptionCheck label="Show expiry in inventory" checked={options.showExpiryInInvetory} onChange={(v) => setOption('showExpiryInInvetory', v)} />
            <OptionCheck label="Show expiry in containers" checked={options.showExpiryInContainers} onChange={(v) => setOption('showExpiryInContainers', v)} />
            <OptionCheck label="Show expiry on unused items" checked={options.showExpiryOnUnusedItems} onChange={(v) => setOption('showExpiryOnUnusedItems', v)} />
          </OptionSection>
        </div>
      )
    case 'interfaceHUD':
      return (
        <div className="space-y-1.5">
          <OptionSection title="HUD">
            <OptionCheck label="Display creature names" checked={options.displayNames} onChange={(v) => setOption('displayNames', v)} />
            <OptionCheck label="Display creature health bars" checked={options.displayHealth} onChange={(v) => setOption('displayHealth', v)} />
            <OptionCheck label="Display player mana bar" checked={options.displayMana} onChange={(v) => setOption('displayMana', v)} />
            <OptionCheck label="Display player harmony bar" checked={options.displayHarmony} onChange={(v) => setOption('displayHarmony', v)} />
            <OptionCheck label="Joystick in right panel" checked={options.rightJoystick} onChange={(v) => setOption('rightJoystick', v)} />
            <OptionSlider label="HUD Scale" value={options.hudScale} min={1} max={5} onChange={(v) => setOption('hudScale', v)} formatValue={(v) => `${Math.max((v / 2) + 0.5, 1)}x`} />
            <OptionSlider label="Creature Information Scale" value={options.creatureInformationScale} min={1} max={9} onChange={(v) => setOption('creatureInformationScale', v)} formatValue={(v) => `${Math.max((v / 2) + 0.5, 1)}x`} />
            <OptionSlider label="Message Scale" value={options.staticTextScale} min={1} max={9} onChange={(v) => setOption('staticTextScale', v)} formatValue={(v) => `${Math.max((v / 2) + 0.5, 1)}x`} />
            <OptionSlider label="Animated Message Scale" value={options.animatedTextScale} min={1} max={9} onChange={(v) => setOption('animatedTextScale', v)} formatValue={(v) => `${Math.max((v / 2) + 0.5, 1)}x`} />
          </OptionSection>
        </div>
      )
    case 'interfaceConsole':
      return (
        <div className="space-y-1.5">
          <OptionSection title="Console">
            <OptionCheck label="Show info messages" checked={options.showInfoMessagesInConsole} onChange={(v) => setOption('showInfoMessagesInConsole', v)} />
            <OptionCheck label="Show event messages" checked={options.showEventMessagesInConsole} onChange={(v) => setOption('showEventMessagesInConsole', v)} />
            <OptionCheck label="Show status messages" checked={options.showStatusMessagesInConsole} onChange={(v) => setOption('showStatusMessagesInConsole', v)} />
            <OptionCheck label="Show others status messages in console" checked={options.showOthersStatusMessagesInConsole} onChange={(v) => setOption('showOthersStatusMessagesInConsole', v)} />
            <OptionCheck label="Show timestamps" checked={options.showTimestampsInConsole} onChange={(v) => setOption('showTimestampsInConsole', v)} />
            <OptionCheck label="Show levels" checked={options.showLevelsInConsole} onChange={(v) => setOption('showLevelsInConsole', v)} />
            <OptionCheck label="Show private messages" checked={options.showPrivateMessagesInConsole} onChange={(v) => setOption('showPrivateMessagesInConsole', v)} />
            <OptionCheck label="Show private messages on screen" checked={options.showPrivateMessagesOnScreen} onChange={(v) => setOption('showPrivateMessagesOnScreen', v)} />
            <OptionCheck label="Show loot messages on screen" checked={options.showLootMessagesOnScreen} onChange={(v) => setOption('showLootMessagesOnScreen', v)} />
            <OptionCheck label="Show highlighted text underline" checked={options.showHighlightedUnderline} onChange={(v) => setOption('showHighlightedUnderline', v)} />
          </OptionSection>
        </div>
      )
    case 'actionbars':
      return (
        <div className="space-y-1.5">
          <OptionSection title="Action Bars">
            {ACTION_BARS.map((item) => (
              <OptionCheck key={item.key} label={item.text} checked={options[item.key]} onChange={(v) => setOption(item.key, v)} />
            ))}
            <OptionCheck label="Show assigned hotkey for action button" checked={options.showAssignedHKButton} onChange={(v) => setOption('showAssignedHKButton', v)} />
            <OptionCheck label="Show amount of assigned objects" checked={options.showHKObjectsBars} onChange={(v) => setOption('showHKObjectsBars', v)} />
            <OptionCheck label="Show spell parameters" checked={options.showSpellParameters} onChange={(v) => setOption('showSpellParameters', v)} />
            <OptionCheck label="Show graphical cooldown" checked={options.graphicalCooldown} onChange={(v) => setOption('graphicalCooldown', v)} />
            <OptionCheck label="Show cooldown in seconds" checked={options.cooldownSecond} onChange={(v) => setOption('cooldownSecond', v)} />
            <OptionCheck label="Show action button tooltip" checked={options.actionTooltip} onChange={(v) => setOption('actionTooltip', v)} />
          </OptionSection>
          <OptionSection>
            <SectionButton text="Reset Action Bars" onClick={() => window.dispatchEvent(new CustomEvent('ot:resetActionBars'))} />
          </OptionSection>
        </div>
      )
    case 'graphicsPanel':
      return (
        <div className="space-y-1.5">
          <OptionSection title="Graphics">
            <OptionSelect
              label="Antialiasing Mode"
              value={options.antialiasingMode}
              onChange={(v) => setOption('antialiasingMode', Number(v))}
              options={[
                { label: 'None', value: 0 },
                { label: 'Antialiasing', value: 1 },
                { label: 'Smooth Retro', value: 2 },
              ]}
            />
            <OptionCheck label="Full Screen Mode" checked={options.fullscreen} onChange={(v) => setOption('fullscreen', v)} />
            <OptionCheck label="V-Sync" checked={options.vsync} onChange={(v) => setOption('vsync', v)} />
            <OptionCheck label="Show frame rate" checked={options.showFps} onChange={(v) => setOption('showFps', v)} />
            <OptionSlider
              label="Game framerate limit"
              value={options.backgroundFrameRate}
              min={1}
              max={501}
              onChange={(v) => setOption('backgroundFrameRate', v)}
              formatValue={(v) => (v >= 501 ? 'max' : `${v}`)}
            />
            <OptionCheck label="Optimize FPS" checked={options.optimizeFps} onChange={(v) => setOption('optimizeFps', v)} />
            <OptionCheck label="Force Effect Optimization" checked={options.forceEffectOptimization} onChange={(v) => setOption('forceEffectOptimization', v)} />
            <OptionCheck label="Async texture loading" checked={options.asyncTxtLoading} onChange={(v) => setOption('asyncTxtLoading', v)} />
            <OptionCheck label="Don't stretch/shrink game window" checked={options.dontStretchShrink} onChange={(v) => setOption('dontStretchShrink', v)} />
          </OptionSection>
        </div>
      )
    case 'graphicsEffectsPanel':
      return (
        <div className="space-y-1.5">
          <OptionSection title="Effects">
            <OptionCheck label="Enable lights" checked={options.enableLights} onChange={(v) => setOption('enableLights', v)} />
            <OptionSlider label="Ambient light" value={options.ambientLight} min={0} max={100} onChange={(v) => setOption('ambientLight', v)} formatValue={(v) => `${v}%`} />
            <OptionSlider label="Floor shadowing intensity" value={options.shadowFloorIntensity} min={0} max={100} onChange={(v) => setOption('shadowFloorIntensity', v)} formatValue={(v) => `${v}%`} />
            <OptionSlider label="Floor fading" value={options.floorFading} min={0} max={1000} onChange={(v) => setOption('floorFading', v)} formatValue={(v) => `${v}ms`} />
            <OptionSelect
              label="Floor View Mode"
              value={options.floorViewMode}
              onChange={(v) => setOption('floorViewMode', Number(v))}
              options={[
                { label: 'Normal', value: 0 },
                { label: 'Fade', value: 1 },
                { label: 'Locked', value: 2 },
                { label: 'Always', value: 3 },
                { label: 'Always with transparency', value: 4 },
              ]}
            />
            <OptionCheck label="Draw effect on top" checked={options.drawEffectOnTop} onChange={(v) => setOption('drawEffectOnTop', v)} />
            <OptionCheck label="Limit visible dimension" checked={options.limitVisibleDimension} onChange={(v) => setOption('limitVisibleDimension', v)} />
            <OptionCheck label="Draw floating effects" checked={options.floatingEffect} onChange={(v) => setOption('floatingEffect', v)} />
            <OptionSlider label="Opacity Effect" value={options.setEffectAlphaScroll} min={10} max={100} onChange={(v) => setOption('setEffectAlphaScroll', v)} formatValue={(v) => `${v}%`} />
            <OptionSlider label="Opacity Missile" value={options.setMissileAlphaScroll} min={10} max={100} onChange={(v) => setOption('setMissileAlphaScroll', v)} formatValue={(v) => `${v}%`} />
          </OptionSection>
        </div>
      )
    case 'soundPanel':
      return (
        <div className="space-y-1.5">
          <OptionSection title="Audio">
            <OptionCheck label="Enable audio" checked={options.enableAudio} onChange={(v) => setOption('enableAudio', v)} />
            <OptionCheck label="Enable music sound" checked={options.enableMusicSound} onChange={(v) => setOption('enableMusicSound', v)} />
            <OptionSlider label="Music volume" value={options.musicSoundVolume} min={1} max={100} onChange={(v) => setOption('musicSoundVolume', v)} />
          </OptionSection>
        </div>
      )
    case 'misc':
      return (
        <div className="space-y-1.5">
          <OptionSection title="Misc">
            <OptionCheck label="Allow auto chase override" checked={options.autoChaseOverride} onChange={(v) => setOption('autoChaseOverride', v)} />
            <OptionSelect
              label="Profile"
              value={options.profile}
              onChange={(v) => setOption('profile', Number(v))}
              options={Array.from({ length: 10 }, (_, index) => ({ label: `${index + 1}`, value: index + 1 }))}
            />
          </OptionSection>
        </div>
      )
    case 'miscHelp':
      return (
        <div className="space-y-1.5">
          <OptionSection title="Help">
            <div className="flex gap-1.5">
              <SectionButton text="Wiki" onClick={() => openExternal('https://github.com/mehah/otclient/wiki')} />
              <SectionButton text="Info" onClick={() => openExternal('https://github.com/mehah/otclient/wiki')} />
            </div>
          </OptionSection>
          <OptionSection title="Tools">
            <div className="flex gap-1.5 flex-wrap">
              <SectionButton
                text="Clear Local Options"
                onClick={() => setAllOptions(resetClientOptions())}
              />
              <SectionButton
                text="Change Language"
                onClick={() => window.dispatchEvent(new CustomEvent('ot:openLocales'))}
              />
            </div>
          </OptionSection>
        </div>
      )
    default:
      return (
        <div className="text-[11px] text-ot-text/80">
          Panel not implemented yet.
        </div>
      )
  }
}

export default function ClientOptions(layoutProps) {
  const { id, open = true, onOpenChange, onPositionChange, fixedLeft = 220, fixedTop = 80 } = layoutProps ?? {}
  const [options, setOptions] = useState(() => getClientOptions())
  const [activeCategoryId, setActiveCategoryId] = useState(CATEGORIES[0].id)
  const [activePanelId, setActivePanelId] = useState(CATEGORIES[0].panels[0].id)

  useEffect(() => subscribeClientOptions(setOptions), [])

  const setOption = (key, value) => {
    setOptions(updateClientOptions({ [key]: value }))
  }

  const activeCategory = useMemo(
    () => CATEGORIES.find((category) => category.id === activeCategoryId) ?? CATEGORIES[0],
    [activeCategoryId]
  )
  const activePanel = PANEL_META[activePanelId] ?? PANEL_META[CATEGORIES[0].panels[0].id]

  const onSelectCategory = (category) => {
    setActiveCategoryId(category.id)
    setActivePanelId(category.panels[0].id)
  }

  if (!open) return null

  return (
    <UIWindow
      id={id}
      title={WINDOW_CONFIG.title}
      icon={WINDOW_CONFIG.icon}
      left={fixedLeft}
      top={fixedTop}
      width={686}
      height={534}
      minWidth={686}
      maxWidth={686}
      minHeight={534}
      maxHeight={534}
      draggable
      movable
      onPositionChange={onPositionChange}
      className="border-0 bg-transparent"
      headerClassName="h-[18px] px-2 py-0 border-b border-ot-border bg-[#1a1a1a]"
      contentClassName="p-0 border border-ot-border bg-[#101010]"
      titleClassName="text-[11px]"
      renderHeaderActions={() => (
        <button
          type="button"
          className="w-[16px] h-[14px] border border-ot-border bg-[#2a2a2a] text-ot-text text-[10px] leading-none"
          onClick={() => onOpenChange?.(id, false)}
          title="Close"
        >
          x
        </button>
      )}
    >
      <div className="h-full flex bg-[#101010]">
        <aside className="w-[126px] border-r border-ot-border bg-[#141414] p-1 space-y-1 overflow-y-auto">
          {CATEGORIES.map((category) => (
            <div key={category.id} className="space-y-1">
              <SidebarButton
                active={activeCategoryId === category.id && activePanelId === category.panels[0].id}
                icon={category.icon}
                text={category.text}
                onClick={() => onSelectCategory(category)}
              />
              {activeCategoryId === category.id && category.panels.slice(1).map((panel) => (
                <SidebarButton
                  key={panel.id}
                  compact
                  active={activePanelId === panel.id}
                  text={panel.text}
                  onClick={() => setActivePanelId(panel.id)}
                />
              ))}
            </div>
          ))}
        </aside>
        <section className="flex-1 min-w-0 p-1.5 space-y-1.5 overflow-y-auto">
          <div className="text-[11px] text-ot-text-bright border-b border-ot-border pb-1">
            {activePanel.categoryText} / {activePanel.text}
          </div>
          {renderPanel(activePanelId, options, setOption, setOptions)}
        </section>
      </div>
    </UIWindow>
  )
}
