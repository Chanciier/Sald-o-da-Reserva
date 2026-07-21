# Análise: Perfis de recebimento e endereços salvos no checkout

Status: **implementado e testado localmente (14/07/2026)** — schema, migration, backend, frontend, testes unitários/integração/E2E, todos verdes. Nada foi enviado para produção (sem push, sem deploy, sem migration aplicada em banco real).

---

## 1. Resumo do fluxo atual de checkout

`POST /checkout` ([checkout.controller.ts](../apps/api/src/checkout/checkout.controller.ts)) → `CheckoutService.createOrder` ([checkout.service.ts:66-257](../apps/api/src/checkout/checkout.service.ts)):

1. Cliente autenticado (`userId` do JWT) envia `CreateOrderDto` — endereço e destinatário são **sempre inline no body**, não há conceito de "perfil salvo" no backend hoje.
2. `deliveryMethod` (`SHIPPING` default | `PICKUP`) decide tudo:
   - `SHIPPING` → exige `shippingAddress` (validado por `ShippingAddressDto`) + `meServiceId`; recota frete no servidor; cria um `Shipment`.
   - `PICKUP` → `shippingAddress` gravado como `Prisma.JsonNull`; frete = 0; gera `pickupCode` sequencial (`A-0001`); não cria `Shipment`.
3. `customerPhone` é **sempre obrigatório** (10-11 dígitos), independente do método — é o canal de avisos de WhatsApp da expedição.
4. `cpf`, se enviado, **não vai para o `Order`** — atualiza `User.cpf` (compartilhado entre todos os pedidos do usuário, mutável).
5. Pedido criado → pagamento (`/payments/pix` ou `/payments/card`) → webhook do MP marca `Order.status = PAID` → emissão de NF-e é **manual** (admin, `POST /invoices/emit/:orderId`) → separação/expedição → envio ou retirada.
6. "Endereços salvos" **já existe no frontend, mas é derivado**: `apps/web/src/app/checkout/page.tsx:148-175` busca `GET /orders` e deduplica os JSONs `shippingAddress` de pedidos passados por `${cep}-${street}-${number}`. Não há tabela, não há nome/rótulo, não há edição/exclusão, é somente leitura best-effort client-side.

Isso já nos diz algo importante: **o pedido já é, na prática, o próprio "snapshot"** — `Order.shippingAddress` (Json), `Order.buyerName`, `Order.customerPhone` são cópias inline gravadas na criação, não referências. O padrão "gravar cópia no pedido" que o usuário pediu já é a convenção existente no repositório — não estamos introduzindo um conceito novo, estamos formalizando algo que já é implícito.

---

## 2. Contrato de dados atual — o que cada integração usa, campo a campo

### 2.1 Mercado Pago ([mercadopago.service.ts](../apps/api/src/mercadopago/mercadopago.service.ts), [payments.service.ts](../apps/api/src/payments/payments.service.ts))

| Campo enviado ao MP                        | Origem atual                                                                                                                          |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------- |
| `transaction_amount`                       | `Order.total`                                                                                                                         |
| `payer.email`                              | `order.user.email` (**live**, lido no momento do pagamento)                                                                           |
| `payer.first_name`/`last_name`             | `order.user.name ?? order.user.email` (**live**), split por espaço                                                                    |
| `payer.identification.number` (só cartão)  | `CreateCardPaymentDto.identificationNumber` — CPF **digitado de novo no formulário de cartão**, não vem do checkout nem de `User.cpf` |
| `external_reference` / `metadata.order_id` | `Order.id`                                                                                                                            |

**Nenhum campo de endereço é enviado ao MP.** Boleto tem colunas de schema (`boletoUrl` etc.) mas **não está implementado** — não enviar nada de boleto no contrato hoje.

Achado relevante: hoje já existem **dois CPFs desconectados** — o do checkout (`User.cpf`) e o do formulário de cartão (efêmero, por pagamento). Perfis salvos não devem tentar unificar isso sem você decidir explicitamente (ver seção 6).

### 2.2 Focus NF-e ([focusnfe.provider.ts](../apps/api/src/invoices/focusnfe.provider.ts), [invoice.service.ts](../apps/api/src/invoices/invoice.service.ts))

