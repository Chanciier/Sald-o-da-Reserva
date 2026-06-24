import { Injectable, Logger } from '@nestjs/common';
import { ProductStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Single source of truth for order stock movements.
 *
 * Stock is decremented only when an order's payment is approved, and restored
 * only if it had been decremented. Idempotency is enforced atomically via the
 * `order.stockApplied` flag, so the operation is safe to call from any approval
 * path (MP webhook, synchronous card approval, status polling) without ever
 * double-counting.
 */
@Injectable()
export class StockService {
  private readonly logger = new Logger(StockService.name);

  constructor(private readonly prisma: PrismaService) {}

  /** Decrement stock for an order's items exactly once. Returns true if applied now. */
  async applyForOrder(orderId: string): Promise<boolean> {
    const applied = await this.prisma.$transaction(async (tx) => {
      // Claim atomically: only the first caller flips false → true.
      const claim = await tx.order.updateMany({
        where: { id: orderId, stockApplied: false },
        data: { stockApplied: true },
      });
      if (claim.count === 0) return false;

      const items = await tx.orderItem.findMany({
        where: { orderId },
        select: { productId: true, quantity: true },
      });

      for (const item of items) {
        const updated = await tx.product.update({
          where: { id: item.productId },
          data: { stock: { decrement: item.quantity } },
          select: { stock: true, status: true },
        });
        if (updated.stock <= 0 && updated.status === ProductStatus.ACTIVE) {
          await tx.product.update({
            where: { id: item.productId },
            data: { status: ProductStatus.INACTIVE },
          });
        }
      }
      return true;
    });

    if (applied) this.logger.log(`Stock applied for order=${orderId}`);
    return applied;
  }

  /** Restore stock for an order's items exactly once (only if previously applied). */
  async restoreForOrder(orderId: string): Promise<boolean> {
    const restored = await this.prisma.$transaction(async (tx) => {
      // Claim atomically: only the first caller flips true → false.
      const claim = await tx.order.updateMany({
        where: { id: orderId, stockApplied: true },
        data: { stockApplied: false },
      });
      if (claim.count === 0) return false;

      const items = await tx.orderItem.findMany({
        where: { orderId },
        select: { productId: true, quantity: true },
      });

      for (const item of items) {
        const updated = await tx.product.update({
          where: { id: item.productId },
          data: { stock: { increment: item.quantity } },
          select: { stock: true, status: true },
        });
        if (updated.stock > 0 && updated.status === ProductStatus.INACTIVE) {
          await tx.product.update({
            where: { id: item.productId },
            data: { status: ProductStatus.ACTIVE },
          });
        }
      }
      return true;
    });

    if (restored) this.logger.log(`Stock restored for order=${orderId}`);
    return restored;
  }
}
