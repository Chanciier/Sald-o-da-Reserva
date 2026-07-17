-- CreateEnum
CREATE TYPE "PrintJobType" AS ENUM ('PICKUP', 'SHIPPING');

-- CreateEnum
CREATE TYPE "PrintJobStatus" AS ENUM ('PENDING', 'READY', 'SENT', 'PRINTING', 'PRINTED', 'FAILED');

-- CreateTable
CREATE TABLE "print_jobs" (
    "id" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "type" "PrintJobType" NOT NULL,
    "status" "PrintJobStatus" NOT NULL DEFAULT 'PENDING',
    "copies" INTEGER NOT NULL DEFAULT 1,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "printer_profile" TEXT,
    "document_url" TEXT,
    "last_error" TEXT,
    "device_id" TEXT,
    "sent_at" TIMESTAMP(3),
    "printed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "print_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "print_devices" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "token_hash" TEXT NOT NULL,
    "online" BOOLEAN NOT NULL DEFAULT false,
    "last_seen" TIMESTAMP(3),
    "pickup_printer" TEXT,
    "shipping_printer" TEXT,
    "revoked_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "print_devices_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "print_jobs_status_type_idx" ON "print_jobs"("status", "type");

-- CreateIndex
CREATE INDEX "print_jobs_device_id_idx" ON "print_jobs"("device_id");

-- CreateIndex
CREATE UNIQUE INDEX "print_jobs_order_id_type_key" ON "print_jobs"("order_id", "type");

-- CreateIndex
CREATE UNIQUE INDEX "print_devices_token_hash_key" ON "print_devices"("token_hash");

-- AddForeignKey
ALTER TABLE "print_jobs" ADD CONSTRAINT "print_jobs_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "print_jobs" ADD CONSTRAINT "print_jobs_device_id_fkey" FOREIGN KEY ("device_id") REFERENCES "print_devices"("id") ON DELETE SET NULL ON UPDATE CASCADE;
