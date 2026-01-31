# Imagens do OTClient

Este projeto usa **as mesmas imagens do OTClient**. Copie a pasta `images` do repositório do OTClient mantendo a estrutura de pastas.

## Como obter as imagens

1. Clone ou baixe o [OTClient (opentibiabr/otclient)](https://github.com/opentibiabr/otclient).
2. No OTClient, as imagens ficam em **`data/images/`** (ou no pacote de dados).
3. Copie todo o conteúdo de `data/images/` do OTClient para **`public/images/`** deste projeto, preservando a estrutura de diretórios.

Exemplo (PowerShell, na raiz do projeto):

```powershell
# Ajuste OTCLIENT_PATH para o caminho onde está o OTClient
$OTCLIENT_PATH = "C:\caminho\para\otclient"
Copy-Item -Path "$OTCLIENT_PATH\data\images\*" -Destination ".\public\images\" -Recurse -Force
```

## Estrutura esperada (paths usados pela UI)

Os componentes referenciam estes paths (mesmos do OTClient). Após copiar, você deve ter algo como:

```
public/images/
├── background                    # client_background
├── ui/
│   ├── 2pixel_up_frame_borderimage   # GameSidePanel
│   ├── background_dark              # GameBottomPanel
│   ├── panel_map                    # GameMapPanel
│   ├── topstats_button_panel        # botões aumentar/diminuir painéis
│   ├── miniborder
│   ├── containerslot
│   ├── vertical_line_dark
│   ├── 1pixel_down_frame
│   ├── button-storexp
│   ├── button-storexp-pressed
│   └── actionbar/
│       ├── actionbar_background-light
│       ├── splitterActBottom
│       ├── background-dark
│       └── locked
├── healthmana/
│   ├── hitpoints_symbol
│   ├── mana_symbol
│   ├── hitpoints_manapoints_bar_border
│   ├── hitpoints_bar_filled
│   └── mana_bar_filled
├── options/
│   └── button_empty
├── game/
│   ├── battle/
│   │   ├── icon-battlelist
│   │   ├── icon-battlelist-players
│   │   ├── icon-battlelist-npc
│   │   ├── icon-battlelist-monster
│   │   ├── icon-battlelist-skull
│   │   ├── icon-battlelist-party
│   │   ├── icon-battlelist-knight
│   │   ├── icon-battlelist-paladin
│   │   ├── icon-battlelist-druid
│   │   ├── icon-battlelist-sorcerer
│   │   ├── icon-battlelist-monk
│   │   ├── icon-battlelist-summon
│   │   └── icon-battlelist-own-guild
│   └── combatmodes/
│       ├── whitedovemode
│       ├── whitehandmode
│       ├── yellowhandmode
│       ├── redfistmode
│       ├── safefight
│       └── onPanel
├── inventory/
│   ├── buttons_general
│   ├── min_button_small
│   ├── max_button_small
│   ├── button_blessings_grey
│   ├── purse
│   ├── button-expert-up
│   ├── button-expert-down
│   └── button-expert-disabled
├── automap/
│   ├── automap_indicator_maplayers
│   ├── automap_indicator_slider_left
│   ├── automap_phantom
│   ├── automap_buttons
│   ├── timedisplay_scroll
│   └── automap_rose
├── topbuttons/
│   ├── skills
│   └── minimap
└── icons/
    ├── icon_magic
    ├── icon_fist
    ├── icon_club
    ├── icon_sword
    ├── icon_axe
    ├── icon_distance
    ├── icon_shielding
    └── icon_fishing
```

Os arquivos do OTClient costumam vir sem extensão no nome no OTUI; no disco podem ser `.png`, `.otml` ou outro. Mantenha os nomes exatamente como no repositório do OTClient. Se o servidor/engine do OTClient usar extensão (ex.: `background.png`), use o mesmo nome aqui.
