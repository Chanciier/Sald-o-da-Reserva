# Instalação — Saldão Print Agent

## Requisitos

- Windows 10 ou 11.
- Uma impressora já instalada e configurada no Windows (retirada e/ou envio).
- Rede até a API do Saldão da Reserva (a mesma URL usada pelo painel admin).

## 1. Instalar

Você recebeu um dos dois instaladores:

- **`Saldão Print Agent_x.y.z_x64-setup.exe`** (NSIS) — instalador comum,
  duplo clique e seguir o assistente.
- **`Saldão Print Agent_x.y.z_x64_pt-BR.msi`** (MSI) — para instalação via
  política de grupo/gerenciamento centralizado.

Ambos instalam para todos os usuários da máquina. O app abre sozinho depois
de instalado.

## 2. Gerar o código de pareamento (no painel admin)

1. Entre no painel admin como **Administrador** →
   **Print Center → Dispositivos**.
2. Se o computador ainda não tem um dispositivo cadastrado, clique em
   **Novo dispositivo**, dê um nome que identifique o computador (ex.:
   "PDV Loja — Balcão 1") e, se já souber, preencha o nome exato das
   impressoras de retirada/envio (dá pra ajustar depois, nas Configurações
   do próprio app).
3. Clique em **Gerar código de pareamento** na linha desse dispositivo.
   Um código de 8 caracteres aparece na tela, **válido por 15 minutos e uso
   único** — copie-o.

## 3. Parear o app

Na primeira vez que o Saldão Print Agent abre, ele pede:

- **URL da API**: o endereço do backend (ex.: `https://api.saldaodareserva.com.br`).
- **Código temporário**: o código de 8 caracteres do passo anterior.

Clique em **Parear dispositivo**. Se der certo, o app já conecta sozinho e
mostra a tela principal com o status "Conectado".

Se o código expirar ou já tiver sido usado, gere um novo no painel admin e
tente de novo — não precisa reinstalar nada.

## 4. Configurar as impressoras

Na tela principal, clique em **Configurações**:

1. Escolha a **impressora de retirada** e a **impressora de envio** nas
   listas (todas as impressoras instaladas no Windows aparecem lá — se a
   impressora certa não aparecer, confirme que ela está instalada no
   Windows primeiro, fora do app).
2. Ajuste a **quantidade de cópias** por etiqueta, se necessário (padrão: 1).
3. Marque **Iniciar automaticamente com o Windows** se este computador é
   dedicado a imprimir (recomendado para um PDV/balcão).
4. **Salvar configurações**.

Use os botões **Testar retirada** / **Testar envio** na tela principal para
confirmar que cada impressora está respondendo antes de ativar em produção.

## 5. Deixe rodando

Fechar a janela (X) só a esconde — o agente continua rodando em segundo
plano na bandeja do Windows, recebendo e imprimindo os jobs. Para abrir de
novo, clique no ícone na bandeja; para encerrar de verdade, clique com o
botão direito no ícone da bandeja → **Sair**.

## Ativando no backend

O Print Center só começa a mandar etiquetas de verdade quando as flags
`PRINT_CENTER_ENABLED`, `AUTO_PRINT_PICKUP` e/ou `AUTO_PRINT_SHIPPING`
estiverem ligadas no ambiente do backend (todas começam desligadas). Isso é
uma configuração do servidor, não do app — fale com quem administra o
backend.

## Problemas comuns

| Sintoma                                     | O que checar                                                                                                                         |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| "Código de pareamento inválido ou expirado" | Gere um novo código (o anterior só vale 15min e uma única vez).                                                                      |
| Status fica "Reconectando..."               | Confira a URL da API e a conexão de internet do computador.                                                                          |
| Etiqueta não sai na impressora              | Confirme o nome exato da impressora em Configurações e teste com "Testar retirada"/"Testar envio".                                   |
| Job aparece em "Falhas" no painel admin     | Veja a mensagem de erro ali — normalmente é impressora offline ou documento inválido; use "Reimprimir" no painel depois de resolver. |
