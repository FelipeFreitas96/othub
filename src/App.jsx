import { useState, useCallback } from 'react'
import { GameProvider, useGame } from './game'
import { GameTextMessageProvider } from './components/modules/game_textmessage'
import { CharacterList } from './components/modules/character_list'
import { EnterGame } from './components/modules/entergame'
import ClientBackground from './components/ClientBackground'
import GameInterface from './components/GameInterface'
import { login } from './services/protocol/loginProtocol'

/**
 * OTClient Web UI - Fluxo de início
 * - client_background: tela cheia com fundo e label de versão (visível quando não está no jogo)
 * - client_entergame: janela "Enter Game" (login) -> protocolo login -> character list
 * - character_list: seleção de personagem -> protocolo enter game -> g_game.startGame(player)
 * - game_interface: layout do jogo — visível após entrar no jogo
 */
function AppContent() {
  const [gameStarted, setGameStarted] = useState(false)
  const [characters, setCharacters] = useState(null)
  const { startGame, setClientVersion } = useGame()

  const handleLoginSuccess = useCallback((list, clientVersion) => {
    setClientVersion?.(clientVersion)
    setCharacters(list)
  }, [setClientVersion])

  const handleCharacterListBack = useCallback(() => {
    setCharacters(null)
  }, [])

  if (gameStarted) {
    return (
      <div className="w-full h-full">
        <GameInterface />
      </div>
    )
  }

  if (characters !== null) {
    return (
      <div className="w-full h-full relative flex items-center justify-center">
        <ClientBackground />
        <CharacterList
          characters={characters}
          onGameStart={(player) => {
            startGame(player)
            setGameStarted(true)
            setCharacters(null)
          }}
          onBack={handleCharacterListBack}
        />
      </div>
    )
  }

  return (
    <div className="w-full h-full relative flex items-center justify-center">
      <ClientBackground />
      <EnterGame onLogin={login} onLoginSuccess={handleLoginSuccess} />
    </div>
  )
}

function App() {
  return (
    <GameProvider>
      <GameTextMessageProvider>
        <AppContent />
      </GameTextMessageProvider>
    </GameProvider>
  )
}

export default App
