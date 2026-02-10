/**
 * Uma linha do Skills - idêntico ao OTClient SkillButton / SmallSkillButton + SkillNameLabel + SkillValueLabel + RedPercentPanel / SkillPercentPanel + ImageSkill.
 * SkillButton: height 21, margin-bottom 2. SmallSkillButton: height 14.
 * Barra: height 5, margin-top 15 (ou 1 para compactar). Verde (skills) ou vermelho (level/stamina/offline). Com ícone: margin-left 15 na barra.
 * Fonte: verdana-11px-monochrome, color #C0C0C0.
 */
export default function SkillRow({
  label,
  value,
  bar,
  icon,
  percent = 0,
  rowHeight = 21,
  marginBottom = 2,
  marginTop,
  separator,
  showBar = true,
  valueColor,
  title: rowTitle,
}) {
  if (separator) {
    return (
      <div
        className="border-t border-ot-border min-w-0 flex-shrink-0"
        style={{ marginLeft: 5, marginRight: 5, marginTop: 5, marginBottom: 5 }}
      />
    )
  }

  const hasBar = bar != null
  const showBarLine = hasBar && showBar
  const barHeight = 5
  const labelHeight = showBarLine ? rowHeight - barHeight - 1 : rowHeight
  const barColor = bar === 'red' ? '#8b0000' : '#2d5016'

  return (
    <div
      className="flex flex-col min-w-0 cursor-default rounded-sm flex-shrink-0"
      style={{
        height: rowHeight,
        marginBottom,
        marginTop: marginTop ?? 0,
        fontSize: 11,
        fontWeight: 'bold',
        color: '#C0C0C0',
        fontFamily: 'Verdana, sans-serif',
      }}
      title={rowTitle}
    >
      <div
        className="flex items-center justify-between min-w-0 flex-shrink-0"
        style={{ height: labelHeight }}
      >
        <span className="flex-1 min-w-0 truncate" style={{ WebkitFontSmoothing: 'none' }}>
          {label}
        </span>
        <span
          className="tabular-nums flex-shrink-0 text-right"
          style={{ WebkitFontSmoothing: 'none', color: valueColor ?? '#C0C0C0' }}
        >
          {value}
        </span>
      </div>
      {showBarLine && (
        <div
          className="flex items-center min-w-0 flex-shrink-0"
          style={{ marginTop: 1, height: barHeight }}
        >
          {icon && (
            <img
              src={icon}
              alt=""
              className="flex-shrink-0 object-contain"
              style={{ width: 9, height: 9, marginRight: 6 }}
            />
          )}
          <div
            className="flex-1 min-w-0 overflow-hidden rounded-sm"
            style={{
              height: barHeight,
              backgroundColor: 'rgba(0,0,0,0.4)',
              marginLeft: icon ? 0 : 0,
            }}
          >
            <div
              className="h-full rounded-sm transition-[width]"
              style={{
                width: `${Math.min(100, Math.max(0, percent))}%`,
                backgroundColor: barColor,
              }}
            />
          </div>
        </div>
      )}
    </div>
  )
}
