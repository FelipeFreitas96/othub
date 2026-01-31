# Guia Rápido - Migração para Tauri TCP

## ✅ O que foi feito

1. **Backend Rust criado** (`src-tauri/`)
   - Implementação completa de TCP socket nativo
   - Comandos Tauri para conectar, enviar e receber dados
   - Sistema de eventos para comunicação assíncrona

2. **Frontend atualizado** (`src/services/protocol/connection.js`)
   - Substituição do WebSocket por Tauri TCP
   - API mantida compatível com código existente
   - Sem necessidade de alterar outros arquivos

3. **Configuração do projeto**
   - `package.json` atualizado com scripts Tauri
   - Dependências configuradas
   - Arquivos de configuração criados

## 🚀 Próximos Passos

### 1. Instalar Rust (se ainda não tiver)

**Windows:**
```bash
# Baixe e execute o instalador:
# https://rustup.rs/
```

Ou use o winget:
```bash
winget install --id Rustlang.Rustup
```

### 2. Instalar dependências do projeto

```bash
npm install
```

### 3. Executar em modo desenvolvimento

```bash
npm run tauri:dev
```

Isso irá:
- Compilar o backend Rust
- Iniciar o Vite dev server
- Abrir a aplicação Tauri

### 4. (Opcional) Gerar ícones

```bash
# Usando a imagem gerada anteriormente ou sua própria
npm run tauri icon caminho/para/icone.png
```

## 🔧 Testando a Conexão

No seu código existente, a conexão TCP funcionará automaticamente:

```javascript
import { getConnection } from './services/protocol/connection.js'

const connection = getConnection()

// Conectar (agora usa TCP nativo!)
await connection.connect('127.0.0.1', 7171)

// Enviar pacote
await connection.send(packetData)

// Receber pacotes
connection.on('receive', (packet) => {
    console.log('Pacote recebido:', packet)
})
```

## 📝 Diferenças Importantes

### Antes (WebSocket)
- Precisava de proxy WebSocket no servidor
- Limitações de compatibilidade
- Overhead do protocolo WebSocket

### Depois (Tauri TCP)
- ✅ Conexão TCP direta
- ✅ Compatível com qualquer OTServ
- ✅ Performance nativa
- ✅ Suporte completo a dados binários

## 🐛 Troubleshooting

### "Rust não encontrado"
Instale Rust: https://rustup.rs/

### "Erro ao compilar"
Certifique-se de ter o Visual Studio Build Tools instalado (Windows):
```bash
# Baixe de:
# https://visualstudio.microsoft.com/downloads/
# Selecione "Desktop development with C++"
```

### "Porta já em uso"
O Vite usa a porta 5173 por padrão. Se estiver em uso, ele escolherá outra automaticamente.

### "Não consegue conectar ao servidor"
- Verifique se o servidor OT está rodando
- Confirme host e porta corretos
- Verifique firewall

## 📚 Arquivos Importantes

- `src-tauri/src/main.rs` - Backend Rust com lógica TCP
- `src/services/protocol/connection.js` - Wrapper JavaScript
- `src/services/protocol/connection-example.js` - Exemplos de uso
- `TAURI_MIGRATION.md` - Documentação completa

## 🎯 Próximas Melhorias Sugeridas

1. Adicionar sistema de reconnect automático
2. Implementar buffer de pacotes
3. Adicionar criptografia (se necessário)
4. Implementar timeout configurável
5. Adicionar métricas de conexão (latência, etc)

## ❓ Dúvidas?

Consulte:
- `TAURI_MIGRATION.md` - Documentação detalhada
- `connection-example.js` - Exemplos práticos
- [Documentação Tauri](https://tauri.app/)
