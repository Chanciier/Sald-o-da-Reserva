# Saldão da Reserva — Documentação Completa

## Visão Geral

E-commerce fullstack com painel administrativo, expedição, fiscal e logística. Monorepo Turborepo com API NestJS (Railway) e frontend Next.js (Vercel).

---

## Stack Técnica

| Camada     | Tecnologia                                           |
| ---------- | ---------------------------------------------------- |
| Monorepo   | Turborepo + npm workspaces                           |
| API        | NestJS 10, TypeScript, Node ≥ 20                     |
| Frontend   | Next.js 14 (App Router), TypeScript, Tailwind CSS    |
| Banco      | PostgreSQL via Prisma ORM 5                          |
| Cache      | Redis (carrinho, sessão)                             |
| Auth       | JWT (access 15 min + refresh 30 dias), bcrypt/argon2 |
| Pagamentos | Mercado Pago (PIX, Cartão, Boleto)                   |
| Frete      | Melhor Envio (cotação, etiqueta, rastreamento)       |
| Fiscal     | Focus NF-e (emissão, cancelamento, DANFE/XML)        |
| Storage    | AWS S3 + Sharp (resize automático)                   |
| Email      | Resend (transacional)                                |
| CAPTCHA    | Cloudflare Turnstile                                 |
| Deploy API | Railway                                              |
| Deploy Web | Vercel                                               |

---

## Banco de Dados — 23 Modelos

### Auth / Segurança

- **User** — email, CPF, role (ADMIN/VENDEDOR/CLIENTE), hash de senha
- **RefreshToken** — hash, expiração, IP, user-agent
- **PasswordReset** — token hash, expiração, usado
- **AuditLog** — ação, userId, IP, metadata JSON
- **UserConsent** — LGPD: tipo, versão documento, IP, timestamp

### Catálogo

- **Category** — nome, slug, NCM, exibir na home
- **Product** — SKU, código interno, marca, preços, peso, dimensões, estoque, NCM, origem, CFOP, CST/CSOSN, SEO, status (ACTIVE/INACTIVE/OUT_OF_STOCK/DRAFT/ARCHIVED)
- **Image** — S3 key/bucket/folder, dimensões, posição, vinculada a produto/categoria/usuário
- **Review** — nota (int), comentário, unique por produto+usuário

### Pedidos / Checkout

- **Order** — subtotal, desconto, frete, total, método entrega (SHIPPING/PICKUP), endereço JSON, código retirada, itens separados JSON, status (10 estados)
- **OrderItem** — nome, SKU, preço, quantidade, subtotal (snapshot)
- **Coupon** — PERCENT ou FIXED, valor mínimo, limite uso, validade
- **Payment** — PIX QR/base64/expiração, boleto URL/código/expiração, cartão brand/últimos 4, parcelas, log de status
- **PaymentLog** — evento, status, rawData JSON

### Logística

- **Shipment** — meOrderId, carrier, service, trackingCode, labelUrl, prazo, rawQuote JSON, status (6 estados)
- **ShipmentEvent** — evento, localização, rawData — rastreamento histórico

### Devoluções / Conteúdo

- **ReturnRequest** — motivo (REGRET/DEFECT/WRONG_ITEM/OTHER), etiqueta ME, reembolso MP, status (5 estados)
- **Invoice** — focusReference, número NF-e, chave de acesso, protocolo, xmlUrl, danfeUrl, status (5 estados)
- **LegalPage** — slug, conteúdo, publicado, versão
- **Faq** — categoria, posição, ativo

---

## API — 19 Módulos, 65+ Endpoints

### Autenticação (`/auth`)

- POST register, login, refresh, logout, logout-all
- POST forgot-password, reset-password
- GET me, users (ADMIN), users/:id, profile
- PATCH users/:id, me
- DELETE users/:id

### Catálogo

- **Produtos** — CRUD completo, bulk delete, upload de imagens (S3), ordenação
- **Categorias** — CRUD, imagem de capa, slug automático
- **Reviews** — criar, listar por produto, deletar (ADMIN)

### Carrinho (`/cart`)

- GET, POST (adicionar), PATCH (alterar quantidade), DELETE item/limpar
- Redis com TTL de 7 dias, anônimo ou autenticado