| Campo Focus NF-e                                                     | Origem atual                                                                                                        |
| -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `nome_destinatario`                                                  | `order.buyerName \|\| order.user.name \|\| order.user.email` (buyerName já é snapshot; fallback é **live**)         |
| `cpf_destinatario` (omitido se ausente)                              | `order.user.cpf` (**live** — não é o CPF de quando o pedido foi feito, é o CPF atual do usuário)                    |
| `email_destinatario`                                                 | `order.user.email` (**live**, nunca snapshotado)                                                                    |
| `logradouro/numero/complemento/bairro/municipio/uf/cep_destinatario` | `order.shippingAddress` (Json, já é snapshot); se ausente e for retirada, usa o endereço do **emitente** (fallback) |
| `presenca_comprador`                                                 | `1` se retirada, `2` se não                                                                                         |
| **Não existe** `telefone_destinatario` nem suporte a CNPJ do cliente | —                                                                                                                   |

Emissão é **manual pelo admin** (`POST /invoices/emit/:orderId`), inclusive reemissão. Não há checagem de CPF/CNPJ antes de enviar — erro só volta da SEFAZ.

**Risco já existente, independente da nossa mudança**: como `cpf_destinatario` e `email_destinatario` são lidos _live_ de `User` no momento da emissão (que pode ser dias depois da compra, e reemissão pode ser meses depois), se o cliente mudar o CPF/e-mail no perfil da conta, uma nota reemitida pode sair com dado diferente do que valeu na compra original. Isso já viola o princípio de imutabilidade que você quer garantir para o _novo_ recurso — vale corrigir junto (ver seção 6.3).

### 2.3 Frete — Melhor Envio ([shipping.service.ts](../apps/api/src/shipping/shipping.service.ts))

| Campo ME (`purchaseLabel`)                                          | Origem atual                                                                  |
| ------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| `to.name`                                                           | `order.shippingAddress.name`                                                  |
| `to.email`                                                          | `order.user.email` (live)                                                     |
| `to.phone`                                                          | `''` — **hardcoded vazio**, `Order.customerPhone` existe mas não é usado aqui |
| `to.document`                                                       | `order.user.cpf` (live), só se existir                                        |
| `to.address/complement/number/district/city/state_abbr/postal_code` | `order.shippingAddress.*` (já snapshot)                                       |

Cotação (`quote`) só usa CEP, nenhum dado de destinatário. Não há validação de completude do endereço em `purchaseLabel` — confia cegamente no JSON gravado na criação do pedido.

### 2.4 Retirada na loja ([checkout.service.ts](../apps/api/src/checkout/checkout.service.ts), [expedicao.service.ts](../apps/api/src/expedicao/expedicao.service.ts))

- Discriminador: `Order.deliveryMethod === PICKUP`.
- Não existe "quem vai retirar" separado do titular da conta — usa os mesmos `Order.buyerName`/`Order.customerPhone` do pedido.
- `Order.pickupCode` (único, sequencial `A-0001`) gerado na criação (ou como fallback em `iniciarSeparacao`).
- `confirmarRetirada` (staff) → `Order.status = DELIVERED`. `confirmarRetiradaCliente` (cliente, autoatendimento) → só grava `Order.clientConfirmedPickupAt`, **não** muda o status.
- Endereço nunca é solicitado para retirada (`shippingAddress` gravado `null`).

---

## 3. Contrato consolidado (o que NÃO pode mudar de forma)

Para qualquer novo fluxo de perfil/endereço salvo, o `Order` continua precisando destes campos, com estes tipos, populados no `createOrder`:

```
Order.deliveryMethod    DeliveryMethod   // SHIPPING | PICKUP
Order.shippingAddress   Json?            // shape ShippingAddressDto: { name, cep, street, number, complement?, neighborhood, city, state }
Order.shippingMethod    String
Order.buyerName         String?
Order.customerPhone     String           // sempre obrigatório, 10-11 dígitos
Order.pickupCode        String? @unique  // só PICKUP
User.cpf                String?          // efeito colateral: upsert quando dto.cpf enviado
```

