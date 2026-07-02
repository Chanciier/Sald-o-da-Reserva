# Funcionário Virtual — Arquitetura Técnica

> Documento de arquitetura. Nenhum código foi escrito ou alterado como parte deste documento — apenas leitura/investigação da base atual para ancorar as decisões abaixo na realidade do projeto.

## 1. Objetivo

Automatizar o cadastro de produtos do Saldão da Reserva de ponta a ponta: o operador fotografa o item e o sistema entrega um rascunho de produto pronto (título, descrição, categoria, NCM, preço sugerido) para revisão humana final. O operador deixa de digitar — passa a **aprovar ou corrigir**.

## 2. Estado Atual (Baseline) — o que já existe

Isto não é um projeto do zero. Já existe um protótipo funcional que cobre uma fatia real do fluxo pedido:

| Peça                   | Onde                                                                                    | O que faz hoje                                                                                                                                                                                                                         | Limitação                                                                                                                                                                                                                |
| ---------------------- | --------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Vision AI              | `apps/api/src/products/analyze-image.service.ts`                                        | Recebe **1 única URL de imagem**, chama Gemini (`2.5-flash` → `2.0-flash` → `1.5-flash` em cascata), extrai nome/termo de busca/condição/confiança em JSON                                                                             | Uma foto só; sem persistência do resultado; parsing do JSON via regex sobre o texto (frágil)                                                                                                                             |
| Pesquisa Mercado Livre | mesmo arquivo, `fetchMlPrices()`                                                        | Busca pública em `api.mercadolibre.com/sites/MLB/search`, calcula min/mediana/max de 20 anúncios                                                                                                                                       | Só ML; sem cache; sem uso do `MlCatalogService` (que já existe e faz predição de categoria)                                                                                                                              |
| Preço sugerido         | mesmo arquivo, `suggestPrice()`                                                         | Desconto sobre a mediana por condição (0.7/0.5/0.3) + arredondamento `,99`                                                                                                                                                             | Não considera custo de aquisição, frete ou taxa do Mercado Pago                                                                                                                                                          |
| Disparo                | `POST /products/analyze-image` (`ProductsController`)                                   | Chamada **síncrona**, uma imagem por vez, resultado não é salvo — só devolvido pro formulário                                                                                                                                          | Não é um pipeline; é uma chamada isolada                                                                                                                                                                                 |
| Anti-SSRF              | mesmo arquivo                                                                           | Valida URL pública, bloqueia IP privado/loopback/link-local/metadata antes de buscar a imagem                                                                                                                                          | Deve ser preservado e reaplicado a cada URL quando o Vision passar a aceitar múltiplas fotos                                                                                                                             |
| Fila                   | `apps/api/src/queue/queue.service.ts`                                                   | Fila leve sobre Redis (LIST/RPUSH), worker via `@Interval` a cada 2s, dead-letter automática. **Comentário no código já diz**: interface deliberadamente compatível com BullMQ para migração futura sem trocar produtores/consumidores | Roda no mesmo processo da API (sem worker dedicado)                                                                                                                                                                      |
| EventBus               | `apps/api/src/events/event-bus.service.ts`                                              | `EventEmitter` nativo do Node, handlers assíncronos isolados                                                                                                                                                                           | —                                                                                                                                                                                                                        |
| Cache                  | `apps/api/src/redis/redis.service.ts`                                                   | `getJson/setJson` com TTL, convenção de chave `{entidade}:{operação}:{param}`                                                                                                                                                          | —                                                                                                                                                                                                                        |
| Upload/Imagem          | `apps/api/src/storage/storage.service.ts`                                               | S3 + Sharp, resize 1920×1920 WebP q80, grava `Image` no Prisma                                                                                                                                                                         | —                                                                                                                                                                                                                        |
| Mercado Livre (OAuth)  | `apps/api/src/marketplace/providers/mercadolivre.provider.ts` + `ml-catalog.service.ts` | OAuth2 completo, `domain_discovery/search` (predição de categoria pelo título), import de pedidos                                                                                                                                      | Feito para publicar no Hub, não para pesquisa de concorrência (mas reaproveitável)                                                                                                                                       |
| Shopee                 | `apps/api/src/marketplace/providers/shopee.provider.ts`                                 | Estrutura de credenciais (HMAC-SHA256 + partner/shop id) pronta                                                                                                                                                                        | **Não implementado.** E os endpoints previstos (`/product/add_item`, `/update_item`...) são da API de **vendedor** (gerenciar o próprio catálogo) — não existe endpoint de busca de concorrência no Shopee Open Platform |
| Schema Product         | `prisma/schema.prisma`                                                                  | Já tem `ncm`, `gtin`, `condition`, `origem`, `cfop`, `cstCsosn`, `metaTitle`, `metaDescription`, `status: ProductStatus` (com valor **`DRAFT` já existente no enum!**)                                                                 | Não tem campo de **custo de aquisição**                                                                                                                                                                                  |
| NCM                    | `apps/api/src/invoices/focusnfe.provider.ts`                                            | Usa um NCM genérico fixo (`87141000`) quando o produto não tem um definido, na emissão fiscal                                                                                                                                          | Não existe tabela de referência de NCM no banco                                                                                                                                                                          |

