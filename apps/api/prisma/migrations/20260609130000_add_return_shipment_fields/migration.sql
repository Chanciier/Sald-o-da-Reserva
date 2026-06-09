ALTER TABLE "return_requests" ADD COLUMN "me_order_id" TEXT;
ALTER TABLE "return_requests" ADD COLUMN "tracking_code" TEXT;
ALTER TABLE "return_requests" ADD COLUMN "label_url" TEXT;
ALTER TABLE "return_requests" ADD COLUMN "posted_at" TIMESTAMPTZ;
ALTER TABLE "return_requests" ADD COLUMN "return_delivered_at" TIMESTAMPTZ;
CREATE UNIQUE INDEX "return_requests_me_order_id_key" ON "return_requests"("me_order_id");
