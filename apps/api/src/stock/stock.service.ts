import { Injectable, Logger } from '@nestjs/common';
import { ProductStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { EventBusService } from '../events/event-bus.service';
import { OmsEvents } from '../events/oms-events';

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

  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventBusService,
  ) {}

  /**
   * Reserva produtos ÚNICOS de um pedido no momento da criação, protegendo
   * contra venda duplicada entre canais. Faz a transição atômica
   * ACTIVE → RESERVED por produto: só um pedido consegue reservar cada item
   * único. Emite `product.reserved` (orchestrator pausa os outros canais).
   *
   * Produtos não-únicos seguem o fluxo normal (baixa só na aprovação do
   * pagamento via applyForOrder). Retorna os itens reservados e os conflitos
   * (únicos que já não estavam disponíveis).
   */
  async reserveForOrder(orderId: string): Promise<{ reserved: string[]; conflicts: string[] }> {
    const items = await this.prisma.orderItem.findMany({
      where: { orderId },
      select: { productId: true, product: { select: { isUnique: true } } },
    });

    const reserved: string[] = [];
    const conflicts: string[] = [];

    for (const item of items) {
      if (!item.product?.isUnique) continue;
      const claim = await this.prisma.product.updateMany({
        where: {
          id: item.productId,
          isUnique: true,
          status: ProductStatus.ACTIVE,
        },
        data: { status: ProductStatus.RESERVED },
      });
      if (claim.count > 0) {
        reserved.push(item.productId);
        this.events.emit(OmsEvents.ProductReserved, {
          productId: item.productId,
          orderId,
        });
      } else {
        conflicts.push(item.productId);
      }
    }

    if (reserved.length > 0) {
      this.logger.log(`Únicos reservados para pedido=${orderId}: ${reserved.join(', ')}`);
    }
    if (conflicts.length > 0) {
      this.logger.warn(
        `Conflito de reserva (já indisponível) pedido=${orderId}: ${conflicts.join(', ')}`,
      );
    }
    return { reserved, conflicts };
  }

  /** Decrement stock for an order's items exactly once. Returns true if applied now. */
  async applyForOrder(orderId: string): Promise<boolean> {
    const stockUpdates: Array<{ productId: string; newStock: number }> = [];

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
        stockUpdates.push({ productId: item.productId, newStock: Math.max(0, updated.stock) });
      }
      return true;
    });

    if (applied) {
      this.logger.log(`Stock applied for order=${orderId}`);
      for (const update of stockUpdates) {
        this.events.emit(OmsEvents.StockDecremented, update);
      }
    }
    return applied;
  }

  /** Restore stock for an order's items exactly once (only if previously applied). */
  async restoreForOrder(orderId: string): Promise<boolean> {
    const stockUpdates: Array<{ productId: string; newStock: number }> = [];

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
        stockUpdates.push({ productId: item.productId, newStock: Math.max(0, updated.stock) });
      }
      return true;
    });

    if (restored) {
      this.logger.log(`Stock restored for order=${orderId}`);
      // Orchestrator propaga o nível devolvido aos canais externos (ML/Shopee).
      for (const update of stockUpdates) {
        this.events.emit(OmsEvents.StockRestored, update);
      }
    }
    return restored;
  }
}
