import { Injectable } from '@nestjs/common';
import { OrderStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

function startOfDay(d: Date): Date {
  const r = new Date(d);
  r.setHours(0, 0, 0, 0);
  return r;
}

function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

const PAID = [OrderStatus.PAID, OrderStatus.SHIPPED, OrderStatus.DELIVERED];

@Injectable()
export class AnalyticsService {
  constructor(private readonly prisma: PrismaService) {}

  async getAdminOverview() {
    const now = new Date();
    const today = startOfDay(now);
    const monthStart = startOfMonth(now);
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    const [
      revToday,
      revMonth,
      avgTicketAgg,
      productsSoldAgg,
      ordersToday,
      ordersMonth,
      ordersTotal,
      ordersByStatus,
      recentOrders,
      topProducts,
      chartOrders,
    ] = await Promise.all([
      this.prisma.order.aggregate({
        where: { status: { in: PAID }, createdAt: { gte: today } },
        _sum: { total: true },
      }),
      this.prisma.order.aggregate({
        where: { status: { in: PAID }, createdAt: { gte: monthStart } },
        _sum: { total: true },
      }),
      this.prisma.order.aggregate({
        where: { status: { in: PAID } },
        _avg: { total: true },
      }),
      this.prisma.orderItem.aggregate({
        where: { order: { status: { in: PAID } } },
        _sum: { quantity: true },
      }),
      this.prisma.order.count({ where: { createdAt: { gte: today } } }),
      this.prisma.order.count({ where: { createdAt: { gte: monthStart } } }),
      this.prisma.order.count(),
      this.prisma.order.groupBy({ by: ['status'], _count: { _all: true } }),
      this.prisma.order.findMany({
        take: 10,
        orderBy: { createdAt: 'desc' },
        include: {
          user: { select: { name: true, email: true } },
          items: { select: { name: true, quantity: true } },
          payment: { select: { method: true, status: true } },
        },
      }),
      this.prisma.orderItem.groupBy({
        by: ['productId', 'name'],
        where: { order: { status: { in: PAID } } },
        _sum: { quantity: true, subtotal: true },
        orderBy: { _sum: { quantity: 'desc' } },
        take: 5,
      }),
      this.prisma.order.findMany({
        where: { status: { in: PAID }, createdAt: { gte: thirtyDaysAgo } },
        select: { createdAt: true, total: true },
        orderBy: { createdAt: 'asc' },
      }),
    ]);

    const chartMap = new Map<string, { revenue: number; orders: number }>();
    for (const o of chartOrders) {
      const date = o.createdAt.toISOString().split('T')[0];
      const prev = chartMap.get(date) ?? { revenue: 0, orders: 0 };
      chartMap.set(date, { revenue: prev.revenue + o.total.toNumber(), orders: prev.orders + 1 });
    }

    return {
      revenueToday: revToday._sum.total?.toNumber() ?? 0,
      revenueMonth: revMonth._sum.total?.toNumber() ?? 0,
      avgTicket: avgTicketAgg._avg.total?.toNumber() ?? 0,
      productsSold: productsSoldAgg._sum.quantity ?? 0,
      ordersToday,
      ordersMonth,
      ordersTotal,
      ordersByStatus: ordersByStatus.map((s) => ({ status: s.status, count: s._count._all })),
      recentOrders: recentOrders.map((o) => ({
        id: o.id,
        status: o.status,
        total: o.total.toNumber(),
        createdAt: o.createdAt,
        user: o.user,
        payment: o.payment,
        itemCount: o.items.length,
      })),
      topProducts: topProducts.map((p) => ({
        productId: p.productId,
        name: p.name,
        sold: p._sum.quantity ?? 0,
        revenue: (p._sum.subtotal as unknown as { toNumber(): number } | null)?.toNumber() ?? 0,
      })),
      revenueChart: Array.from(chartMap.entries())
        .map(([date, v]) => ({ date, ...v }))
        .sort((a, b) => a.date.localeCompare(b.date)),
    };
  }

  async getCustomerOverview(userId: string) {
    const [totalOrders, totalSpentAgg, avgTicketAgg, pendingOrders, ordersByStatus, recentOrders] =
      await Promise.all([
        this.prisma.order.count({ where: { userId } }),
        this.prisma.order.aggregate({
          where: { userId, status: { in: PAID } },
          _sum: { total: true },
        }),
        this.prisma.order.aggregate({
          where: { userId, status: { in: PAID } },
          _avg: { total: true },
        }),
        this.prisma.order.count({ where: { userId, status: OrderStatus.PENDING } }),
        this.prisma.order.groupBy({
          by: ['status'],
          where: { userId },
          _count: { _all: true },
        }),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (this.prisma as any).order.findMany({
          where: { userId },
          take: 10,
          orderBy: { createdAt: 'desc' },
          include: {
            items: { select: { name: true, quantity: true } },
            payment: { select: { method: true, status: true } },
            shipment: { select: { status: true, carrier: true, trackingCode: true } },
          },
        }),
      ]);

    return {
      totalOrders,
      totalSpent: totalSpentAgg._sum.total?.toNumber() ?? 0,
      avgTicket: avgTicketAgg._avg.total?.toNumber() ?? 0,
      pendingOrders,
      ordersByStatus: ordersByStatus.map((s) => ({ status: s.status, count: s._count._all })),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      recentOrders: (recentOrders as any[]).map((o: any) => ({
        id: o.id,
        status: o.status,
        total: o.total.toNumber(),
        createdAt: o.createdAt,
        itemCount: o.items.length,
        payment: o.payment,
        shipment: o.shipment,
      })),
    };
  }
}
