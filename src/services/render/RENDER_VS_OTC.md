# Render Three.js vs OTClient (OpenGL C++)

Comparação do pipeline de sprites com o OTClient para alinhamento 1:1.

## OTC (C++ OpenGL)

- **Coordenadas**: pixels. `dest` = canto superior-esquerdo do tile na tela; `scaleFactor = m_tileSize / TILE_PIXELS` (geralmente 1).
- **ThingType::draw** (`thingtype.cpp`):
  - `screenRect.pos = dest + (textureOffset - m_displacement - (m_size - Point(1,1)) * 32) * scaleFactor`
  - `screenRect.size = textureRect.size() * scaleFactor`
  - `drawTexturedRect(screenRect, texture, textureRect)` → quad com tamanho do **rect real** do sprite (pode ser trimado).
- **Tile::draw** (`tile.cpp`): passa `dest - m_drawElevation*scaleFactor` para cada thing (elevação sobe na tela).
- **Blending**: OpenGL típico (SRC_ALPHA, ONE_MINUS_SRC_ALPHA).
- **Ordenação**: por ordem de draw (sem depth buffer para sprites).

## Nosso Three.js

| Aspecto | Nosso | OTC | Idêntico? |
|--------|--------|-----|-----------|
| **Unidades** | 1 unidade = 1 tile (world) | pixels | Não: escala depende do canvas |
| **Tamanho do quad** | Sempre `PlaneGeometry(1,1)` (1 tile × 1 tile) | `textureRect.size() * scaleFactor` | Parcial: 1×1 OK; não usamos rect trimado |
| **Displacement** | `dx = displacement.x/32`, `dy = -displacement.y/32` (em tiles) | `dest - displacement` (em pixels) | Sim (sinal e escala alinhados) |
| **Elevation** | `dy - drawElevationPx/32` | `dest - m_drawElevation*scaleFactor` | Sim |
| **Anchor (size)** | Implícito no centro do tile | `(m_size - Point(1,1)) * 32` em pixels | Sim para 1×1; multi-tile por vários quads |
| **Blending** | `transparent: true` (alpha) | GL alpha | Sim |
| **Ordenação** | `depthTest: false`, `renderOrder` | ordem de draw | Sim |
| **Texture rect** | Textura inteira no quad | `textureRect` (sub-rect / trim) | Não: sprites 32×32 fixos, sem trim |

## Diferenças que impedem ser 100% idêntico

1. **Escala do mundo**: Para ficar pixel-perfect como OTC, a projeção deveria garantir **32 px por tile** (ex.: view size da câmera = `(w*32, h*32)` em “pixels” e posições em pixels).
2. **Texture rect / trim**: OTC usa `textureRect` (bounds não transparentes) e `textureOffset`; nós desenhamos a textura inteira 32×32 num quad 1×1. Com sprites sempre 32×32 sem trim, o resultado é equivalente.
3. **Um único PlaneGeometry(1,1)**: Todos os sprites usam o mesmo geometry; OTC desenha um rect por tamanho. Visualmente igual se tudo for 1 tile.

## Conclusão

O comportamento é **equivalente** ao OTC para sprites 32×32 e ordem de draw. Para ficar **idêntico** ao OpenGL do C++ seria preciso:

- Trabalhar em espaço de pixels (ou fixar 1 unidade = 32 px) e
- Opcionalmente suportar texture rects trimados e `textureOffset` se o asset pipeline passar a fornecer sprites trimados.
