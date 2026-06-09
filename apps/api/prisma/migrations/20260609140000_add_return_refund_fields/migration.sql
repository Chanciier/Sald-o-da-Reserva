ALTER TABLE "return_requests" ADD COLUMN "refund_id" TEXT;
ALTER TABLE "return_requests" ADD COLUMN "refund_amount" DECIMAL(10,2);
ALTER TABLE "return_requests" ADD COLUMN "refund_status" TEXT;
ALTER TABLE "return_requests" ADD COLUMN "refunded_at" TIMESTAMPTZ;
