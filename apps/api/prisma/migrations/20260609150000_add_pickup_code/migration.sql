-- AlterTable
ALTER TABLE "orders" ADD COLUMN "pickup_code" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "orders_pickup_code_key" ON "orders"("pickup_code");
