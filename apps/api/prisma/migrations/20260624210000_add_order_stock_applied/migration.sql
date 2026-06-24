-- Stock is now decremented only when the order's payment is approved (not at
-- checkout). This flag tracks whether an order has had its stock decremented,
-- guaranteeing the decrement/restore happens exactly once per order.
ALTER TABLE "orders" ADD COLUMN "stock_applied" BOOLEAN NOT NULL DEFAULT false;

-- Backfill: under the previous code, stock was decremented at order creation and
-- restored only for cancelled/refunded orders. So every non-restored existing
-- order already has its stock applied.
UPDATE "orders" SET "stock_applied" = true WHERE "status" NOT IN ('CANCELLED', 'REFUNDED');
