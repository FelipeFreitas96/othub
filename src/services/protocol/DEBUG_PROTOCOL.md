# Debug do protocolo (movimento / mapa)

## Log do bridge (Tauri): tamanho vs opcode

No terminal do Tauri aparece `[Tauri WS] TCP -> WS N bytes (Tibia size prefix: X = Y bytes payload ...)`. O **size prefix** são os **2 primeiros bytes** do pacote Tibia (tamanho do payload em little-endian). **Isso não é o opcode.** O opcode (0x64, 101–104, etc.) é o **primeiro byte do payload já decodificado** no cliente (depois de tirar size, checksum e XTEA). Ex.: pacote bruto de 5166 bytes → size prefix = 5164 → o payload tem 5164 bytes; no cliente, após decodificar, o primeiro byte desse payload costuma ser **0x64** (MapDescription). Para ver o opcode real no cliente: no console use `__otDebugBridge = true` e confira `[Connection] decoded packet ... opcode=0x??`.

## Por que o servidor não envia 101–104 (GameServerMapTopRow etc.)?

Muitos servidores OT/TFS **não usam** os opcodes 101–104 (0x65–0x68) na resposta ao movimento. Em vez disso, respondem com **0x64 (MapDescription)** – mapa completo com a nova posição do jogador.

- **Servidores que usam 101–104:** enviam só a nova linha/coluna (Top/Right/Bottom/Left) e o cliente atualiza o walk com esse pacote.
- **Servidores que usam só 0x64:** a cada movimento enviam o mapa inteiro (0x64) com a nova posição; o cliente já trata isso em `parseMapDescription` (atualiza `center` e chama `startWalk` quando a posição muda).

Este cliente suporta **os dois**: se chegar 0x64 após andar, o mapa e o walk são atualizados; se chegar 101–104, idem. Se ao andar não aparecer **nenhum** log de `receive` (nem 0x64 nem 101–104), o problema é a resposta não chegar (conexão, bridge ou servidor não enviando).

## Debug de "Connection closed" (login / disconnect)

Quando o servidor fecha a conexão após o login, o console mostra `[ProtocolGame] onDisconnect:` com o **reason** e um resumo:

- **loginSent** – se o pacote de login já foi enviado
- **gameInitialized** – se o jogo já entrou (LoginSuccess/EnterGame)
- **lastRecvOpcode** – último opcode recebido (ex.: `0x14` = 20 = LoginError; `0x1f` = 31 = Challenge)

Para ver **cada pacote** enviado e recebido (tamanho + primeiros bytes em hex), no console:

```js
__otDebugConnection = true
```

Depois recarregue e tente logar de novo. Você verá:

- `[ProtocolGame] sendLoginPacket N bytes (hex...)` – pacote de login enviado
- `[ProtocolGame] recv N bytes, opcode=0x??` – cada pacote recebido do servidor
- `[Connection] disconnect from backend: {...}` – mensagem exata que o bridge enviou ao fechar

Se **lastRecvOpcode** for `0x14` (20), o servidor enviou **LoginError** antes de fechar; a mensagem de erro deve aparecer na UI. Se for `null` ou outro valor, o servidor pode ter fechado sem enviar opcode (ex.: falha ao descriptografar, versão incompatível).

## Ativar logs no console

**Opção 1 – URL**  
Abra o jogo com: `?debug=protocol`  
Ex.: `http://localhost:5173/?debug=protocol`

**Opção 2 – Console do navegador**  
No DevTools (F12) → Console, digite:
```js
__otDebugProtocol = true
```
Depois ande com WASD e observe os logs.

## O que aparece nos logs (só mapa e movimento)

| Log | Significado |
|-----|-------------|
| `[protocol] receive N bytes, opcode= 0x64 (MapDescription)` | Chegou pacote de mapa do servidor. |
| `[protocol] 0x64 mapa pos= {...}` | Mapa parseado; `pos` = nova posição do jogador. |
| `[protocol] ot:map disparado pos= {...}` | Evento `ot:map` disparado para a UI. |
| `[protocol] sendMove dir= X` | Tecla WASD enviada. Se aparecer `(sem conexão!)` a conexão caiu. |
| `[MapView] centro mudou -> x y z` | MapView detectou nova posição e atualizou a vista. |
| `[protocol] opcode desconhecido (ignorado) X` | Servidor enviou opcode que não tratamos (após login). |

## Como interpretar

1. **Andou e não apareceu nada**  
   - Não está chegando pacote após o movimento.  
   - Confira se `sendMove` mostra `connected= true` ao apertar WASD.

2. **Aparece `receive ... firstByte= 100` mas não aparece `0x64 MapDescription`**  
   - O primeiro byte do pacote é 100 (0x64), mas o parser não está entrando no `if (opcode === 0x64)`.  
   - Pode ser checksum/XTEA/tamanho consumindo bytes antes do opcode.

3. **Aparece `0x64 MapDescription pos= ...` mas a tela não muda**  
   - O mapa está sendo parseado; o problema é na vista.  
   - Veja se aparece `[MapView] center changed`; se não aparecer, a sync do MapStore com a MapView pode estar falhando.

4. **Aparece `unknown opcode after login` com um número que não é 100**  
   - O servidor está enviando outro opcode antes ou em vez do 0x64 (mapa).  
   - Anote o opcode (número e 0xXX) para tratar no código ou para checar a documentação do servidor.

## Desativar

No console:
```js
__otDebugProtocol = false
```
