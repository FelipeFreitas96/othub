import { useState, useCallback, useEffect } from "react";
import { GameTextMessageProvider } from "./modules/game_textmessage";
import { CharacterList } from "./modules/client_entergame/characterlist";
import { EnterGame } from "./modules/client_entergame";
import ClientBackground from "./modules/client_background";
import GameInterface from "./modules/game_interface";
import { login } from "./services/protocol/loginProtocol";
import { g_game } from './services/client/Game';
import { g_drawPool } from "./services/graphics/DrawPoolManager";

/**
 * OTClient Web UI - Fluxo de início
 * - client_background: tela cheia com fundo e label de versão (visível quando não está no jogo)
 * - client_entergame: janela "Enter Game" (login) -> protocolo login -> character list
 * - character_list: seleção de personagem -> protocolo enter game -> g_game.startGame(player)
 * - game_interface: layout do jogo — visível após entrar no jogo
 */
function AppContent() {
  const [gameStarted, setGameStarted] = useState(false);
  const [characters, setCharacters] = useState(null);
  const handleLoginSuccess = useCallback(
    (list, clientVersion) => {
      g_drawPool.init(32);
      g_game.setClientVersion(clientVersion);
      setCharacters(list);
    },
    []
  );

  const handleCharacterListBack = useCallback(() => {
    setCharacters(null);
  }, []);

  if (gameStarted) {
    return (
      <div className="w-full h-full">
        <GameInterface />
      </div>
    );
  }

  if (characters !== null) {
    return (
      <div className="w-full h-full relative flex items-center justify-center">
        <ClientBackground />
        <CharacterList
          characters={characters}
          onGameStart={async (player) => {
            setGameStarted(true);
            setCharacters(null);
          }}
          onBack={handleCharacterListBack}
        />
      </div>
    );
  }

  return (
    <div className="w-full h-full relative flex items-center justify-center">
      <ClientBackground />
      <EnterGame onLogin={login} onLoginSuccess={handleLoginSuccess} />
    </div>
  );
}

function App() {
  return (
    <GameTextMessageProvider>
      <AppContent />
    </GameTextMessageProvider>
  );
}

export default App;
