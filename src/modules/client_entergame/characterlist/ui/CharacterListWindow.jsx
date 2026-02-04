/**
 * CharacterListWindow - janela de seleção de personagem (estilo OTClient characterlist).
 * Lista vertical de personagens; botões Enter Game e Back.
 */
import { useState } from 'react'
import { WINDOW_TITLE, ENTER_BUTTON_LABEL, BACK_BUTTON_LABEL } from '../service/characterListService'

export default function CharacterListWindow({
  characters = [],
  onEnterGame,
  onBack,
  loading = false,
  error = null,
}) {
  const [selected, setSelected] = useState(null)

  const handleEnter = () => {
    if (!selected) return
    onEnterGame?.(selected)
  }

  return (
    <div
      className="relative z-10 w-[320px] rounded border-2 border-ot-border bg-ot-panel shadow-xl"
      role="dialog"
      aria-labelledby="characterlist-title"
    >
      <div
        id="characterlist-title"
        className="px-3 py-2 border-b border-ot-border text-ot-text-bright text-sm font-verdana"
      >
        {WINDOW_TITLE}
      </div>

      <div className="p-3 space-y-2 text-[11px]">
        {error && (
          <p className="text-red-400 text-[10px]" role="alert">
            {error}
          </p>
        )}

        <div className="max-h-[240px] overflow-y-auto border border-ot-border rounded bg-ot-dark">
          {characters.length === 0 && !loading && (
            <div className="p-3 text-ot-text/70">No characters available.</div>
          )}
          {characters.map((char) => (
            <button
              key={char.id}
              type="button"
              onClick={() => setSelected(char)}
              className={`w-full text-left px-3 py-2 border-b border-ot-border last:border-b-0 hover:bg-white/10 transition-colors ${
                selected?.id === char.id ? 'bg-white/15 text-ot-text-bright' : 'text-ot-text'
              }`}
            >
              <span className="font-verdana">{char.name}</span>
              <span className="text-ot-text/70 ml-2">
                Level {char.level} · {char.vocation}
              </span>
              <span className="text-ot-text/60 block text-[10px]">{char.world}</span>
            </button>
          ))}
        </div>

        <div className="flex gap-2 pt-2">
          <button
            type="button"
            onClick={onBack}
            disabled={loading}
            className="px-3 py-1.5 border border-ot-border rounded hover:bg-ot-hover text-ot-text text-[11px] disabled:opacity-50"
          >
            {BACK_BUTTON_LABEL}
          </button>
          <button
            type="button"
            onClick={handleEnter}
            disabled={!selected || loading}
            className="flex-1 px-4 py-1.5 bg-ot-border-light border border-ot-border rounded hover:bg-ot-text/20 text-ot-text-bright text-[11px] font-verdana disabled:opacity-50"
          >
            {loading ? 'Entering...' : ENTER_BUTTON_LABEL}
          </button>
        </div>
      </div>
    </div>
  )
}