Nenhuma integração (MP, Focus NF-e, Melhor Envio) pode passar a ler `RecipientProfile`/`SavedAddress` diretamente — todas continuam lendo exclusivamente de `Order`/`User` como já fazem hoje.

---

## 4. Modelagem proposta (aditiva)

### 4.1 Novas tabelas

```prisma
model RecipientProfile {
  id             String       @id @default(cuid())
  userId         String       @map("user_id")
  label          String       // "Adrian Luz", "Maria Souza"
  name           String
  documentType   DocumentType @default(CPF) @map("document_type")
  document       String       // somente dígitos
  phone          String?
  email          String?
  isDefault      Boolean      @default(false) @map("is_default")
  createdAt      DateTime     @default(now()) @map("created_at")
  updatedAt      DateTime     @updatedAt @map("updated_at")

  user      User           @relation(fields: [userId], references: [id], onDelete: Cascade)
  addresses SavedAddress[]

  @@index([userId])
  @@map("recipient_profiles")
}

enum DocumentType {
  CPF
  CNPJ
}

model SavedAddress {
  id                 String   @id @default(cuid())
  recipientProfileId String   @map("recipient_profile_id")
  label              String   // "Minha casa", "Trabalho", "Casa dos pais", "Outro"
  postalCode         String   @map("postal_code")
  street             String
  number             String
  complement         String?
  neighborhood       String
  city               String
  state              String   @db.Char(2)
  isDefault          Boolean  @default(false) @map("is_default")
  createdAt          DateTime @default(now()) @map("created_at")
  updatedAt          DateTime @updatedAt @map("updated_at")

  recipientProfile RecipientProfile @relation(fields: [recipientProfileId], references: [id], onDelete: Cascade)

  @@index([recipientProfileId])
  @@map("saved_addresses")
}
```

`User` ganha `recipientProfiles RecipientProfile[]` (relação inversa, não quebra nada existente) e, para o rollout gradual da feature flag, um campo aditivo:

```prisma
model User {
  // ...campos existentes inalterados...
  isBetaTester Boolean @default(false) @map("is_beta_tester")
}
```

(Não existe hoje um "papel de usuário de teste"; `Role` só tem `ADMIN|VENDEDOR|CLIENTE`. Em vez de mexer no enum `Role` — o que exigiria migração de todos os call-sites de autorização — proponho esse booleano isolado, só lido pelo gate da feature flag.)

### 4.2 Order — apenas colunas novas, nullable, sem tocar nas existentes

```prisma
model Order {
  // ...todos os campos existentes permanecem exatamente como estão...
  recipientProfileId String? @map("recipient_profile_id")   // rastreabilidade/UX apenas — nunca lido por integrações
  savedAddressId     String? @map("saved_address_id")       // idem
  recipientDocument     String? @map("recipient_document")      // snapshot do CPF/CNPJ usado NESTE pedido
  recipientDocumentType DocumentType? @map("recipient_document_type")
  recipientEmail        String? @map("recipient_email")         // snapshot do e-mail usado NESTE pedido

  recipientProfile RecipientProfile? @relation(fields: [recipientProfileId], references: [id], onDelete: SetNull)
  savedAddress     SavedAddress?     @relation(fields: [savedAddressId], references: [id], onDelete: SetNull)
}
```

`onDelete: SetNull` garante que apagar um perfil/endereço nunca apaga ou invalida o pedido — só perde o "link de conveniência" de volta.

`recipientDocument`/`recipientDocumentType`/`recipientEmail` fecham a lacuna descrita em 2.2/2.4: hoje Focus NF-e e Melhor Envio leem `order.user.cpf`/`order.user.email` _ao vivo_. Passamos a **preferir o snapshot do pedido quando presente, com fallback para o comportamento atual** (`order.recipientDocument ?? order.user.cpf`) — isso é retrocompatível com todo pedido antigo (`recipientDocument` será `null` neles) e resolve o requisito "alterações futuras em um perfil não modificam pedidos antigos/NF-e emitidas" de forma real, não só para o novo fluxo.

### 4.3 Por que não criar `CheckoutIdentitySnapshot`/`CheckoutAddressSnapshot` como tabelas

