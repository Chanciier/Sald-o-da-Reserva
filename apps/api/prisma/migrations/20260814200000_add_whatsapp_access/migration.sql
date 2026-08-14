-- CreateEnum
CREATE TYPE "ProductType" AS ENUM ('PHYSICAL', 'WHATSAPP_ACCESS');

-- CreateEnum
CREATE TYPE "WhatsappAccessGrantStatus" AS ENUM ('ACTIVE', 'EXPIRED', 'REMOVED', 'FAILED');

-- AlterEnum
ALTER TYPE "DeliveryMethod" ADD VALUE 'DIGITAL';

-- AlterTable
ALTER TABLE "products" ADD COLUMN     "access_group_jid" TEXT,
ADD COLUMN     "access_validity_days" INTEGER,
ADD COLUMN     "type" "ProductType" NOT NULL DEFAULT 'PHYSICAL';

-- CreateTable
CREATE TABLE "whatsapp_access_grants" (
    "id" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "order_item_id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "phone" TEXT,
    "group_jid" TEXT NOT NULL,
    "invite_link" TEXT,
    "status" "WhatsappAccessGrantStatus" NOT NULL DEFAULT 'ACTIVE',
    "expires_at" TIMESTAMP(3),
    "removed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "whatsapp_access_grants_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "whatsapp_access_grants_order_item_id_key" ON "whatsapp_access_grants"("order_item_id");

-- CreateIndex
CREATE INDEX "whatsapp_access_grants_status_expires_at_idx" ON "whatsapp_access_grants"("status", "expires_at");

-- CreateIndex
CREATE INDEX "whatsapp_access_grants_order_id_idx" ON "whatsapp_access_grants"("order_id");

-- CreateIndex
CREATE INDEX "whatsapp_access_grants_user_id_idx" ON "whatsapp_access_grants"("user_id");

-- CreateIndex
CREATE INDEX "products_type_idx" ON "products"("type");

-- AddForeignKey
ALTER TABLE "whatsapp_access_grants" ADD CONSTRAINT "whatsapp_access_grants_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "whatsapp_access_grants" ADD CONSTRAINT "whatsapp_access_grants_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

