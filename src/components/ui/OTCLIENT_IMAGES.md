# OtcImage – todas as funcionalidades de imagem do OTClient

O componente **OtcImage** replica as propriedades de imagem do OTClient (.otui) em um único componente.

## Implementação em Canvas (igual ao OTClient)

O **OtcImage** desenha em **Canvas** replicando a lógica do OTClient:

- **image-border (9-slice):** cantos desenhados 1:1, bordas esticadas em um eixo, centro esticado nos dois (como no cliente C++).
- **image-clip + image-repeated:** região clipada desenhada em tiles para preencher o elemento (cada tile no tamanho do clip, 1:1).
- **image-repeated (sem clip):** imagem inteira em tiles (repeat-x / repeat-y conforme as props).
- **Sem border/clip:** imagem desenhada uma vez (1:1, cover, contain ou offset conforme as props).

O canvas fica atrás do conteúdo (`children`); o tamanho acompanha o container via `ResizeObserver`.

## Propriedades (equiv. OTClient)

| OTClient (.otui)     | Prop do OtcImage | Tipo / Exemplo | Descrição |
|----------------------|------------------|----------------|-----------|
| image-source         | `src`            | string         | URL da imagem (obrigatório). |
| image-clip           | `clip`           | rect ou `"x y w h"` | Região da imagem a usar (rect na fonte). |
| image-repeated      | `repeated` ou `repeat` | `true` \| `'x'` \| `'y'` \| `false` | Repetir a (região clipada da) imagem. |
| image-border        | `border`         | number ou `{ top, right, bottom, left }` | 9-slice: borda fixa, centro estica. |
| image-color         | `color`         | string (cor CSS) | Tint/overlay de cor (ex: `'rgba(255,0,0,0.3)'`). |
| image-fixed-ratio   | `fixedRatio`     | bool           | Manter proporção (ex.: background-size: contain). |
| image-smooth        | `smooth`        | bool           | Suavização (image-rendering: auto vs pixelated). |
| image-auto-resize   | `autoResize`     | bool           | Imagem preenche o elemento (ex.: cover). |
| image-offset        | `offset`         | `{ x, y }` ou número | Deslocamento da imagem (ex.: background-position). |

## Regras de uso (como no OTClient)

1. **Se `border` estiver definido:** usa **9-slice** (border-image). Cantos e bordas mantêm tamanho; o centro estica. Nesse modo, `clip` e `repeated` não alteram o desenho principal.
2. **Se `clip` estiver definido (sem `border`):** desenha só a **região clipada**; `repeated`/`repeat` controla se essa região se repete para preencher.
3. **Caso contrário:** usa a **imagem inteira** como fundo; `repeated`, `fixedRatio`, `autoResize`, `offset` e `style` aplicam-se normalmente.

## Exemplos

```jsx
// image-border: 4 (GameSidePanel – 9-slice)
<OtcImage src="/images/ui/2pixel_up_frame_borderimage.png" border={4} />

// image-clip + image-repeated (tile da região)
<OtcImage src="/images/ui/panel.png" clip="4 4 8 8" repeated />

// Botão TopStats (image-clip, sem repeat)
<OtcImage src="/images/ui/topstats_button_panel.png" clip={{ x: 27, y: 0, width: 9, height: 27 }} />

// Fundo repetido (image-repeated: true)
<OtcImage src="/images/ui/background_dark.png" repeat />

// Repeat só horizontal (splitter)
<OtcImage src="/images/ui/actionbar/splitterActBottom.png" repeat="x" style={{ backgroundSize: 'auto 100%' }} />

// Imagem com proporção fixa e suavização
<OtcImage src="/images/logo.png" fixedRatio smooth />

// Tint de cor
<OtcImage src="/images/icon.png" color="rgba(255,255,0,0.2)" />
```

## image-clip (detalhe)

- **Formato:** objeto `{ x, y, width, height }` ou string no estilo OTUI: `"x y width height"`.
- Com `repeated`/`repeat`: a região clipada é usada como **tile** e repetida para preencher o elemento (cada tile em tamanho `width × height` px).
- Sem repeat: a região é desenhada uma vez (tamanho do tile = tamanho do clip).

## image-border (9-slice)

- A imagem é cortada em **9 partes** por um valor de borda (em px) a partir de cada lado.
- **Cantos:** desenhados em tamanho fixo.
- **Lados:** esticam em uma direção.
- **Centro:** estica nas duas direções.
- Equivalente CSS: `border-image` com `border-image-slice` e `border-image-width`.