Você sugeriu essas duas entidades como "camada normalizadora" (com "por exemplo" — li como ilustrativo, não obrigatório no nome/formato). Considerando que o padrão já existente no projeto é o `Order` guardar sua própria cópia inline (JSON para endereço, colunas soltas para nome/telefone) — e não uma tabela satélite de snapshot — recomendo implementar a "normalização" como **código, não como tabela nova**:

```
apps/api/src/checkout/recipient/checkout-identity.normalizer.ts
  normalizeIdentity(input: RecipientProfile | RawRecipientInput): CheckoutIdentitySnapshot
  normalizeAddress(input: SavedAddress | RawAddressInput): CheckoutAddressSnapshot
```

`CheckoutIdentitySnapshot`/`CheckoutAddressSnapshot` continuam existindo — como **tipos TypeScript** (`interface`), não `model` Prisma — representando exatamente o shape que `Order` já aceita hoje (`ShippingAddressDto`-compatível + `buyerName`/`customerPhone`/`recipientDocument`/`recipientEmail`). O normalizador roda **antes** de `tx.order.create`, dentro da mesma transação, e o resultado é gravado direto nas colunas do `Order` descritas em 4.2 — nenhuma tabela nova entra no caminho de leitura das integrações.

Vantagem: zero tabelas extras para join, zero risco de inconsistência entre uma tabela de snapshot e o próprio `Order`, e é literalmente o mesmo padrão que `buyerName`/`shippingAddress` já usam. Se você preferir a snapshot como tabela de verdade (auditoria mais explícita, histórico separado do Order), é possível — mas seria uma tabela adicional só de log, nunca fonte de leitura para MP/NFe/frete. **Quero sua confirmação sobre este ponto antes de gerar a migration**, é a única divergência real do seu texto original.

---

## 5. Fluxo obrigatório (como pedido)

```
Perfil selecionado (RecipientProfile + SavedAddress | dados novos digitados)
   │
   ▼
normalizeIdentity() / normalizeAddress()   ← valida formato (CPF, CEP, etc.), NÃO toca no banco
   │
   ▼
CheckoutIdentitySnapshot + CheckoutAddressSnapshot (em memória)
   │
   ▼
tx.order.create({ ...campos existentes, shippingAddress, buyerName, customerPhone,
                   recipientDocument, recipientDocumentType, recipientEmail,
                   recipientProfileId?, savedAddressId? })
   │
   ▼
Pagamento (MP) / Frete (ME) / NF-e (Focus) — todos continuam lendo SOMENTE de `Order`/`User`,
com fallback order.recipientDocument ?? order.user.cpf (idem email/phone)
```

Editar um `RecipientProfile`/`SavedAddress` depois nunca reprocessa pedidos existentes — eles já têm os campos gravados.

---

## 6. Checkout de entrega e retirada (UX) — mapeado para o backend atual

- **Etapa "quem irá receber"** → resolve para um `RecipientProfile` (existente ou novo) → popula `buyerName`, `customerPhone`, `recipientDocument(Type)`, `recipientEmail`.
- **Etapa "onde será entregue"** → resolve para um `SavedAddress` (existente, novo, ou edição pontual) → popula `shippingAddress` (mesmo shape do `ShippingAddressDto` de hoje).
- **Retirada** → só a etapa "quem irá receber" roda; `shippingAddress` continua `Prisma.JsonNull`, `pickupCode` gerado como hoje. Nenhuma etapa de endereço aparece.
- **Primeira compra** → após `createOrder` com sucesso, endpoint novo opcional `POST /recipient-profiles` (a partir dos dados que acabaram de ser usados) — nunca automático, sempre com confirmação explícita do cliente (checkbox "salvar para próximas compras" + campo de rótulo do endereço).
- **Sugestão de dados existentes da conta** (`User.name`/`cpf`/`phone`) só aparece como pré-preenchimento de um formulário "criar perfil", nunca cria `RecipientProfile` sozinho.

---

## 7. Plano de migração (aditivo, retrocompatível)

