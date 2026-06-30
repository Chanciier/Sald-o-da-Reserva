-- OMS: canal de origem e identificadores externos do pedido (importação de
-- pedidos de marketplaces como o Mercado Livre).
ALTER TABLE "orders" ADD COLUMN "channel" "Marketplace" NOT NULL DEFAULT 'SITE';
ALTER TABLE "orders" ADD COLUMN "external_id" TEXT;
ALTER TABLE "orders" ADD COLUMN "external_reference" TEXT;

-- Idempotência da importação: um pedido externo (canal + id) só entra uma vez.
-- NULLs (pedidos do SITE) são tratados como distintos pelo Postgres, então a
-- restrição não atrapalha os pedidos da loja própria.
CREATE UNIQUE INDEX "orders_channel_external_id_key" ON "orders"("channel", "external_id");
CREATE INDEX "orders_channel_idx" ON "orders"("channel");

-- Id do envio no marketplace de origem (etiqueta/rastreio fora do Melhor Envio).
ALTER TABLE "shipments" ADD COLUMN "external_id" TEXT;
