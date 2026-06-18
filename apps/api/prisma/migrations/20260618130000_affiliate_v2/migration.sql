-- CreateEnum
CREATE TYPE "ApplicationStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "WithdrawalStatus" AS ENUM ('PENDING', 'PAID', 'REJECTED');

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "referred_at" TIMESTAMP(3),
ADD COLUMN     "referred_by_code" TEXT;

-- AlterTable
ALTER TABLE "products" ADD COLUMN     "commission_rate" DECIMAL(5,2);

-- AlterTable
ALTER TABLE "order_items" ADD COLUMN     "commission_rate" DECIMAL(5,2);

-- AlterTable
ALTER TABLE "affiliates" ADD COLUMN     "pix_key" TEXT,
ADD COLUMN     "pix_key_type" TEXT;

-- AlterTable
ALTER TABLE "commissions" ADD COLUMN     "withdrawal_id" TEXT;

-- AlterTable
ALTER TABLE "affiliate_config" ADD COLUMN     "min_withdrawal" DECIMAL(10,2) NOT NULL DEFAULT 50;

-- CreateTable
CREATE TABLE "affiliate_applications" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "full_name" TEXT NOT NULL,
    "cpf" TEXT NOT NULL,
    "instagram" TEXT,
    "facebook" TEXT,
    "tiktok" TEXT,
    "status" "ApplicationStatus" NOT NULL DEFAULT 'PENDING',
    "review_note" TEXT,
    "reviewed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "affiliate_applications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "withdrawals" (
    "id" TEXT NOT NULL,
    "affiliate_id" TEXT NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "pix_key" TEXT NOT NULL,
    "pix_key_type" TEXT NOT NULL,
    "status" "WithdrawalStatus" NOT NULL DEFAULT 'PENDING',
    "note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "paid_at" TIMESTAMP(3),

    CONSTRAINT "withdrawals_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "affiliate_applications_user_id_key" ON "affiliate_applications"("user_id");

-- CreateIndex
CREATE INDEX "affiliate_applications_status_idx" ON "affiliate_applications"("status");

-- CreateIndex
CREATE INDEX "withdrawals_affiliate_id_idx" ON "withdrawals"("affiliate_id");

-- CreateIndex
CREATE INDEX "withdrawals_status_idx" ON "withdrawals"("status");

-- CreateIndex
CREATE INDEX "commissions_withdrawal_id_idx" ON "commissions"("withdrawal_id");

-- AddForeignKey
ALTER TABLE "commissions" ADD CONSTRAINT "commissions_withdrawal_id_fkey" FOREIGN KEY ("withdrawal_id") REFERENCES "withdrawals"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "affiliate_applications" ADD CONSTRAINT "affiliate_applications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "withdrawals" ADD CONSTRAINT "withdrawals_affiliate_id_fkey" FOREIGN KEY ("affiliate_id") REFERENCES "affiliates"("id") ON DELETE CASCADE ON UPDATE CASCADE;
