# Print Center

Consumidor de eventos que prepara documentos de impressão quando um pedido é
pago — etiqueta interna de retirada, ou a etiqueta oficial do Melhor Envio —
e os enfileira para um computador da loja (Print Agent) buscar e imprimir.

**Nunca altera pagamento, frete, NF-e, checkout ou o próprio pedido.** Só lê
esses dados e reage a dois eventos já existentes no barramento interno
(`OmsEvents`): `order.paid` e `order.cancelled`.

Este documento cobre o que foi implementado nesta etapa: fila, tabelas,
painel admin e a API que o Print Agent consome. **O Print Agent em si
(software Tauri rodando no PC da loja, que fala com a impressora) já foi
construído** — ver [apps/print-agent](../apps/print-agent/README.md).

## Arquitetura

```
order.paid (EventBusService)
        │
        ▼
PrintCenterService (apps/api/src/print-center/print-center.service.ts)
        │
   ┌────┴─────┐
   │           │
PICKUP      SHIPPING
   │           │
   ▼           ▼
PickupLabelService   cria PrintJob PENDING
(gera PNG:           + enfileira watch job
 QR + sharp)          (QueueService)
   │                       │
   ▼                       ▼
PrintJob READY        ShippingPrintService.watch
(documentUrl no S3)   (polling em Shipment.labelUrl
                        até aparecer, ou FAILED após
                        60 tentativas)
                            │
                            ▼
                       PrintJob READY
                       (documentUrl = Shipment.labelUrl)
```

A partir daí, o Print Agent consome
`GET /print-agent/jobs` e reporta o progresso via
`POST /print-agent/jobs/:id/claim` → `PATCH /print-agent/jobs/:id/status`.

### Por que polling e não um webhook para a etiqueta de envio?

`ShippingService.purchaseLabel` (Melhor Envio) roda de forma síncrona,
fire-and-forget, dentro de `webhooks.service.ts` — arquivo que este módulo
nunca deveria tocar. Em vez de adicionar uma linha de `events.emit(...)` ali,
`ShippingPrintService` observa `Shipment.labelUrl` via um job da fila
(`QueueService`, que já roda a cada 2s) até o valor aparecer. Zero linha
alterada em `shipping/` ou `webhooks/`.

### Por que a etiqueta de retirada não usa `pickupCode`?

`pickupCode` só é atribuído quando a separação começa
(`ExpedicaoService.iniciarSeparacao`), não no momento do pagamento. A
etiqueta gerada em `order.paid` é uma etiqueta de **separação/embalagem**
(nº do pedido, nome, telefone, itens/SKU, data, "RETIRADA"), com QR
apontando para `/admin/print-center/pickup/:orderId` — uma página nova que só
lê o pedido (`GET /orders/:id`, já existente) e chama
`PATCH /expedicao/:id/confirmar-retirada` (também já existente, nunca
reescrito). Esse botão só terá sucesso quando o pedido já estiver
`SEPARATED`/`READY_TO_SHIP` — comportamento existente do módulo de
Expedição, não um bug do Print Center.

## Banco de dados

Duas tabelas novas, nenhuma alterada (só um campo de relação reversa
`Order.printJobs` foi adicionado ao model `Order`, sem mudar nenhuma coluna):

- **`print_jobs`**: `orderId`, `type` (`PICKUP`/`SHIPPING`), `status`
  (`PENDING → READY → SENT → PRINTING → PRINTED`, ou `FAILED` a qualquer
  momento), `copies`, `attempts`, `printerProfile`, `documentUrl`,
  `lastError`, `deviceId`. `@@unique([orderId, type])` garante que
  pagamento/webhook duplicado, ou reprocessamento, nunca gera uma segunda
  etiqueta para o mesmo pedido (a criação captura o erro `P2002` do Prisma e
  vira no-op — mesmo padrão já usado em `NotificationsService`).
- **`print_devices`**: `name`, `tokenHash` (SHA-256 do token; o valor em
  texto puro só existe na resposta de criação/regeneração), `online`,
  `lastSeen`, `pickupPrinter`, `shippingPrinter`, `revokedAt`.

