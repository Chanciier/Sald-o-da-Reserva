ALTER TABLE "orders"
ADD COLUMN "cart_reminder_whatsapp_sent_at" TIMESTAMP(3),
ADD COLUMN "recovery_coupon_whatsapp_sent_at" TIMESTAMP(3);