**Achado colateral (fora do escopo deste documento, mas vale corrigir já):** o fallback `gemini-2.0-flash` foi **descontinuado em 01/06/2026** e `gemini-1.5-flash` não consta mais entre os modelos ativos do Google. O código atual ainda tenta os três em cascata — hoje, na prática, só `gemini-2.5-flash` responde; os outros dois só geram tentativas e log de erro antes de cair no "Produto não identificado". Recomendo corrigir isso independente da decisão sobre o Funcionário Virtual.

**Conclusão prática:** o Funcionário Virtual não é uma reescrita — é a evolução deste protótipo para (a) múltiplas fotos numa chamada só, (b) pipeline assíncrono em vez de 1 chamada síncrona, (c) separação de responsabilidades em módulos, (d) Shopee, NCM com base de referência e aprendizado contínuo, que hoje não existem.

## 3. Princípios de Design

1. **Assíncrono desde o upload.** O operador recebe uma resposta em milissegundos (produto criado em rascunho); todo o resto roda em background.
2. **Persistência por etapa.** Cada estágio grava seu resultado antes de acionar o próximo. Se a pesquisa de mercado falhar, não se perde o que o Vision e a IA de texto já produziram (nem o custo já pago por essas chamadas).
3. **Reaproveitar, não duplicar.** Fila, cache, storage, EventBus, provider do Mercado Livre e o próprio model `Product` já existem e são reaproveitados. Módulo novo só nasce quando cobre algo que genuinamente não existe hoje.
4. **Humano no final, sempre.** Nenhum rascunho vira produto ativo sem aprovação. Campos com baixa confiança (NCM principalmente) são sinalizados, nunca aplicados silenciosamente.
5. **Custo e falha são cidadãos de primeira classe.** Cada etapa registra o que gastou e loga erro sem travar o rascunho inteiro — degrada, não trava.

## 4. Visão Geral do Fluxo

```
Operador tira 1-5 fotos
        │
        ▼
[IngestionModule]  cria Product(status=DRAFT) + Image[] ─────────────► responde 201 já (ms)
        │  enqueue
        ▼
[VisionModule]           1 chamada multimodal p/ todas as fotos
        │  enqueue
        ▼
[IdentificationModule]   dedup por GTIN/foto repetida · normaliza condição
        │  enqueue (fan-out)
        ├──────────────────────┐
        ▼                      ▼
[DescriptionModule]      [NcmModule]
 + [SeoModule]            candidatos + confiança
        │                      │
        └──────────┬───────────┘
                    ▼ (join no Orchestrator)
        [MarketResearchModule]  fan-out
        ├──────────────────────┐
        ▼                      ▼
   ML (existente)         Shopee (gap — ver §9)
        └──────────┬───────────┘
                    ▼ (join, com timeout/degradação)
             [PricingModule]
                    │
                    ▼
         status pipeline = READY_FOR_REVIEW
         (Product continua DRAFT, mas com todos os campos preenchidos)
                    │
                    ▼
           [ReviewModule] — operador edita e aprova
                    │
                    ▼
         Product.status = ACTIVE  ──► [LearningModule] registra diff IA×final
```

