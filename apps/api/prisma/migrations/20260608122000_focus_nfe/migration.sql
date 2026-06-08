/*
  Warnings:

  - You are about to drop the column `mp_payment_id` on the `payments` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[gateway_payment_id]` on the table `payments` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateEnum
CREATE TYPE "DeliveryMethod" AS ENUM ('SHIPPING', 'PICKUP');

-- DropIndex
DROP INDEX "payments_mp_payment_id_idx";

-- DropIndex
DROP INDEX "payments_mp_payment_id_key";

-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "delivery_method" "DeliveryMethod" NOT NULL DEFAULT 'SHIPPING',
ALTER COLUMN "shipping_address" DROP NOT NULL;

-- AlterTable
ALTER TABLE "payments" DROP COLUMN "mp_payment_id",
ADD COLUMN     "client_secret" TEXT,
ADD COLUMN     "gateway_payment_id" TEXT;

-- AlterTable
ALTER TABLE "products" ADD COLUMN     "pickup_available" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE UNIQUE INDEX "payments_gateway_payment_id_key" ON "payments"("gateway_payment_id");

-- CreateIndex
CREATE INDEX "payments_gateway_payment_id_idx" ON "payments"("gateway_payment_id");