1. Migration única `NNNNNNNNNNNNNN_add_recipient_profiles`:
   - `CREATE TYPE "DocumentType"` (novo enum)
   - `CREATE TABLE recipient_profiles`, `CREATE TABLE saved_addresses` (com FKs e índices)
   - `ALTER TABLE users ADD COLUMN is_beta_tester boolean NOT NULL DEFAULT false`
   - `ALTER TABLE orders ADD COLUMN recipient_profile_id text NULL`, `saved_address_id text NULL`, `recipient_document text NULL`, `recipient_document_type "DocumentType" NULL`, `recipient_email text NULL` + FKs `ON DELETE SET NULL`
   - Nenhum `DROP`, `RENAME` ou mudança de tipo em coluna existente.
2. `npx prisma generate` (client) — sem downtime, é só codegen.
3. Deploy do backend com `CHECKOUT_SAVED_PROFILES_ENABLED=false` — todo o código novo existe mas nenhuma rota nova é exposta/nenhum comportamento muda (`createOrder` continua idêntico ao atual quando a flag está off: sem perfil selecionado, sem `recipientProfileId`, snapshot preenchido a partir do próprio DTO inline como hoje).
4. Deploy do frontend com a UI de perfis escondida atrás da mesma flag (via endpoint `GET /config/features` ou similar já usado no projeto, a confirmar).
5. Ativação gradual: dev → admins (`role=ADMIN`) → beta (`isBetaTester=true`) → todos.

---

## 8. Feature flag

```
CHECKOUT_SAVED_PROFILES_ENABLED=false   # padrão: desligada em qualquer ambiente
```

Valores suportados (seguindo o padrão já usado por `CARD_PAYMENTS_ENABLED` no projeto, que é um simples `'true'|'false'` — aqui precisamos de estágios, então proponho string enumerada):

| Valor             | Quem vê a feature                                                                                                                                |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `false` (default) | ninguém — comportamento 100% atual                                                                                                               |
| `dev`             | qualquer usuário, mas só quando `NODE_ENV !== 'production'` (proteção extra: mesmo se alguém setar `dev` em prod por engano, cai para "ninguém") |
| `admins`          | `user.role === 'ADMIN'`                                                                                                                          |
| `beta`            | `ADMIN` + `user.isBetaTester === true`                                                                                                           |
| `all`             | todo mundo                                                                                                                                       |

Helper único, ex. `apps/api/src/config/checkout-saved-profiles.flag.ts`, usado tanto no backend (para expor/ocultar os novos endpoints) quanto num endpoint leve `GET /checkout/feature-flags` que o frontend consulta para decidir se mostra a nova UI.

---

## 9. Plano de testes obrigatórios

**Unitários** (`checkout.service.spec.ts`, Prisma mockado, seguindo o padrão já usado no arquivo existente):

- Fluxo antigo intacto: checkout sem perfil (SHIPPING e PICKUP), com/sem CPF, com/sem cupom.
- Novo: criar perfil, criar endereço, checkout usando perfil próprio, checkout usando "outros perfis salvos" (terceiro), retirada por titular, retirada por terceiro.
- Validações: CPF inválido, endereço incompleto, perfil de outro usuário (404 genérico, mesmo padrão de `confirmarRetiradaCliente`), edição de perfil após pedido criado (pedido antigo não muda).
- `recipientDocument ?? user.cpf` fallback (unit test isolado no normalizador).

**Integração** (supertest contra API + Postgres de teste):

- `POST /recipient-profiles`, `POST /recipient-profiles/:id/addresses`, `GET /recipient-profiles` (isolamento por `userId`).
- `POST /checkout` com `recipientProfileId`/`savedAddressId` gera `Order` com os mesmos campos que o fluxo inline geraria (comparação campo a campo).
- Feature flag off → endpoints novos retornam 404/403, `POST /checkout` inline continua funcionando sem nenhuma referência a perfil.

**E2E** (fluxo completo, provavelmente Playwright dado o resto do stack Next.js):

- PIX e Cartão de ponta a ponta (fluxo antigo, sem perfil).
- Fluxo novo completo: primeira compra → oferecer salvar → segunda compra reaproveitando perfil/endereço → NF-e emitida reflete os dados do momento da primeira compra mesmo após editar o perfil depois.
- Retirada com perfil (titular e terceiro).

