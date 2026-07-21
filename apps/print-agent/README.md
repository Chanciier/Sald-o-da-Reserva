# Saldão Print Agent

App desktop (Windows, Tauri 2) que roda no computador da loja, conecta no
[Print Center](../../docs/print-center.md) do backend e imprime as etiquetas
automaticamente — sem nunca falar com Mercado Pago, Melhor Envio ou qualquer
outra parte do sistema além de `/print-agent/*`.

## O que ele faz

1. **Primeiro acesso**: você informa a URL da API e um código de pareamento
   de 8 caracteres (gerado em **Print Center → Dispositivos** no painel
   admin, válido por 15 minutos, uso único). O app troca esse código por um
   token permanente, guardado no **Windows Credential Manager** — nunca em
   disco em texto puro.
2. **Conexão**: WebSocket (`/print-agent/ws`) com reconexão automática
   (backoff de 1s a 30s) e heartbeat de aplicação a cada 25s.
3. **Job de retirada** (`PICKUP`): baixa o PNG gerado pelo Print Center,
   embrulha num PDF do tamanho físico exato da etiqueta (104x150mm) e
   imprime via **SumatraPDF** — o `rundll32 shimgvw.dll,ImageView_PrintTo`
   nativo do Windows foi abandonado porque ignorava o tamanho de papel do
   driver e sempre imprimia num template interno pequeno.
4. **Job de envio** (`SHIPPING`): baixa o PDF da etiqueta do Melhor Envio (o
   agente nunca fala com o Melhor Envio diretamente — só baixa o arquivo já
   pronto que o Print Center indicou) e imprime via **SumatraPDF**
   (bundlado, modo silencioso `-print-to -silent`).
5. Confirma sucesso/falha de volta pro backend
   (`PATCH /print-agent/jobs/:id/status`) — nunca altera pedido, pagamento
   ou frete.

## Arquitetura

Todo o estado e toda a lógica de rede/impressão vivem em **Rust**
(`src-tauri/`); o React (`src/`) é só a tela — não chama a API diretamente,
só invoca comandos Tauri e escuta o evento `state-changed`. Isso mantém a
superfície exposta ao WebView mínima (ver `capabilities/default.json`: só
`core:default`, nenhum plugin de fs/shell/http liberado pro JS).

```
src-tauri/src/
  state.rs        estado compartilhado + snapshot serializado pro front
  storage.rs       token no keyring; config (URL, impressoras, cópias) em JSON local
  api_client.rs     REST /print-agent/* (pair, jobs, claim, status)
  ws_client.rs      WebSocket: conecta, reconecta, heartbeat — sem depender do Tauri
  download.rs        baixa o documento com validação de assinatura (PNG/PDF)
  print/              PNG (retirada) e PDF (envio) convertidos e impressos via SumatraPDF, + etiqueta de teste
  processor.rs        claim → download → imprime → reporta, um job por vez
  runtime.rs          liga ws_client + processor, ponte de status pro AppState
  commands.rs         comandos invocados pelo front
  tray.rs             ícone de bandeja (fechar janela só esconde)
```

## Terceiros bundlados

- **SumatraPDF** (`src-tauri/resources/SumatraPDF.exe`) — leitor de PDF
  open-source, licença GPLv3, usado apenas para impressão silenciosa de PDF
  via linha de comando. Site oficial: sumatrapdfreader.org.

## Desenvolvimento

Pré-requisitos: Rust (`rustup`, toolchain `stable-x86_64-pc-windows-msvc`),
Node 20+, [WebView2](https://developer.microsoft.com/microsoft-edge/webview2/)
(já vem instalado no Windows 10/11 atualizados).

```bash
npm install
npm run tauri dev
```

Rodar os testes Rust:

```bash
cd src-tauri
cargo test
```

Ver [docs/INSTALL.md](docs/INSTALL.md) para o instalador e
[docs/UPDATE.md](docs/UPDATE.md) para atualizar uma instalação existente.