Estágios com **join** (Description+SEO/NCM; ML/Shopee) rodam em paralelo — não há motivo para esperar o NCM terminar antes de começar a gerar a descrição. O `OrchestratorModule` decide quando cada branch fechou e libera o próximo estágio.

## 5. Módulos

Os módulos pedidos + 3 que adiciono (`Ingestion`, `Orchestrator`, `Review`) porque o fluxo não fecha sem eles: algo precisa receber o upload, algo precisa saber quando os ramos paralelos terminaram, e algo precisa expor a fila de revisão e o botão de aprovar.

| Módulo                                         | Responsabilidade                                                     | Reaproveita                                     | Novo                                |
| ---------------------------------------------- | -------------------------------------------------------------------- | ----------------------------------------------- | ----------------------------------- |
| **IngestionModule** _(novo)_                   | Recebe fotos, valida, sobe pro S3, cria `Product` rascunho           | `StorageModule`, `PrismaModule`                 | Endpoint + validação                |
| **VisionModule**                               | Extrai atributos visuais brutos (1 chamada, N fotos)                 | `AnalyzeImageService` (evolui)                  | Multi-imagem, provider configurável |
| **IdentificationModule** _(novo)_              | Resolve identidade: é item repetido? qual GTIN? condição normalizada | Lógica de `extractBrand` (evolui)               | Dedup por hash/GTIN                 |
| **DescriptionModule**                          | Título + descrição comercial                                         | Nenhum hoje (novo output)                       | Sim                                 |
| **SeoModule**                                  | slug, `metaTitle`, `metaDescription`, alt text                       | Campos já existem no `Product`                  | Geração                             |
| **NcmModule** _(novo)_                         | Classifica NCM com tabela de referência + confiança                  | `Product.ncm`/`Category.ncm` existentes         | Tabela de referência                |
| **MarketResearchModule**                       | Pesquisa ML e Shopee, preços de concorrência                         | `fetchMlPrices`, `MlCatalogService`             | Estratégia por provider + Shopee    |
| **PricingModule**                              | Preço sugerido final                                                 | `suggestPrice` (evolui)                         | Custo, frete, taxa MP               |
| **LearningModule** _(novo)_                    | Registra IA-sugeriu × operador-aprovou                               | —                                               | Sim                                 |
| **CacheModule**                                | Cache de resultados caros/estáveis                                   | `RedisService` existente                        | Só novo namespace de chaves         |
| **OrchestratorModule** _(novo, meu acréscimo)_ | Coordena estágios, fan-out/join, timeout, degradação                 | `QueueService`, `EventBus` existentes           | Máquina de estados                  |
| **ReviewModule** _(novo, meu acréscimo)_       | Fila de revisão, edição, aprovação → publica                         | `ProductsService`/`UpdateProductDto` existentes | Endpoints de revisão                |

### 5.1 VisionModule

- Entrada: 1–5 URLs de imagem (já no S3, upload feito pelo Ingestion).
- Uma única chamada multimodal com todas as imagens no mesmo request (mais barato e dá contexto cruzado ao modelo — ex.: uma foto da etiqueta + uma do produto inteiro na mesma análise).
- Reaplicar o mesmo guard anti-SSRF já existente, validando cada URL.
- Saída: JSON estruturado (tipo de objeto, marca, cor, material, texto visível/OCR, **grau de condição** — hoje já são 4 níveis em PT-BR: NOVO/USADO_BOM/USADO_REGULAR/DANIFICADO).
- **Decisão em aberto — provedor:** manter Gemini (já pago, já funcionando, `$0,30/$2,50` por 1M tokens no 2.5 Flash) ou migrar para Claude. Meu direcionamento no §10.

### 5.2 IdentificationModule

