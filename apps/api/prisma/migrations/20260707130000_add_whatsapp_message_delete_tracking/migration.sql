-- AlterTable
ALTER TABLE "whatsapp_message_logs" ADD COLUMN "message_id" TEXT,
ADD COLUMN "deleted_at" TIMESTAMP(3);
