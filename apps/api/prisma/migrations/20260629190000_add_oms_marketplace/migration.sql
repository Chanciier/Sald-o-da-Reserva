-- AlterEnum
-- Adds OMS lifecycle states for unique products. Adding values at the end is
-- safe on PostgreSQL 12+ (not used within this same migration transaction).
ALTER TYPE "ProductStatus" ADD VALUE 'RESERVED';
ALTER TYPE "ProductStatus" ADD VALUE 'SOLD';
ALTER TYPE "ProductStatus" ADD VALUE 'UNAVAILABLE';
ALTER TYPE "ProductStatus" ADD VALUE 'REMOVED';

-- CreateEnum
CREATE TYPE "Marketplace" AS ENUM ('SITE', 'MERCADO_LIVRE', 'SHOPEE');

-- CreateEnum
CREATE TYPE "PublicationStatus" AS ENUM ('PENDING', 'PUBLISHING', 'PUBLISHED', 'FAILED', 'PAUSED', 'REMOVED', 'SYNC_PENDING');

-- CreateEnum
CREATE TYPE "SyncAction" AS ENUM ('PUBLISH', 'UPDATE', 'UPDATE_STOCK', 'UPDATE_PRICE', 'PAUSE', 'REMOVE');

-- CreateEnum
CREATE TYPE "SyncStatus" AS ENUM ('PENDING', 'RUNNING', 'SUCCESS', 'FAILED');

-- CreateEnum
CREATE TYPE "WebhookSource" AS ENUM ('MERCADO_PAGO', 'MERCADO_LIVRE', 'SHOPEE');

-- CreateEnum
CREATE TYPE "WebhookStatus" AS ENUM ('RECEIVED', 'PROCESSING', 'PROCESSED', 'FAILED', 'IGNORED');

-- AlterTable
ALTER TABLE "products" ADD COLUMN "is_unique" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable: notifications.order_id becomes nullable + add product_id
ALTER TABLE "notifications" ALTER COLUMN "order_id" DROP NOT NULL;
ALTER TABLE "notifications" ADD COLUMN "product_id" TEXT;

-- CreateTable
CREATE TABLE "marketplace_publications" (
    "id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "marketplace" "Marketplace" NOT NULL,
    "external_id" TEXT,
    "status" "PublicationStatus" NOT NULL DEFAULT 'PENDING',
    "error_message" TEXT,
    "payload_sent" JSONB,
    "response_received" JSONB,
    "published_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "marketplace_publications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "marketplace_sync_logs" (
    "id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "marketplace" "Marketplace" NOT NULL,
    "action" "SyncAction" NOT NULL,
    "status" "SyncStatus" NOT NULL DEFAULT 'PENDING',
    "error_message" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finished_at" TIMESTAMP(3),

    CONSTRAINT "marketplace_sync_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "webhook_logs" (
    "id" TEXT NOT NULL,
    "source" "WebhookSource" NOT NULL,
    "event_type" TEXT,
    "payload" JSONB NOT NULL,
    "status" "WebhookStatus" NOT NULL DEFAULT 'RECEIVED',
    "error_message" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processed_at" TIMESTAMP(3),

    CONSTRAINT "webhook_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "products_is_unique_idx" ON "products"("is_unique");

-- CreateIndex
CREATE INDEX "notifications_product_id_idx" ON "notifications"("product_id");

-- CreateIndex
CREATE UNIQUE INDEX "marketplace_publications_product_id_marketplace_key" ON "marketplace_publications"("product_id", "marketplace");

-- CreateIndex
CREATE INDEX "marketplace_publications_marketplace_status_idx" ON "marketplace_publications"("marketplace", "status");

-- CreateIndex
CREATE INDEX "marketplace_publications_status_idx" ON "marketplace_publications"("status");

-- CreateIndex
CREATE INDEX "marketplace_sync_logs_product_id_idx" ON "marketplace_sync_logs"("product_id");

-- CreateIndex
CREATE INDEX "marketplace_sync_logs_marketplace_status_idx" ON "marketplace_sync_logs"("marketplace", "status");

-- CreateIndex
CREATE INDEX "marketplace_sync_logs_created_at_idx" ON "marketplace_sync_logs"("created_at");

-- CreateIndex
CREATE INDEX "webhook_logs_source_status_idx" ON "webhook_logs"("source", "status");

-- CreateIndex
CREATE INDEX "webhook_logs_created_at_idx" ON "webhook_logs"("created_at");

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "marketplace_publications" ADD CONSTRAINT "marketplace_publications_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "marketplace_sync_logs" ADD CONSTRAINT "marketplace_sync_logs_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;
