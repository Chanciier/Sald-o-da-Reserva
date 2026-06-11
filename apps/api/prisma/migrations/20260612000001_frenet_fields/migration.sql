-- AlterTable
ALTER TABLE "shipments" ADD COLUMN "service_code" TEXT;
ALTER TABLE "shipments" ADD COLUMN "frenet_ticket" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "shipments_frenet_ticket_key" ON "shipments"("frenet_ticket");
