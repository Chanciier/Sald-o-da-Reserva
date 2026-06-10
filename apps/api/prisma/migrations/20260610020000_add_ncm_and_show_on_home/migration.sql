-- AlterTable: add ncm and show_on_home to categories
ALTER TABLE "categories" ADD COLUMN "ncm" TEXT;
ALTER TABLE "categories" ADD COLUMN "show_on_home" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable: add ncm to products
ALTER TABLE "products" ADD COLUMN "ncm" TEXT;
