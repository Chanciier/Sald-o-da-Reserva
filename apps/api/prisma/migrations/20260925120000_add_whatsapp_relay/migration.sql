-- CreateEnum
CREATE TYPE "WhatsappRelayRole" AS ENUM ('SOURCE', 'TARGET');

-- CreateTable
CREATE TABLE "whatsapp_relay_groups" (
    "id" TEXT NOT NULL,
    "jid" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" "WhatsappRelayRole" NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "whatsapp_relay_groups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "whatsapp_relay_logs" (
    "id" TEXT NOT NULL,
    "source_jid" TEXT NOT NULL,
    "source_name" TEXT NOT NULL,
    "source_message_id" TEXT NOT NULL,
    "target_jid" TEXT NOT NULL,
    "target_name" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "preview" VARCHAR(120),
    "success" BOOLEAN NOT NULL,
    "error" TEXT,
    "message_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "whatsapp_relay_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "whatsapp_relay_groups_jid_key" ON "whatsapp_relay_groups"("jid");

-- CreateIndex
CREATE INDEX "whatsapp_relay_logs_created_at_idx" ON "whatsapp_relay_logs"("created_at");

