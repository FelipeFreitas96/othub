# Migração para Tauri TCP Socket

Este projeto foi migrado de WebSocket para usar sockets TCP nativos do Tauri.

## Estrutura

### Backend (Rust)
- `src-tauri/src/main.rs` - Implementação do servidor TCP com comandos Tauri
- `src-tauri/Cargo.toml` - Dependências Rust
- `src-tauri/tauri.conf.json` - Configuração do Tauri

### Frontend (JavaScript)
- `src/services/protocol/connection.js` - Wrapper JavaScript que usa Tauri API

## Comandos Tauri Disponíveis

### `tcp_connect(params: { host: string, port: number })`
Conecta ao servidor usando TCP nativo.

### `tcp_send(params: { data: number[] })`
Envia um pacote binário para o servidor.

### `tcp_disconnect()`
Desconecta do servidor.

### `tcp_is_connected()`
Verifica se está conectado.

## Eventos Tauri

### `tcp-connection`
Emitido quando a conexão muda de estado.
```javascript
{
  connected: boolean,
  error?: string
}
```

### `tcp-packet-received`
Emitido quando um pacote é recebido do servidor.
```javascript
{
  data: number[]  // Array de bytes
}
```

## Como Usar

### 1. Instalar Rust
Baixe e instale Rust de: https://rustup.rs/

### 2. Instalar dependências
```bash
npm install
```

### 3. Executar em modo desenvolvimento
```bash
npm run tauri dev
```

### 4. Build para produção
```bash
npm run tauri build
```

## Configuração do package.json

Adicione os seguintes scripts ao `package.json`:

```json
{
  "scripts": {
    "tauri": "tauri",
    "tauri:dev": "tauri dev",
    "tauri:build": "tauri build"
  }
}
```

## Ícones

Para gerar os ícones do aplicativo, use a ferramenta oficial do Tauri:

```bash
npm install -g @tauri-apps/cli
npm run tauri icon path/to/icon.png
```

Ou manualmente coloque os ícones em `src-tauri/icons/`:
- `32x32.png`
- `128x128.png`
- `128x128@2x.png`
- `icon.icns` (macOS)
- `icon.ico` (Windows)

## Diferenças do WebSocket

A API do `Connection` permanece a mesma, mas agora usa TCP nativo:

### Antes (WebSocket)
```javascript
const connection = new Connection()
await connection.connect('127.0.0.1', 7171)
```

### Depois (Tauri TCP)
```javascript
// Mesma API!
const connection = new Connection()
await connection.connect('127.0.0.1', 7171)
```

## Vantagens do TCP Nativo

1. **Compatibilidade Total**: Funciona com qualquer servidor OTServ sem necessidade de proxy WebSocket
2. **Performance**: Comunicação direta TCP sem overhead do WebSocket
3. **Binário Nativo**: Suporte completo a dados binários sem conversões
4. **Multiplataforma**: Funciona em Windows, Linux e macOS

## Troubleshooting

### Erro: "Not connected"
Certifique-se de que o servidor está rodando e acessível.

### Erro: "Failed to connect"
Verifique se o host e porta estão corretos e se não há firewall bloqueando.

### Erro ao compilar Rust
Certifique-se de ter instalado o Rust corretamente com `rustup`.
