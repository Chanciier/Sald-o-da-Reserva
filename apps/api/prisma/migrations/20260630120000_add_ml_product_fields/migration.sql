-- AlterTable: campos usados na publicação em marketplaces externos (Mercado Livre).
-- `gtin` (EAN/UPC) é exigido por várias categorias do ML; `condition` mapeia para
-- o campo `condition` do anúncio. Default 'new' mantém linhas existentes válidas.
ALTER TABLE "products" ADD COLUMN "gtin" TEXT;
ALTER TABLE "products" ADD COLUMN "condition" TEXT NOT NULL DEFAULT 'new';