**Validação explícita de payload** (o pedido mais crítico do usuário): escrever um teste que serializa os payloads reais enviados a MP (`mercadopago.service.ts`), Focus NF-e (`focusnfe.provider.ts`) e Melhor Envio (`shipping.service.ts`) para (a) um pedido criado pelo fluxo antigo e (b) um pedido equivalente criado via perfil salvo, e faz `expect(payloadNovo).toEqual(payloadAntigo)` campo a campo (exceto IDs/timestamps). Isso é o teste de regressão de contrato pedido explicitamente.

---

## 10. Checklist de homologação

Legenda: ✅ verificado localmente nesta entrega (14/07/2026, Postgres/Redis do
`docker-compose` local, API + Web rodando com `npm run start:dev`/`next dev`) ·
⬜ ainda depende de staging/produção real (nenhuma ação foi feita em ambiente
compartilhado).

- [x] ✅ Migration aditiva revisada linha a linha antes de aplicar — só `CREATE TYPE`/`ADD COLUMN`/`CREATE TABLE`/`CREATE INDEX`/`ADD CONSTRAINT (FK SET NULL)`, sem `DROP`/`RENAME`/mudança de tipo. Aplicada com sucesso no Postgres local (`prisma migrate dev`), `prisma migrate status` limpo depois.
- [ ] ⬜ Aplicar a mesma migration em staging com `prisma migrate deploy` (aditiva, mesmo arquivo — sem alterações necessárias)
- [x] ✅ Com a flag `false` (padrão): suíte de testes unitários (190 testes) confere que `createOrder` grava exatamente os mesmos campos de hoje quando `recipientProfileId`/`savedAddressId` não são enviados; checkout manual no browser (registro → carrinho → checkout PICKUP) idêntico ao fluxo atual, sem nenhuma seção nova visível.
- [x] ✅ Com a flag `all`/`dev` (equivalente a `admins` para o propósito do teste): perfil "Eu mesmo" criado e reutilizado com sucesso via browser real (Chrome headless) e via E2E HTTP — `Order.recipientProfileId`/`recipientDocument`/`recipientDocumentType` gravados corretamente na segunda compra.
- [x] ✅ Editar o perfil depois do pedido → pedido antigo mantém `buyerName`/`recipientDocument` originais (confirmado no E2E: `PATCH /recipient-profiles/:id` muda o nome, `GET /orders/:id` do pedido anterior continua com o nome antigo).
- [ ] ⬜ Retirada por terceiro com endereço de entrega real (frete Melhor Envio) — **não testável localmente**: o `MELHOR_ENVIO_TOKEN` do `.env` local está expirado (gotcha de ambiente já documentado, confirmado de novo agora via log `ShippingService: ME quote failed: 401`), então nenhuma cotação de frete funciona neste ambiente. O caminho de código (savedAddressId → snapshot → Shipment) está coberto por testes unitários com `ShippingService` mockado (`checkout.service.spec.ts`); falta validar com token real em staging.
- [x] ✅ Perfil de outro usuário → 404 genérico (confirmado no E2E: `GET /recipient-profiles/:id` e `POST /checkout` com `recipientProfileId` de outro usuário).
- [x] ✅ CPF inválido (`POST /recipient-profiles` com documento de 3 dígitos) → 400; endereço incompleto (`POST .../addresses` sem `city`) → 400. Confirmado no E2E.
- [x] ✅ Payload Focus NF-e e Melhor Envio: testes dedicados (`invoice.service.spec.ts`, `shipping.service.spec.ts`) comparam explicitamente pedido antigo (sem snapshot → cai no `order.user.cpf`/`email`, igual a hoje) vs. pedido novo (usa `recipientDocument`/`recipientEmail`) — mesmo formato de payload em ambos, só a origem do valor muda.
- [x] ✅ Payload Mercado Pago: **nenhuma linha de código de `mercadopago.service.ts`/`payments.service.ts` foi alterada** (confirmado via `git diff` vazio nesses diretórios) — contrato inalterado por construção, não por teste.
- [ ] ⬜ Rollback ponta a ponta em staging (flag → `false` + redeploy) — passo documentado na seção 11, não executado (não há staging neste momento).