- Antes de qualquer chamada de IA: tenta ler um **GTIN/código de barras** na foto (decodificação de imagem pura, sem custo de IA) e cruza com produtos já cadastrados (`Product.gtin`). Se bater, é reposição de um item já conhecido — pula título/descrição/NCM e vai direto para atualizar preço. Isso importa especialmente num negócio de saldão/liquidação, onde é comum receber lotes repetidos de itens de varejo com código de barras original.
- Sem GTIN: usa o `condicao` do Vision e normaliza para o valor binário que `Product.condition` espera hoje (`new`/`used`, usado na publicação no ML) — mantendo o grau fino (4 níveis) só no rascunho, para informar a descrição e o desconto de preço.
- Saída: `searchTerm` (equivalente ao `descricao_busca` de hoje) — vira a entrada da pesquisa de mercado.

### 5.3 DescriptionModule + SeoModule

Hoje o protótipo mistura "termo de busca" com "descrição" num campo só. Separar em três saídas distintas, todas mapeando para campos que **já existem** no `Product`:

| Saída              | Campo no `Product`                                                |
| ------------------ | ----------------------------------------------------------------- |
| Título comercial   | `name`                                                            |
| Descrição curta    | `shortDescription`                                                |
| Descrição completa | `description`                                                     |
| Meta título SEO    | `metaTitle`                                                       |
| Meta descrição SEO | `metaDescription`                                                 |
| Slug               | `slug` (reaproveitar gerador de slug já usado no cadastro manual) |

SeoModule também gera texto alternativo (alt text) para as imagens já enviadas.

### 5.4 NcmModule

Classificar NCM por IA "no escuro" é arriscado — o risco não é técnico, é fiscal (código errado gera exposição tributária real). Desenho:

1. Carregar a tabela oficial de NCM (Receita Federal/SISCOMEX, ~10 mil códigos) numa tabela de referência local (`NcmReference`, ver §6) — hoje **não existe**.
2. Busca por similaridade (texto ou embedding — dá pra usar `pgvector` no Postgres já existente) contra a descrição do produto → top-10 candidatos.
3. LLM escolhe entre os candidatos e justifica — nunca gera um código livre (evita alucinar um NCM que parece plausível mas não existe).
4. Grava confiança. **Abaixo de um limiar (sugiro 85%), o campo fica pendente de confirmação manual** — não é preenchido sozinho.
5. Reduz a dependência do NCM genérico fixo (`87141000`) usado hoje como fallback na emissão de nota (`focusnfe.provider.ts`).

### 5.5 MarketResearchModule

Estratégia por provider (padrão _strategy_, um módulo por fora, dois providers por dentro):

- **Mercado Livre**: já funciona hoje (`fetchMlPrices`, busca pública, sem OAuth). Adicionar: cache (preços não mudam a cada segundo) e reaproveitar `MlCatalogService.domain_discovery` — que já existe para o Hub — para sugerir categoria a partir do título, sem reinventar essa chamada.
- **Shopee**: **gap real, não é só trabalho de implementação.** O `ShopeeProvider` que já existe no código é para o **vendedor gerenciar o próprio catálogo** (criar/atualizar/remover os próprios anúncios) — o Shopee Open Platform não expõe uma API pública de busca de anúncios de terceiros para pesquisa de concorrência. Três caminhos, nenhum trivial:
  1. Contratar um provedor de dados de marketplace (pago, mais previsível).
  2. Scraping de baixo volume, respeitando limites de taxa — risco de bloqueio de IP e de violar termos de uso, precisa ser uma decisão de negócio consciente, não uma decisão técnica silenciosa.
  3. Adiar Shopee e lançar só com Mercado Livre (recomendo isso para a Fase 1 — ver §15).

### 5.6 PricingModule

Evolui `suggestPrice()` (hoje: mediana do ML × desconto por condição, arredondado em `,99`). Adiciona:

- **Custo de aquisição** — hoje não existe campo nenhum de custo no `Product`. Sem isso, o preço sugerido pode ficar abaixo do custo se a mediana do concorrente estiver anormalmente baixa (um anúncio de liquidação isolado, por exemplo). Recomendo adicionar `Product.costPrice` e um piso de margem mínima configurável.
- Frete estimado (reaproveitar o módulo Melhor Envio já integrado).
- Taxa do Mercado Pago (reaproveitar a integração já existente) para pensar em margem líquida, não só preço de tabela.
- Mantém a psicologia de preço `,99` já usada hoje.

