-- CreateEnum
CREATE TYPE "DocumentType" AS ENUM ('CPF', 'CNPJ');

-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "recipient_document" TEXT,
ADD COLUMN     "recipient_document_type" "DocumentType",
ADD COLUMN     "recipient_email" TEXT,
ADD COLUMN     "recipient_profile_id" TEXT,
ADD COLUMN     "saved_address_id" TEXT;

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "is_beta_tester" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "recipient_profiles" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "document_type" "DocumentType" NOT NULL DEFAULT 'CPF',
    "document" TEXT NOT NULL,
    "phone" TEXT,
    "email" TEXT,
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "recipient_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "saved_addresses" (
    "id" TEXT NOT NULL,
    "recipient_profile_id" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "postal_code" TEXT NOT NULL,
    "street" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "complement" TEXT,
    "neighborhood" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "state" CHAR(2) NOT NULL,
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "saved_addresses_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "recipient_profiles_user_id_idx" ON "recipient_profiles"("user_id");

-- CreateIndex
CREATE INDEX "saved_addresses_recipient_profile_id_idx" ON "saved_addresses"("recipient_profile_id");

-- CreateIndex
CREATE INDEX "orders_recipient_profile_id_idx" ON "orders"("recipient_profile_id");

-- CreateIndex
CREATE INDEX "orders_saved_address_id_idx" ON "orders"("saved_address_id");

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_recipient_profile_id_fkey" FOREIGN KEY ("recipient_profile_id") REFERENCES "recipient_profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_saved_address_id_fkey" FOREIGN KEY ("saved_address_id") REFERENCES "saved_addresses"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recipient_profiles" ADD CONSTRAINT "recipient_profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "saved_addresses" ADD CONSTRAINT "saved_addresses_recipient_profile_id_fkey" FOREIGN KEY ("recipient_profile_id") REFERENCES "recipient_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
