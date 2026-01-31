# OTClient Web UI

Primeira versão: **UI do [OTClient](https://github.com/opentibiabr/otclient) adaptada para HTML5 com Vite + React + Tailwind CSS.**

A interface replica a estrutura dos módulos em `modules/` do repositório [opentibiabr/otclient](https://github.com/opentibiabr/otclient/tree/main/modules), convertendo os arquivos **OTUI/OTML** em componentes React estilizados com **Tailwind**.

## Módulos adaptados

| Módulo OTClient | Componente React | Arquivo origem |
|-----------------|------------------|----------------|
| game_interface  | GameInterface, TopStatsBar, GameMapPanel, GameLeftPanel, GameRightPanel, GameBottomPanel, BottomSplitter | gameinterface.otui |
| game_healthinfo | HealthMana       | healthinfo.otui |
| game_battle     | BattleList       | battle.otui |
| game_skills     | Skills           | skills.otui |
| game_inventory  | Inventory        | inventory.otui |
| game_minimap    | Minimap          | minimap.otui |

## Como rodar

```bash
npm install
npm run dev
```

Abrir `http://localhost:5173`.

## Scripts

- `npm run dev` — servidor de desenvolvimento
- `npm run build` — build de produção
- `npm run preview` — preview do build

## Estrutura do projeto

```
src/
  components/           # Layout principal (gameinterface)
    GameInterface.jsx
    TopStatsBar.jsx
    GameMapPanel.jsx
    GameLeftPanel.jsx
    GameRightPanel.jsx
    GameBottomPanel.jsx
    BottomSplitter.jsx
  components/modules/   # Módulos equivalentes ao OTClient
    HealthMana.jsx      # game_healthinfo
    BattleList.jsx      # game_battle
    Skills.jsx          # game_skills
    Inventory.jsx       # game_inventory
    Minimap.jsx         # game_minimap
```

## Próximos passos (fora do escopo desta versão)

- Conectar a um servidor OTServ (protocolo/WebSocket)
- Renderizar o mapa em canvas/WebGL
- Carregar sprites e assets do cliente Tibia/OTClient
- Lógica de jogo (movimento, battle list real, inventário real, etc.)

## Referências

- [OTClient - opentibiabr/otclient](https://github.com/opentibiabr/otclient)
- [OTClient modules](https://github.com/opentibiabr/otclient/tree/main/modules)
