-- Add missing OrderStatus enum values that exist in schema but were never added to the DB
ALTER TYPE "OrderStatus" ADD VALUE IF NOT EXISTS 'SEPARATING';
ALTER TYPE "OrderStatus" ADD VALUE IF NOT EXISTS 'SEPARATED';
ALTER TYPE "OrderStatus" ADD VALUE IF NOT EXISTS 'READY_TO_SHIP';