Migration: `apps/api/prisma/migrations/20260717150216_add_print_center/`.

## Feature flags

Nenhuma tabela de flags — mesmo padrão do resto do projeto (ex.:
`CHECKOUT_SAVED_PROFILES_ENABLED`): variáveis de ambiente lidas via
`ConfigService.get(chave, 'false')`. Todas começam `false`:

| Variável               | Efeito quando `true`                                                                  |
| ---------------------- | ------------------------------------------------------------------------------------- |
| `PRINT_CENTER_ENABLED` | Chave geral — sem ela, os listeners de `order.paid`/`order.cancelled` não fazem nada. |
| `AUTO_PRINT_PICKUP`    | Gera a etiqueta interna automaticamente para pedidos `PICKUP` pagos.                  |
| `AUTO_PRINT_SHIPPING`  | Cria o job e observa a etiqueta do Melhor Envio para pedidos `SHIPPING` pagos.        |

Disparo manual (`POST /print-center/jobs/manual/:orderId`) ignora as três
flags — é uma ação explícita do admin, útil para pedidos antigos ou enquanto
as flags estão desligadas em produção.

## API

### Admin (`ADMIN`/`VENDEDOR`, JWT — guards existentes)

- `GET /print-center/jobs?status=&type=` — lista (o painel filtra
  fila/histórico/falhas no cliente a partir do mesmo endpoint).
- `GET /print-center/jobs/:id`
- `POST /print-center/jobs/:id/reprint` — volta o job para a fila (mantendo o
  documento já gerado, se houver) e grava um `AuditLog` (`print.reprint`).
- `POST /print-center/jobs/manual/:orderId` — cria manualmente, ignorando as
  flags.
- `GET/POST/PATCH /print-center/devices` (`ADMIN` apenas) — CRUD de
  dispositivos. `POST` e `POST /:id/regenerate-token` retornam o token em
  texto puro **uma única vez**.

### Print Agent (`X-Print-Device-Token`, nunca JWT/login admin)

- `GET /print-agent/jobs?status=READY&type=` — jobs disponíveis para puxar.
- `POST /print-agent/jobs/:id/claim` — `READY → SENT`.
- `PATCH /print-agent/jobs/:id/status` — `{status: PRINTING|PRINTED|FAILED, error?}`,
  valida a transição e que o job pertence ao device que está chamando.
- `POST /print-agent/heartbeat` — atualiza `online`/`lastSeen`.

## Painel admin

`/admin/print-center/{fila,historico,falhas,devices}` +
`/admin/print-center/pickup/:orderId` (alvo do QR da etiqueta de retirada).
Item de menu "Print Center" sempre visível para `VENDEDOR` (mesmo tratamento
do menu "Expedição"); a aba "Dispositivos" fica restrita a `ADMIN` no próprio
layout do módulo.

## Provisionando um dispositivo

1. Admin acessa **Print Center → Dispositivos** e cria um novo dispositivo
   (nome + impressoras opcionais). O token aparece **uma única vez** — copiar
   nesse momento.
2. O Print Agent guarda esse token e o envia no header
   `X-Print-Device-Token` em toda chamada a `/print-agent/*`.
3. Se o token vazar ou o computador for trocado, revogar em
   **Dispositivos → Revogar** e gerar um novo com **Novo token**.

## Escopo

Construído: módulo NestJS completo (`apps/api/src/print-center/`), tabelas,
fila de observação da etiqueta de envio, geração local da etiqueta de
retirada (QR + `sharp`, sem depender de API pública), API do Print Agent,
painel admin, testes, e o próprio Print Agent (app Tauri em
[apps/print-agent](../apps/print-agent/README.md)) que roda no PC da loja e
fala com a impressora.

**Ainda desligado em produção**: `PRINT_CENTER_ENABLED`, `AUTO_PRINT_PICKUP`
e `AUTO_PRINT_SHIPPING` continuam `false` por padrão — ver
[Feature flags](#feature-flags).