### Coupons (`/coupons`)

- CRUD (ADMIN/VENDEDOR), validação de código para checkout

### Shipping (`/shipping`)

- POST cotar frete (Melhor Envio API pública)
- GET rastrear encomenda por código
- GET serviços disponíveis

### Checkout (`/checkout`)

- POST criar pedido — valida estoque, aplica cupom, cria Payment+Shipment
- GET pedidos do usuário, detalhe pedido
- ADMIN: listar todos pedidos, filtros

### Pagamentos (`/payments`)

- POST iniciar (PIX/Cartão/Boleto via MP SDK)
- GET status, detalhes
- Idempotency key para evitar duplicatas

### Mercado Pago (`/webhooks/mercadopago`)

- POST webhook — valida assinatura HMAC, processa notificações de pagamento
- Atualiza PaymentStatus + PaymentLog automaticamente

### Expedição (`/expedicao`)

- GET fila (pedidos PAID), separação, conferência, prontos, enviados, concluídos
- POST marcar separando, separado, conferido, pronto
- POST confirmar retirada (pickup code) — emite NF-e
- POST marcar enviado, entregue
- POST cancelar pedido — tenta reembolso MP, restaura estoque, cancela NF-e

### Notas Fiscais (`/invoices`)

- POST emitir NF-e (Focus NF-e API)
- POST cancelar NF-e
- GET listar, detalhe, XML, DANFE (PDF via stream/blob)
- Webhook Focus para atualização de status

### Devoluções (`/returns`)

- POST solicitar devolução (cliente)
- GET listar (cliente + admin)
- PATCH aprovar/rejeitar/completar (ADMIN)
- Gera etiqueta de retorno via Melhor Envio

### Analytics (`/analytics`)

- GET dashboard — receita, pedidos, produtos mais vendidos
- GET relatórios de clientes, vendas, produtos

### Conteúdo (`/content`)

- CRUD LegalPage (slug, título, conteúdo, publicado)
- CRUD FAQ (categoria, posição)

### Storage (`/storage`)

- POST upload imagem → S3 com resize Sharp
- DELETE imagem

### Mail (`/mail`)

- Serviço interno — confirmação de pedido, reset de senha, notificações

---

## Frontend — 76 Rotas

### Público (sem login)

| Rota                   | Descrição            |
| ---------------------- | -------------------- |
| `/`                    | Landing page / home  |
| `/produtos`            | Catálogo com filtros |
| `/produtos/[slug]`     | Página do produto    |
| `/categorias`          | Lista categorias     |
| `/login`               | Login                |
| `/minha-conta`         | Registro/perfil      |
| `/esqueci-senha`       | Recuperar senha      |
| `/auth/reset-password` | Redefinir senha      |
| `/sobre`               | Sobre a loja         |
| `/faq`                 | Perguntas frequentes |
| `/contato`             | Contato              |
| `/entregas`            | Política de entregas |
| `/trocas-e-devolucoes` | Política de trocas   |
| `/termos-de-uso`       | Termos               |
| `/privacidade`         | Privacidade (LGPD)   |
| `/cookies`             | Cookies              |

### Cliente (autenticado)

| Rota                    | Descrição                             |
| ----------------------- | ------------------------------------- |
| `/carrinho`             | Carrinho de compras                   |
| `/checkout`             | Finalizar pedido                      |
| `/pagamento/[orderId]`  | Tela de pagamento (PIX/Cartão/Boleto) |
| `/pedidos`              | Lista de pedidos                      |
| `/pedidos/[id]`         | Detalhe do pedido                     |
| `/cliente`              | Dashboard do cliente                  |
| `/cliente/perfil`       | Editar perfil                         |
| `/cliente/enderecos`    | Gerenciar endereços                   |
| `/cliente/pagamentos`   | Histórico de pagamentos               |
| `/cliente/rastreamento` | Rastrear encomendas                   |

### Admin

