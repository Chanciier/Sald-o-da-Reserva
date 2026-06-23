# Integração Meta — O que falta configurar

> Atualizado em 2026-06-23. **O código está 100% pronto e no ar.** Falta apenas
> configuração no painel da Meta + variáveis de ambiente (Vercel/Railway).

## Onde cada coisa roda

- **Frontend (site)** → Vercel (`saldao-da-reserva-web.vercel.app`) → roda o **Pixel do navegador**
- **Backend (API)** → Railway → roda **Conversions API** e **Meta Catalog**

## IDs já obtidos

- **Pixel ID:** `1003262182463620` (o valor de dentro do `fbq('init', ...)` do snippet)
  - ⚠️ O número `2494153777703511` que veio rotulado como "Id Pixel" é **outro
    identificador** (conta/negócio/conjunto de dados), **não** é o pixel. Confirmar
    no Events Manager: o ID certo aparece logo abaixo do nome do pixel.

---

## ✅ Pronto (código, já deployado)

- Pixel no navegador: PageView, ViewContent, AddToCart, InitiateCheckout, Purchase
  - `apps/web/src/lib/pixel.ts`, `apps/web/src/components/pixel-provider.tsx`
- Conversions API (server-side): Purchase, InitiateCheckout, AddToCart
  - `apps/api/src/meta/`
- Sincronização com Meta Catalog (auto upsert/delete + sync manual)
  - `apps/api/src/meta-catalog/`, admin em `/admin/marketing/meta-catalog`
- Dashboard de Marketing: `/admin/marketing`

---

## ⏳ Falta fazer

### 1. Pixel do navegador _(já tenho o ID)_

- [ ] Vercel → Settings → Environment Variables (projeto **web**):
  ```
  NEXT_PUBLIC_ENV=production
  NEXT_PUBLIC_META_PIXEL_ID=1003262182463620
  ```
- [ ] Redeploy (próximo `git push` já resolve, ou botão **Redeploy** na Vercel)
- ⚠️ Sem `NEXT_PUBLIC_ENV=production` o pixel **não dispara** (guard de produção).

### 2. Conversions API (server-side) _(falta gerar o token)_

- [ ] Gerar token: Events Manager → Pixel → Configurações → Conversions API →
      **Gerar token de acesso**
- [ ] Railway → Variables (projeto **API**):
  ```
  META_PIXEL_ID=1003262182463620
  META_CONVERSIONS_API_TOKEN=<token>
  ```
- Usar o **mesmo** Pixel ID dos dois lados (deduplicação navegador × servidor).

### 3. Meta Catalog _(falta ID + token do catálogo)_

- [ ] Pegar ID: Commerce Manager → seu catálogo → Configurações do catálogo
- [ ] Gerar token com permissão `catalog_management` (pode ser o System User token)
- [ ] Railway → Variables (projeto **API**):
  ```
  META_CATALOG_ID=<id>
  META_CATALOG_ACCESS_TOKEN=<token>
  ```
- [ ] Rodar a 1ª carga em `/admin/marketing/meta-catalog` → **Sincronizar Tudo**
- A tabela `meta_catalog_syncs` é criada pela migration (roda automática no deploy
  do Railway; se não rodar, `npx prisma migrate deploy`).

---

## Ordem recomendada

1. **Item 1 (Pixel)** — mais rápido, já começa a rastrear visitas/carrinho.
2. **Item 2 (CAPI)** — rastreamento mais preciso (não depende de bloqueador de anúncio).
3. **Item 3 (Catálogo)** — anúncios com os produtos.

## Como testar

- **Pixel:** Events Manager → seu Pixel → **Testar eventos** (Test Events) → abrir o
  site e ver PageView/ViewContent/AddToCart chegando.
- **CAPI:** após um pedido aprovado em produção, conferir o `Purchase` em Test Events
  (deve aparecer marcado como vindo do servidor).
- **Catálogo:** Commerce Manager → Catálogo → Itens → confirmar produtos sincronizados.

## Importante

- Nenhuma dessas variáveis quebra o site se faltar — tudo tem guard e fica silencioso
  até ser configurado. Pode configurar aos poucos.
