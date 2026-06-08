-- AlterTable: rename enotas_id → focus_reference
ALTER TABLE "invoices" RENAME COLUMN "enotas_id" TO "focus_reference";

-- AlterTable: rename pdf_url → danfe_url
ALTER TABLE "invoices" RENAME COLUMN "pdf_url" TO "danfe_url";

-- AlterTable: add protocol column
ALTER TABLE "invoices" ADD COLUMN "protocol" VARCHAR(30);

-- Drop old unique constraint name and recreate with new name
ALTER TABLE "invoices" DROP CONSTRAINT IF EXISTS "invoices_enotas_id_key";
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_focus_reference_key" UNIQUE ("focus_reference");

-- Recreate index with new name
DROP INDEX IF EXISTS "invoices_enotas_id_idx";
CREATE INDEX "invoices_focus_reference_idx" ON "invoices"("focus_reference");