### 5.7 LearningModule

Não é aprendizado por reforço nem infraestrutura nova de ML — é registro estruturado do que a IA sugeriu vs. o que o operador realmente aprovou (`LearningFeedback`, ver §6), por campo (título, categoria, NCM, preço). Serve para: métricas de acurácia por módulo ao longo do tempo, e para montar exemplos few-shot reais (do próprio catálogo do Saldão) para melhorar os prompts depois — sem prometer um sistema de fine-tuning que este volume de dados não justifica ainda.

### 5.8 CacheModule

Não é um módulo novo de fato — é o `RedisService` que já existe, com um namespace novo de chaves:

| Chave                         | O quê                                | TTL sugerido                                               |
| ----------------------------- | ------------------------------------ | ---------------------------------------------------------- |
| `ve:vision:{hashDaImagem}`    | Resultado bruto do Vision            | 30–90 dias (mesma foto ⇒ mesmo resultado)                  |
| `ve:ncm:{queryNormalizada}`   | Candidatos de NCM                    | Longo (classificação de um tipo de produto muda raramente) |
| `ve:market:ml:{queryKey}`     | Preços do ML                         | 6–24h (preço muda)                                         |
| `ve:market:shopee:{queryKey}` | Preços do Shopee (se/quando existir) | 6–24h                                                      |

### 5.9 OrchestratorModule (acréscimo)

Sem isso, ninguém sabe quando os dois ramos paralelos (Descrição+SEO / NCM, depois ML / Shopee) terminaram para liberar o próximo estágio. Reaproveita o `EventBus` já existente: cada worker emite um evento de "estágio concluído"; o orchestrator escuta, marca no `ProductPipelineRun` (§6) e decide o próximo `enqueue`. Também aplica timeout por ramo — se Shopee não responder em X segundos, segue com "dados indisponíveis" em vez de travar o rascunho pra sempre.

### 5.10 ReviewModule (acréscimo)

Lista rascunhos (`Product` com `status=DRAFT` e pipeline em `READY_FOR_REVIEW` ou `FAILED_*`), permite editar (reaproveita `UpdateProductDto` já existente) e expõe a ação de aprovar, que muda `status` para `ACTIVE` e dispara o `LearningModule`.

## 6. Modelo de Dados

**Decisão central:** reaproveitar `Product` em vez de criar uma tabela paralela de rascunhos. O enum `ProductStatus` **já tem `DRAFT`** — o pipeline só vai progressivamente preenchendo os campos de um `Product` criado com `status: DRAFT` até o operador aprovar (`status: ACTIVE`). Isso evita duplicar um model com 25+ campos e evita um passo de "promover rascunho para produto" depois.

**Atenção (constraint real do schema atual):** `sku`, `name` e `price` são `NOT NULL` no `Product` hoje. O `IngestionModule` precisa gravar um placeholder nesses três campos na criação (ex.: SKU gerado, nome "Processando...", preço `0.00`) até os módulos seguintes sobrescreverem.

Três tabelas novas — o mínimo que genuinamente não existe hoje:

```prisma
model ProductPipelineRun {
  id             String         @id @default(cuid())
  productId      String         @unique @map("product_id")
  stage          PipelineStage  @default(UPLOADED)
  visionRaw      Json?          @map("vision_raw")
  identification Json?
  content        Json?          // candidatos de título/descrição/seo
  ncmCode        String?        @map("ncm_code")
  ncmConfidence  Decimal?       @map("ncm_confidence") @db.Decimal(4, 3)
  marketMl       Json?          @map("market_ml")
  marketShopee   Json?          @map("market_shopee")
  suggestedPrice Decimal?       @map("suggested_price") @db.Decimal(10, 2)
  costUsd        Decimal?       @map("cost_usd") @db.Decimal(10, 4)
  error          String?
  createdAt      DateTime       @default(now()) @map("created_at")
  updatedAt      DateTime       @updatedAt @map("updated_at")

  product Product @relation(fields: [productId], references: [id], onDelete: Cascade)

  @@map("product_pipeline_runs")
}

enum PipelineStage {
  UPLOADED
  VISION_PROCESSING
  IDENTIFYING
  ENRICHING
  RESEARCHING_MARKET
  PRICING
  READY_FOR_REVIEW
  APPROVED
  FAILED
}

model NcmReference {
  code        String   @id
  description String
  parentCode  String?  @map("parent_code")
  keywords    String[] @default([])
  updatedAt   DateTime @updatedAt @map("updated_at")

  @@map("ncm_reference")
}

model LearningFeedback {
  id         String   @id @default(cuid())
  productId  String   @map("product_id")
  field      String   // "title" | "ncm" | "price" | "category" ...
  aiValue    String?  @map("ai_value")
  finalValue String?  @map("final_value")
  createdAt  DateTime @default(now()) @map("created_at")

  @@index([field])
  @@map("learning_feedback")
}
```

