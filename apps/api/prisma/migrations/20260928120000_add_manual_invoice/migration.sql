-- Notas avulsas (venda feita fora do site) não têm pedido.
ALTER TABLE "invoices" ALTER COLUMN "order_id" DROP NOT NULL;
ALTER TABLE "invoices" ADD COLUMN "manual_data" JSONB;
