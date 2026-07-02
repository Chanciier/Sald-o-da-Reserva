ALTER TABLE "coupons"
ADD COLUMN "owner_user_id" TEXT,
ADD COLUMN "source_order_id" TEXT;

ALTER TABLE "orders"
ADD COLUMN "cart_reminder_created_at" TIMESTAMP(3),
ADD COLUMN "cart_reminder_push_sent_at" TIMESTAMP(3),
ADD COLUMN "recovery_coupon_created_at" TIMESTAMP(3),
ADD COLUMN "recovery_coupon_push_sent_at" TIMESTAMP(3);

CREATE UNIQUE INDEX "coupons_source_order_id_key" ON "coupons"("source_order_id");
CREATE INDEX "coupons_owner_user_id_idx" ON "coupons"("owner_user_id");
CREATE INDEX "coupons_source_order_id_idx" ON "coupons"("source_order_id");
CREATE INDEX "orders_status_channel_created_at_idx" ON "orders"("status", "channel", "created_at");

ALTER TABLE "coupons" ADD CONSTRAINT "coupons_owner_user_id_fkey"
FOREIGN KEY ("owner_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "coupons" ADD CONSTRAINT "coupons_source_order_id_fkey"
FOREIGN KEY ("source_order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;