Também recomendo avaliar adicionar `Product.costPrice Decimal?` — motivo no §5.6.

## 7. Filas

**Não introduzir BullMQ agora.** O `QueueService` atual já existe, já roda em produção, e o próprio comentário no código diz que a interface foi desenhada de propósito para ser compatível com uma migração futura para BullMQ sem trocar quem produz/consome. Seguir o mesmo padrão (`RPUSH`/worker por `@Interval`), com filas novas no mesmo estilo do que já existe (`oms:queue:{nome}`):

`ve:queue:vision`, `ve:queue:identification`, `ve:queue:description-seo`, `ve:queue:ncm`, `ve:queue:market-research-ml`, `ve:queue:market-research-shopee`, `ve:queue:pricing`, `ve:queue:learning`.

Concorrência por fila deve refletir o limite externo, não ser igual pra todas:

| Fila                                | Motivo do limite                                                                  | Sugestão                              |
| ----------------------------------- | --------------------------------------------------------------------------------- | ------------------------------------- |
| `vision`                            | Custo + rate limit do provedor de IA                                              | poucas concorrentes (ex. 3–5)         |
| `market-research-*`                 | Educação/rate-limit do lado de fora (ML, e principalmente Shopee se via scraping) | baixa concorrência (1–2), com backoff |
| `description-seo`, `ncm`, `pricing` | Majoritariamente texto/DB, barato                                                 | pode ter mais concorrência            |

**Worker dedicado — não agora, mas o caminho já está previsto.** Hoje tudo roda dentro do processo único `apps/api` (confirmado no `railway.toml`: um único `startCommand`). Isso é aceitável para o volume inicial porque as chamadas de IA são I/O (não bloqueiam o event loop do Node) — o gargalo real seria a fila crescer mais rápido do que o tick de 2s consegue drenar. Quando isso acontecer (monitorar profundidade de fila), a extração para um processo `apps/worker` separado é uma migração já facilitada pela interface compatível com BullMQ — não uma reescrita.

## 8. Cache

Coberto no §5.8 — é o `RedisService` já existente, sem infraestrutura nova. O único ponto de atenção: cache de **imagem** não faz sentido além do resultado do Vision (as fotos em si são sempre diferentes de produto para produto — não há prefixo comum a cachear ali).

## 9. Integrações Externas

| Integração                     | Situação                                                                           | Recomendação                                                      |
| ------------------------------ | ---------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| Vision AI                      | Gemini 2.5 Flash funcionando; fallback pra 2.0/1.5-flash quebrado (descontinuados) | Corrigir fallback já. Decisão de manter Gemini vs. migrar ver §10 |
| Mercado Livre (busca)          | Pública, sem auth, funcionando                                                     | Reaproveitar + cachear                                            |
| Mercado Livre (categoria)      | `MlCatalogService.domain_discovery` já existe, não é usado pelo Vision hoje        | Reaproveitar no `NcmModule`/categoria                             |
| Shopee (busca de concorrência) | Não existe API oficial para isso                                                   | Decisão de negócio — §5.5                                         |
| NCM (dados de referência)      | Não existe                                                                         | Importar tabela oficial (Receita Federal/SISCOMEX)                |
| Melhor Envio                   | Já integrado (frete)                                                               | Reaproveitar no `PricingModule`                                   |
| Mercado Pago                   | Já integrado (taxas)                                                               | Reaproveitar no `PricingModule` para margem líquida               |

