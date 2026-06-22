-- CreateTable
CREATE TABLE "meta_catalog_syncs" (
    "id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "error_message" TEXT,
    "synced_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "meta_catalog_syncs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "meta_catalog_syncs_product_id_key" ON "meta_catalog_syncs"("product_id");

-- CreateIndex
CREATE INDEX "meta_catalog_syncs_status_idx" ON "meta_catalog_syncs"("status");

-- AddForeignKey
ALTER TABLE "meta_catalog_syncs" ADD CONSTRAINT "meta_catalog_syncs_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;
