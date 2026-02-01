/**
 * CharacterList - container do modulo character_list.
 * Encapsula CharacterListWindow e executa o login no game server (g_game.loginWorld).
 */
import { useState } from 'react'
import CharacterListWindow from './ui/CharacterListWindow'
import { g_game } from '../../../services/client/Game'

export default function CharacterList({ characters, onGameStart, onBack }) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const handleEnterGame = async (selected) => {
    if (!selected) return

    setLoading(true)
    setError(null)
    try {
      const result = await g_game.loginWorld({
        worldName: selected.worldName || selected.world,
        worldHost: selected.worldIp,
        worldPort: selected.worldPort,
        characterName: selected.name,
      })

      if (result?.ok && result.player) {
        onGameStart?.(result.player)
      } else {
        setError(result?.message || 'Failed to enter game.')
      }
    } catch (e) {
      setError(e?.message || 'Failed to enter game.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <CharacterListWindow
      characters={characters}
      onEnterGame={handleEnterGame}
      onBack={onBack}
      loading={loading}
      error={error}
    />
  )
}