## 10. Custos

Preços atuais confirmados (não estimados de memória):

| Modelo                         | Input /1M tokens                   | Output /1M tokens     |
| ------------------------------ | ---------------------------------- | --------------------- |
| Gemini 2.5 Flash (em uso hoje) | $0,30                              | $2,50                 |
| Claude Haiku 4.5               | $1,00                              | $5,00                 |
| Claude Sonnet 5                | $3,00 (intro $2,00 até 31/08/2026) | $15,00 (intro $10,00) |
| Claude Opus 4.8                | $5,00                              | $25,00                |

Estimativa por rascunho (3 fotos, ~4.000 tokens de imagem+instrução no Vision, ~1.400 tokens de texto nas etapas de descrição/SEO/NCM somadas, ~900 tokens de saída no total — pesquisa de mercado e precificação não usam IA, são chamadas REST/matemática):

| Estratégia                                          | Custo por rascunho | 900 produtos/mês | 4.500/mês | 15.000/mês |
| --------------------------------------------------- | ------------------ | ---------------- | --------- | ---------- |
| Tudo em Gemini 2.5 Flash (atual)                    | ~US$ 0,004         | ~US$ 3,60        | ~US$ 18   | ~US$ 60    |
| Híbrida (Vision em Gemini/Haiku, texto em Sonnet 5) | ~US$ 0,016         | ~US$ 14          | ~US$ 72   | ~US$ 240   |
| Tudo em Sonnet 5                                    | ~US$ 0,030         | ~US$ 27          | ~US$ 134  | ~US$ 445   |

**Conclusão:** em qualquer cenário de volume plausível para o Saldão, o custo de IA não é o fator limitante do projeto — é ordem de dezenas a poucas centenas de dólares por mês mesmo no cenário mais caro. O que precisa de decisão de orçamento de verdade é um eventual provedor pago de dados do Shopee (§5.5), não o Vision AI.

**Cache de prompt:** não ajuda no passo de Vision (cada foto é única — não há prefixo repetido pra cachear). Ajuda nas etapas de texto (descrição/SEO/NCM) **somente se** o bloco fixo de instruções + exemplos few-shot passar de ~1.000–2.000 tokens (mínimo pra cache entrar em modelos Claude). Se o time investir num prompt mais rico com exemplos reais do catálogo (o que também deve melhorar a qualidade e consistência do texto gerado), esse pedaço fica ~90% mais barato nas chamadas repetidas.

**Recomendação de modelo por etapa** (usando a mesma lógica de tiers já adotada no projeto — Haiku para tarefas simples, Sonnet/Opus para raciocínio complexo): Vision e extração estruturada → tier baixo (Gemini Flash, já pago, ou Haiku); redação de título/descrição e escolha de NCM → tier médio (Sonnet), onde qualidade de escrita e aderência ao schema pesam mais que custo marginal.

## 11. Escalabilidade e Resiliência

- Chamadas de IA são I/O-bound — não travam o event loop único do Node mesmo rodando no mesmo processo da API.
- Limites de concorrência **por fila**, não globais — o gargalo de cada etapa é diferente (rate limit de provedor de IA ≠ rate limit do Mercado Livre ≠ nada, no caso de precificação).
- Degradação graciosa: se Shopee (ou até o ML) falhar/expirar, o `OrchestratorModule` segue para precificação com os dados que tem, marcando a lacuna — nunca trava o rascunho esperando pra sempre.
- Upload em lote (operador fotografando vários itens seguidos) é absorvido naturalmente pela fila — não precisa de nada especial.
- Ponto de extração para worker dedicado já identificado no §7, para quando o volume justificar.

## 12. Segurança

