import { Injectable } from '@nestjs/common';
import {
  Marketplace,
  OrderStatus,
  PaymentStatus,
  ProductStatus,
  PublicationStatus,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { QueueService } from '../queue/queue.service';
import { QueueNames } from '../queue/queue.types';

/** Status de pedido que ainda exigem separação no estoque. */
const AWAITING_SEPARATION: OrderStatus[] = [OrderStatus.PAID, OrderStatus.SEPARATING];

@Injectable()
export class OmsDashboardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly queue: QueueService,
  ) {}

  async summary() {
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    const [
      ordersToday,
      paymentsApprovedToday,
      productsSold,
      awaitingSeparation,
      publicationErrors,
      activeByMarketplace,
      revenueAgg,
      deadPublish,
      deadSync,
    ] = await Promise.all([
      this.prisma.order.count({ where: { createdAt: { gte: startOfDay } } }),
      this.prisma.payment.count({
        where: { status: PaymentStatus.APPROVED, updatedAt: { gte: startOfDay } },
      }),
      this.prisma.product.count({ where: { status: ProductStatus.SOLD } }),
      this.prisma.order.count({ where: { status: { in: AWAITING_SEPARATION } } }),
      this.prisma.marketplacePublication.count({
        where: { status: PublicationStatus.FAILED },
      }),
      this.prisma.marketplacePublication.groupBy({
        by: ['marketplace'],
        where: { status: PublicationStatus.PUBLISHED },
        _count: { _all: true },
      }),
      this.prisma.payment.aggregate({
        _sum: { amount: true },
        where: { status: PaymentStatus.APPROVED, updatedAt: { gte: startOfDay } },
      }),
      this.queue.countDead(QueueNames.MarketplacePublish),
      this.queue.countDead(QueueNames.MarketplaceSync),
    ]);

    const activeProductsByMarketplace: Record<Marketplace, number> = {
      [Marketplace.SITE]: 0,
      [Marketplace.MERCADO_LIVRE]: 0,
      [Marketplace.SHOPEE]: 0,
    };
    for (const row of activeByMarketplace) {
      activeProductsByMarketplace[row.marketplace] = row._count._all;
    }

    const criticalAlerts = this.buildAlerts({
      publicationErrors,
      deadLetterJobs: deadPublish + deadSync,
    });

    return {
      ordersToday,
      paymentsApprovedToday,
      productsSold,
      awaitingSeparation,
      publicationErrors,
      activeProductsByMarketplace,
      revenueToday: revenueAgg._sum.amount?.toNumber() ?? 0,
      criticalAlerts,
    };
  }

  private buildAlerts(input: {
    publicationErrors: number;
    deadLetterJobs: number;
  }): { level: 'warning' | 'error'; message: string }[] {
    const alerts: { level: 'warning' | 'error'; message: string }[] = [];
    if (input.publicationErrors > 0) {
      alerts.push({
        level: 'error',
        message: `${input.publicationErrors} publicação(ões) com erro em marketplaces.`,
      });
    }
    if (input.deadLetterJobs > 0) {
      alerts.push({
        level: 'warning',
        message: `${input.deadLetterJobs} job(s) na dead-letter aguardando análise.`,
      });
    }
    return alerts;
  }
}
