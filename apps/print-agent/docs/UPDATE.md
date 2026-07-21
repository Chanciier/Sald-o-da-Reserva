# Atualização — Saldão Print Agent

Esta versão **não tem atualização automática** (nenhum plugin de
auto-update foi configurado — ver observação no final). Atualizar é manual:

## Passo a passo

1. Baixe o instalador da nova versão (`.exe` ou `.msi`, mesma escolha da
   instalação original).
2. Feche o Saldão Print Agent: clique com o botão direito no ícone da
   bandeja → **Sair** (fechar só a janela não encerra o processo).
3. Rode o novo instalador — ele substitui a versão anterior no mesmo local
   de instalação (identificador `com.saldaodareserva.printagent`).
4. Abra o app normalmente.

## O que é preservado na atualização

- O **pareamento** (token no Windows Credential Manager) — não precisa
  gerar um código novo nem parear de novo.
- As **configurações** (impressoras, cópias, iniciar com Windows) —
  guardadas separadamente do instalador, na pasta de dados do app
  (`%APPDATA%/com.saldaodareserva.printagent`).
- O **histórico** de impressões recentes.

## O que NÃO é preservado

- Nada — a atualização é aditiva, não apaga nada. Se precisar resetar o
  pareamento (ex.: reaproveitar o computador para outra loja), veja abaixo.

## Repareando um computador (opcional)

Não há hoje um botão "esquecer dispositivo" no app. Para reparear do zero:

1. No painel admin, revogue o dispositivo antigo em
   **Print Center → Dispositivos → Revogar**.
2. No computador, remova a credencial salva: abra o **Gerenciador de
   Credenciais** do Windows (`Painel de Controle → Contas de Usuário →
Gerenciador de Credenciais → Credenciais do Windows`) e remova a entrada
   `SaldaoPrintAgent`.
3. Abra o app — ele volta pra tela de primeiro acesso.
4. Gere um novo dispositivo/código no painel admin e pareie normalmente.

## Nota sobre atualização automática

Um mecanismo de auto-update (baixar e aplicar a atualização sozinho) pode
ser adicionado depois com o `tauri-plugin-updater` oficial — isso exige
gerar uma chave de assinatura e publicar um endpoint/manifesto de versões,
o que ficou fora do escopo desta primeira versão. Peça para adicionar se
fizer sentido para o volume de instalações.