- **Reaplicar o guard anti-SSRF já existente** (`assertPublicHttpUrl`/`isPrivateIp`) para cada uma das novas URLs no VisionModule multi-imagem — não regredir isso.
- Validar no boundary de entrada (`IngestionModule`): tipo de arquivo (allowlist de imagem), tamanho máximo, limite de 5 fotos por requisição.
- Reaproveitar o mesmo padrão de guarda por `Role` já usado no `ProductsController` para restringir os endpoints novos a operadores autenticados.
- Rate limit dedicado no endpoint de upload — na mesma linha do que já foi feito recentemente para login/registro/forgot-password (commit `f4c468e`/`e837953`), aplicado agora ao novo endpoint que também recebe tráfego direto de um operador autenticado, mas ainda é superfície nova.
- Gate de confiança do NCM (§5.4) não é só qualidade — é mitigação de risco fiscal/legal, tratar como requisito de segurança/compliance, não como nice-to-have.
- Confirmar (não supor) que toda query pública de listagem de produtos já filtra por `status: ACTIVE`, para garantir que rascunhos em `DRAFT` nunca vazem na loja.

## 13. Roadmap Sugerido (fases, sem implementar agora)

| Fase         | Entrega                                                                                                                                          | Reaproveitamento                                                         |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------ |
| 0            | Corrigir fallback de modelos Gemini descontinuados no serviço atual                                                                              | — (bugfix isolado, incluído aqui pois foi achado durante a investigação) |
| 1 — MVP      | Ingestion multi-foto + Vision (1 chamada) + `ProductPipelineRun` + fila básica + revisão manual simples, reaproveitando `suggestPrice` como está | ~90% do que já existe                                                    |
| 2            | Description/SEO dedicados + NcmModule com tabela de referência e gate de confiança                                                               | Campos já existentes no `Product`                                        |
| 3            | Decisão sobre Shopee (dados pagos vs. adiar) + PricingModule com custo/frete/taxa                                                                | Melhor Envio e Mercado Pago já integrados                                |
| 4            | LearningModule + métricas de acurácia por módulo                                                                                                 | —                                                                        |
| 5 (opcional) | Identificação por GTIN para reposições + publicação automática no Hub OMS ao aprovar                                                             | `MarketplaceHubService` já existente                                     |

## 14. Integração com Sistemas Existentes

- **Hub OMS/Marketplace**: ao aprovar um rascunho, opcionalmente já enfileirar publicação em ML/Shopee reaproveitando `oms:queue:marketplace.publish` — fase 5, não MVP.
- **WhatsApp**: notificar operador quando um rascunho estiver pronto para revisão. `Product` já tem `whatsappGroupIds`/`autoPublishWhatsapp` — sugere que grupo de WhatsApp para eventos de produto já é um padrão aceito no projeto; reaproveitar em vez de criar canal de notificação novo.
- **Melhor Envio / Mercado Pago**: consumidos apenas pelo `PricingModule`, como serviços já prontos — nenhuma mudança neles.

## 15. Riscos e Mitigações

| Risco                                                    | Mitigação                                                                         |
| -------------------------------------------------------- | --------------------------------------------------------------------------------- |
| NCM incorreto (exposição fiscal)                         | Tabela de referência + gate de confiança + revisão obrigatória abaixo do limiar   |
| Sem API de busca de concorrência no Shopee               | Decisão de negócio explícita (§5.5) — não terceirizar a decisão para o código     |
| Preço sugerido abaixo do custo                           | Adicionar `Product.costPrice` + piso de margem antes de confiar no preço sugerido |
| Fila do processo único sobrecarregada em picos           | Monitorar profundidade; caminho de extração para worker já previsto               |
| Um provedor de pesquisa trava o rascunho indefinidamente | Timeout + degradação graciosa no `OrchestratorModule`                             |
| Rascunho incompleto vazar na loja                        | Confirmar filtro `status: ACTIVE` em todas as listagens públicas                  |

## 16. Decisões Pendentes

1. Manter Gemini como provedor de Vision, migrar para Claude, ou híbrido por etapa?
2. Como o operador informa o custo de aquisição do lote/item (entrada manual obrigatória antes do preço final, ou campo opcional)?
3. Orçamento/apetite para contratar dado pago de concorrência do Shopee, ou aceitar lançar só com Mercado Livre no início?
4. Limiar de confiança do NCM (85% sugerido) — validar com quem hoje decide isso manualmente.
5. Volume esperado de produtos/dia — dimensiona filas e define quando vale extrair o worker dedicado.