| Rota                                            | Descrição              |
| ----------------------------------------------- | ---------------------- |
| `/admin`                                        | Dashboard geral        |
| `/admin/pedidos`                                | Todos os pedidos       |
| `/admin/produtos`                               | Gerenciar produtos     |
| `/admin/produtos/novo`                          | Novo produto           |
| `/admin/produtos/[id]`                          | Editar produto         |
| `/admin/categorias`                             | Gerenciar categorias   |
| `/admin/cupons`                                 | Gerenciar cupons       |
| `/admin/usuarios`                               | Gerenciar usuários     |
| `/admin/estoque`                                | Controle de estoque    |
| `/admin/fretes`                                 | Configurações de frete |
| `/admin/expedicao`                              | Dashboard expedição    |
| `/admin/expedicao/fila`                         | Fila de pedidos pagos  |
| `/admin/expedicao/separacao`                    | Lista separação        |
| `/admin/expedicao/separacao/[id]`               | Conferir separação     |
| `/admin/expedicao/conferencia/[id]`             | Conferência de itens   |
| `/admin/expedicao/prontos`                      | Prontos para envio     |
| `/admin/expedicao/retirada`                     | Lista retirada         |
| `/admin/expedicao/retirada/[id]/etiqueta`       | Etiqueta de retirada   |
| `/admin/expedicao/enviados`                     | Enviados               |
| `/admin/expedicao/concluidos`                   | Concluídos             |
| `/admin/financeiro/pagamentos`                  | Painel financeiro      |
| `/admin/financeiro/notas-fiscais`               | Lista NF-e             |
| `/admin/financeiro/notas-fiscais/[id]`          | Detalhe NF-e           |
| `/admin/financeiro/notas-fiscais/[id]/imprimir` | Imprimir DANFE         |
| `/admin/devolucoes`                             | Devoluções             |
| `/admin/relatorios`                             | Relatórios gerais      |
| `/admin/relatorios/vendas`                      | Relatório de vendas    |
| `/admin/relatorios/clientes`                    | Relatório de clientes  |
| `/admin/relatorios/produtos`                    | Relatório de produtos  |
| `/admin/logs`                                   | Logs do sistema        |
| `/admin/logs/auditoria`                         | Logs de auditoria      |
| `/admin/conteudo/paginas`                       | Páginas legais         |
| `/admin/conteudo/paginas/[slug]`                | Editar página          |
| `/admin/conteudo/faq`                           | Gerenciar FAQ          |
| `/admin/configuracoes`                          | Configurações gerais   |

### Vendedor

| Rota                      | Descrição          |
| ------------------------- | ------------------ |
| `/vendedor`               | Dashboard vendedor |
| `/vendedor/produtos`      | Meus produtos      |
| `/vendedor/produtos/novo` | Novo produto       |
| `/vendedor/produtos/[id]` | Editar produto     |
| `/vendedor/estoque`       | Estoque            |
| `/vendedor/fretes`        | Fretes             |
| `/vendedor/relatorios`    | Relatórios         |
| `/vendedor/notas-fiscais` | NF-e               |
| `/vendedor/perfil`        | Perfil vendedor    |

---

## Integrações Externas

### Mercado Pago

- PIX com QR code + base64 + expiração configurável
- Cartão de crédito/débito com tokenização
- Boleto bancário com URL e código de barras
- Webhook com validação de assinatura HMAC-SHA256
- Reembolso automático na cancelamento (exceto BOLETO)
- Idempotency key para evitar cobranças duplicadas

### Melhor Envio

- Cotação de frete em tempo real (peso, dimensões, CEP)
- Compra de etiqueta após pedido confirmado
- Rastreamento com eventos históricos
- Etiqueta de devolução para ReturnRequest aprovado

### Focus NF-e

- Emissão automática ao marcar pronto/confirmar retirada
- Cancelamento de NF-e ao cancelar pedido
- Campos: destinatário, itens com NCM/CFOP/CST, transportadora opcional
- Download DANFE (PDF) via stream
- Download XML
- Webhook de status (autorizada, rejeitada, cancelada)

### AWS S3

- Upload de imagens de produto e categoria
- Resize automático via Sharp (múltiplas resoluções)
- Deleção de imagem do bucket ao remover registro

### Resend

- Email transacional: confirmação de pedido, reset de senha
- Suporte a templates HTML

### Cloudflare Turnstile

- CAPTCHA no registro e login
- Bypass via `TURNSTILE_SECRET_KEY=skip` (apenas dev)

---

## Fluxo de Compra (16 Etapas)