**Achado de ambiente (não é bug):** o `.env` local tem `NODE_ENV=production` (espelha produção de propósito). Isso significa que o estágio `dev` da feature flag **nunca ativa neste ambiente local** — é o comportamento de segurança correto ("mesmo se `dev` for setado por engano em prod, ninguém vê a feature"), mas quem for testar localmente precisa usar `admins`, `beta` ou `all` em vez de `dev`.

**Testes automatizados desta entrega** (todos rodados localmente, nenhum contra produção):

- Unitários: 17 suites / 190 testes, 100% verde (`npm test` em `apps/api`) — inclui os 7 arquivos novos desta feature (`checkout-identity.normalizer.spec.ts`, `recipient-profiles.service.spec.ts`, `checkout-saved-profiles-flag.service.spec.ts`, `invoice.service.spec.ts`, `shipping.service.spec.ts`, mais os cenários novos em `checkout.service.spec.ts`).
- E2E: 5/5 verde (`npm run test:e2e` em `apps/api`, contra a API local rodando + Postgres/Redis do docker-compose) — cobre o fluxo de retirada citado acima.
- Type-check: `apps/api` e `apps/web` ambos limpos (`tsc --noEmit`).

---

## 11. Rollback

1. **Imediato / sem deploy**: `CHECKOUT_SAVED_PROFILES_ENABLED=false` no Railway + redeploy (lembrete: setar env var sozinho não basta, precisa `railway redeploy`, conforme já documentado para outras flags no projeto). Volta ao comportamento atual sem nenhuma perda de dado.
2. **Reverter só a interface nova**: revert do commit/branch do frontend; backend pode continuar deployado (endpoints novos ficam órfãos, mas inofensivos, protegidos pela flag).
3. **Reverter a migration**: como é 100% aditiva, um "rollback" nunca precisa apagar dado de pedidos — na pior hipótese, `DROP TABLE saved_addresses, recipient_profiles` + `ALTER TABLE orders DROP COLUMN recipient_profile_id, saved_address_id, recipient_document, recipient_document_type, recipient_email` + `DROP TYPE "DocumentType"`. Nenhuma dessas colunas é lida por MP/NFe/frete além do fallback opcional — reverter só faz esses fallbacks voltarem a usar exclusivamente `User.cpf`/`User.email`, exatamente como é hoje. Pedidos, pagamentos, notas e etiquetas continuam intactos porque nunca dependeram dessas tabelas.

---

## 12. Decisões tomadas na implementação

Você pediu para prosseguir direto para a implementação após a análise. Segui as
recomendações desta seção 12 tal como escritas, já que não houve objeção:

1. **Snapshot como código** (normalizador + colunas em `Order`, sem tabelas `CheckoutIdentitySnapshot`/`CheckoutAddressSnapshot` dedicadas) — implementado como planejado (seção 4.3): `CheckoutIdentityNormalizer` em [checkout-identity.normalizer.ts](../apps/api/src/checkout/recipient/checkout-identity.normalizer.ts).
2. **Lacuna de CPF/e-mail "ao vivo" fechada** — `Order.recipientDocument`/`recipientEmail` implementados; Focus NF-e e Melhor Envio agora preferem o snapshot do pedido, com fallback para `order.user.cpf`/`email` (comportamento idêntico ao anterior quando os campos são `null`, o que cobre 100% dos pedidos já existentes).
3. **`isBetaTester` como booleano em `User`** — implementado (`User.isBetaTester`, migration aditiva).
4. **Nenhum push, nenhuma migration em banco real, nenhum deploy** — confirmado: tudo rodou contra o Postgres/Redis local (`docker-compose`), nenhuma alteração em produção/Railway/GitHub.

Entregue: schema Prisma + migration, backend (`recipient-profiles`, normalizador,
feature flag, fallback em `invoice.service.ts`/`shipping.service.ts`), frontend
(fluxo de checkout com as duas etapas), testes unitários + E2E — ver seção 10.