1. Cliente adiciona produto ao carrinho (Redis)
2. Aplica cupom (opcional)
3. Informa CEP → cotação Melhor Envio
4. Escolhe método de entrega (SHIPPING ou PICKUP)
5. Preenche endereço (SHIPPING) ou retira na loja (PICKUP)
6. POST `/checkout` → cria Order + Payment + Shipment
7. POST `/payments` → inicia pagamento no MP
8. Webhook MP → atualiza PaymentStatus → Order passa para PAID
9. Admin vê fila em `/admin/expedicao/fila`
10. Admin inicia separação → SEPARATING
11. Admin confirma itens → SEPARATED
12. Admin confere → READY_TO_SHIP → emite etiqueta ME + NF-e
13. Envio: admin marca SHIPPED com código de rastreio
14. Cliente rastreia em `/cliente/rastreamento`
15. Entrega confirmada → DELIVERED
16. Cancelamento: reembolso MP + restaura estoque + cancela NF-e

---

## Segurança

- RBAC com 3 roles: ADMIN, VENDEDOR, CLIENTE
- JWT access (15min) + refresh (30d) com rotação
- Tokens de refresh com hash, IP e user-agent registrados
- Rate limiting global na API
- Cloudflare Turnstile no registro/login
- HMAC-SHA256 em webhooks MP
- Logs de auditoria para todas ações sensíveis
- LGPD: UserConsent para aceite de termos/privacidade

---

## Variáveis de Ambiente Requeridas

### API (Railway)

```
DATABASE_URL
REDIS_URL
JWT_SECRET
JWT_REFRESH_SECRET
FRONTEND_URL

AWS_ACCESS_KEY_ID
AWS_SECRET_ACCESS_KEY
AWS_S3_BUCKET
AWS_S3_REGION

MERCADO_PAGO_ACCESS_TOKEN
MERCADO_PAGO_PUBLIC_KEY
MERCADO_PAGO_WEBHOOK_SECRET

MELHOR_ENVIO_TOKEN
MELHOR_ENVIO_SANDBOX=false

FOCUS_NFE_TOKEN
FOCUS_NFE_ENVIRONMENT=production
FOCUS_NFE_CNPJ
FOCUS_NFE_IE

RESEND_API_KEY
MAIL_FROM

TURNSTILE_SECRET_KEY
```

### Web (Vercel)

```
NEXT_PUBLIC_API_URL
NEXT_PUBLIC_MP_PUBLIC_KEY
NEXT_PUBLIC_TURNSTILE_SITE_KEY
```

---

## O Que Foi Construído

**Autenticação completa**: registro, login, refresh token, logout global, recuperação de senha por email, consentimento LGPD, auditoria.

**Catálogo**: produtos com variantes fiscais (NCM/CFOP/CST), SEO, múltiplas imagens S3, categorias hierárquicas, reviews de clientes, sistema de estoque com alertas de mínimo.

**Carrinho e Checkout**: carrinho Redis persistente (anônimo + autenticado), cupons (% ou fixo), cotação de frete em tempo real, endereço de entrega ou retirada em loja com código único.

**Pagamentos**: integração completa Mercado Pago — PIX com QR code, cartão crédito/débito, boleto bancário, webhook com validação de assinatura, reembolso automático no cancelamento, idempotência.

**Expedição**: pipeline de 6 etapas (fila → separação → conferência → pronto → enviado → entregue), compra de etiqueta Melhor Envio, emissão automática de NF-e ao marcar pronto.

**Fiscal (NF-e)**: emissão via Focus NF-e com todos os campos obrigatórios, cancelamento, download DANFE (PDF) e XML, webhook de status.

**Logística**: rastreamento com eventos históricos Melhor Envio, visível para o cliente.

**Devoluções**: solicitação pelo cliente, aprovação/rejeição pelo admin, geração de etiqueta de retorno ME, registro de reembolso.

**Painel Admin**: dashboard com métricas, relatórios de vendas/clientes/produtos, gerenciamento de usuários, logs de auditoria, configurações de conteúdo (FAQ, páginas legais).

**Segurança**: RBAC, rate limiting, CAPTCHA Turnstile, HMAC em webhooks, tokens com hash, auditoria completa.
