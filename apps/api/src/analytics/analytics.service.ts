import { Injectable } from '@nestjs/common';
import { OrderStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { brazilDateKey, startOfBrazilDay, startOfBrazilMonth } from './report-range';

// Statuses that represent a paid sale (counted as revenue). Covers the whole
// post-payment pipeline — once a payment is approved the order moves through the
// fulfillment flow (PAID → SEPARATING → SEPARATED → READY_TO_SHIP → SHIPPED →
// DELIVERED), all of which are real sales. Only PENDING/CANCELLED/REFUNDED are out.
const PAID = [
  OrderStatus.PAID,
  OrderStatus.SEPARATING,
  OrderStatus.SEPARATED,
  OrderStatus.READY_TO_SHIP,
  OrderStatus.SHIPPED,
  OrderStatus.DELIVERED,
];

@Injectable()
export class AnalyticsService {
  constructor(private readonly prisma: PrismaService) {}

  async getAdminOverview() {
    const now = new Date();
    const today = startOfBrazilDay(now);
    const monthStart = startOfBrazilMonth(now);
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
      allProducts,
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
      this.prisma.product.findMany({
        select: { price: true, salePrice: true, stock: true },
      }),
    ]);

    const chartMap = new Map<string, { revenue: number; orders: number }>();
    for (const o of chartOrders) {
      const date = brazilDateKey(o.createdAt);
      const prev = chartMap.get(date) ?? { revenue: 0, orders: 0 };
      chartMap.set(date, { revenue: prev.revenue + o.total.toNumber(), orders: prev.orders + 1 });
    }

    const inventoryValue = allProducts.reduce((sum, p) => {
      const price = (p.salePrice ?? p.price) as unknown as { toNumber(): number };
      return sum + price.toNumber() * p.stock;
    }, 0);

    return {
      inventoryValue,
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

  async getSellerOverview(sellerId: string, days = 30) {
    const now = new Date();
    const today = startOfBrazilDay(now);
    const since = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
    const prevSince = new Date(since.getTime() - days * 24 * 60 * 60 * 1000);

    const sellerItemsWhere = {
      product: { createdById: sellerId },
      order: { status: { in: PAID } },
    };

    const [
      revenueToday,
      revenuePeriodAgg,
      revenuePrevPeriodAgg,
      unitsPeriodAgg,
      topProducts,
      recentItems,
      chartItems,
      periodOrders,
      statusOrders,
      ordersTodayCount,
    ] = await Promise.all([
      this.prisma.orderItem.aggregate({
        where: { ...sellerItemsWhere, order: { status: { in: PAID }, createdAt: { gte: today } } },
        _sum: { subtotal: true },
      }),
      this.prisma.orderItem.aggregate({
        where: { ...sellerItemsWhere, order: { status: { in: PAID }, createdAt: { gte: since } } },
        _sum: { subtotal: true },
      }),
      this.prisma.orderItem.aggregate({
        where: {
          ...sellerItemsWhere,
          order: { status: { in: PAID }, createdAt: { gte: prevSince, lt: since } },
        },
        _sum: { subtotal: true },
      }),
      this.prisma.orderItem.aggregate({
        where: { ...sellerItemsWhere, order: { status: { in: PAID }, createdAt: { gte: since } } },
        _sum: { quantity: true },
      }),
      this.prisma.orderItem.groupBy({
        by: ['productId', 'name'],
        where: sellerItemsWhere,
        _sum: { quantity: true, subtotal: true },
        orderBy: { _sum: { quantity: 'desc' } },
        take: 10,
      }),
      this.prisma.orderItem.findMany({
        where: sellerItemsWhere,
        include: {
          order: {
            select: {
              id: true,
              status: true,
              createdAt: true,
              user: { select: { name: true, email: true } },
            },
          },
        },
        orderBy: { order: { createdAt: 'desc' } },
        take: 10,
      }),
      this.prisma.orderItem.findMany({
        where: { ...sellerItemsWhere, order: { status: { in: PAID }, createdAt: { gte: since } } },
        select: { subtotal: true, orderId: true, order: { select: { createdAt: true } } },
      }),
      // Distinct orders touching this seller's products, for order-count and status breakdown.
      this.prisma.order.findMany({
        where: {
          items: { some: { product: { createdById: sellerId } } },
          createdAt: { gte: since },
        },
        select: { id: true, status: true },
      }),
      this.prisma.order.findMany({
        where: { items: { some: { product: { createdById: sellerId } } } },
        select: { status: true },
      }),
      this.prisma.order.count({
        where: {
          items: { some: { product: { createdById: sellerId } } },
          createdAt: { gte: today },
        },
      }),
    ]);

    const chartMap = new Map<string, { revenue: number; orderIds: Set<string> }>();
    for (const item of chartItems) {
      const date = brazilDateKey(item.order.createdAt);
      const prev = chartMap.get(date) ?? { revenue: 0, orderIds: new Set<string>() };
      prev.revenue += (item.subtotal as unknown as { toNumber(): number }).toNumber();
      prev.orderIds.add(item.orderId);
      chartMap.set(date, prev);
    }
    const revenueChart: { date: string; revenue: number; orders: number }[] = [];
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
      const date = brazilDateKey(d);
      const entry = chartMap.get(date);
      revenueChart.push({ date, revenue: entry?.revenue ?? 0, orders: entry?.orderIds.size ?? 0 });
    }

    const statusMap = new Map<string, number>();
    for (const o of statusOrders) statusMap.set(o.status, (statusMap.get(o.status) ?? 0) + 1);

    const revenuePeriod =
      (revenuePeriodAgg._sum.subtotal as unknown as { toNumber(): number } | null)?.toNumber() ?? 0;
    const revenuePrevPeriod =
      (
        revenuePrevPeriodAgg._sum.subtotal as unknown as { toNumber(): number } | null
      )?.toNumber() ?? 0;
    const totalOrders = periodOrders.length;

    return {
      period: { days, since: since.toISOString(), until: now.toISOString() },
      revenueToday:
        (revenueToday._sum.subtotal as unknown as { toNumber(): number } | null)?.toNumber() ?? 0,
      revenueMonth: revenuePeriod,
      revenuePeriod,
      revenuePrevPeriod,
      revenueChangePct:
        revenuePrevPeriod > 0
          ? ((revenuePeriod - revenuePrevPeriod) / revenuePrevPeriod) * 100
          : null,
      totalOrders,
      ordersToday: ordersTodayCount,
      ordersTotal: statusOrders.length,
      totalUnitsSold: unitsPeriodAgg._sum.quantity ?? 0,
      avgTicket: totalOrders > 0 ? revenuePeriod / totalOrders : 0,
      ordersByStatus: Array.from(statusMap.entries()).map(([status, count]) => ({
        status,
        count,
      })),
      topProducts: topProducts.map((p) => ({
        productId: p.productId,
        name: p.name,
        sold: p._sum.quantity ?? 0,
        revenue: (p._sum.subtotal as unknown as { toNumber(): number } | null)?.toNumber() ?? 0,
      })),
      recentOrders: recentItems.map((item) => ({
        orderId: item.orderId,
        orderStatus: item.order.status,
        createdAt: item.order.createdAt,
        customer: item.order.user,
        product: item.name,
        quantity: item.quantity,
        subtotal: (item.subtotal as unknown as { toNumber(): number }).toNumber(),
      })),
      revenueChart,
    };
  }

  async getMarketingOverview(days = 30) {
    const now = new Date();
    const since = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);

    const [
      purchasesAgg,
      revenueAgg,
      avgTicketAgg,
      activeProducts,
      topSelling,
      topRevenue,
      chartOrders,
      catalogSynced,
      catalogErrors,
      lastCatalogSync,
      capiPurchases,
      conversionsByDay,
    ] = await Promise.all([
      // Compras no período
      this.prisma.order.count({ where: { status: { in: PAID }, createdAt: { gte: since } } }),
      // Receita no período
      this.prisma.order.aggregate({
        where: { status: { in: PAID }, createdAt: { gte: since } },
        _sum: { total: true },
      }),
      // Ticket médio
      this.prisma.order.aggregate({
        where: { status: { in: PAID }, createdAt: { gte: since } },
        _avg: { total: true },
      }),
      // Produtos ativos
      this.prisma.product.count({ where: { status: 'ACTIVE' } }),
      // Top 10 mais vendidos (quantidade)
      this.prisma.orderItem.groupBy({
        by: ['productId', 'name'],
        where: { order: { status: { in: PAID } } },
        _sum: { quantity: true, subtotal: true },
        orderBy: { _sum: { quantity: 'desc' } },
        take: 10,
      }),
      // Top 5 por receita
      this.prisma.orderItem.groupBy({
        by: ['productId', 'name'],
        where: { order: { status: { in: PAID } } },
        _sum: { quantity: true, subtotal: true },
        orderBy: { _sum: { subtotal: 'desc' } },
        take: 5,
      }),
      // Pedidos por dia (para gráficos)
      this.prisma.order.findMany({
        where: { status: { in: PAID }, createdAt: { gte: since } },
        select: { createdAt: true, total: true },
        orderBy: { createdAt: 'asc' },
      }),
      // Meta Catalog — sincronizados
      this.prisma.metaCatalogSync.count({ where: { status: 'SYNCED' } }),
      // Meta Catalog — erros
      this.prisma.metaCatalogSync.count({ where: { status: 'ERROR' } }),
      // Meta Catalog — última sync
      this.prisma.metaCatalogSync.findFirst({
        where: { status: 'SYNCED' },
        orderBy: { syncedAt: 'desc' },
        select: { syncedAt: true },
      }),
      // CAPI: pagamentos aprovados = Purchase enviados ao Meta
      this.prisma.payment.count({
        where: { status: 'APPROVED', updatedAt: { gte: since } },
      }),
      // Conversões por dia (pagamentos aprovados)
      this.prisma.payment.findMany({
        where: { status: 'APPROVED', updatedAt: { gte: since } },
        select: { updatedAt: true, amount: true },
        orderBy: { updatedAt: 'asc' },
      }),
    ]);

    // Build chart data: revenue + orders + conversions per day
    const revenueMap = new Map<string, { revenue: number; orders: number; conversions: number }>();
    for (const o of chartOrders) {
      const date = brazilDateKey(o.createdAt);
      const prev = revenueMap.get(date) ?? { revenue: 0, orders: 0, conversions: 0 };
      revenueMap.set(date, {
        revenue: prev.revenue + o.total.toNumber(),
        orders: prev.orders + 1,
        conversions: prev.conversions,
      });
    }
    for (const p of conversionsByDay) {
      const date = brazilDateKey(p.updatedAt);
      const prev = revenueMap.get(date) ?? { revenue: 0, orders: 0, conversions: 0 };
      revenueMap.set(date, { ...prev, conversions: prev.conversions + 1 });
    }

    // Fill all days in range (so chart shows 0 days too)
    const chartData: { date: string; revenue: number; orders: number; conversions: number }[] = [];
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
      const date = brazilDateKey(d);
      const entry = revenueMap.get(date) ?? { revenue: 0, orders: 0, conversions: 0 };
      chartData.push({ date, ...entry });
    }

    return {
      period: { days, since: since.toISOString(), until: now.toISOString() },
      // Métricas principais
      purchases: purchasesAgg,
      revenue: revenueAgg._sum.total?.toNumber() ?? 0,
      avgTicket: avgTicketAgg._avg.total?.toNumber() ?? 0,
      activeProducts,
      // Produtos
      topSelling: topSelling.map((p) => ({
        productId: p.productId,
        name: p.name,
        sold: p._sum.quantity ?? 0,
        revenue: (p._sum.subtotal as unknown as { toNumber(): number } | null)?.toNumber() ?? 0,
      })),
      topByRevenue: topRevenue.map((p) => ({
        productId: p.productId,
        name: p.name,
        sold: p._sum.quantity ?? 0,
        revenue: (p._sum.subtotal as unknown as { toNumber(): number } | null)?.toNumber() ?? 0,
      })),
      // Meta
      meta: {
        catalogSynced,
        catalogErrors,
        lastCatalogSync: lastCatalogSync?.syncedAt ?? null,
        capiPurchases,
      },
      // Gráfico
      chart: chartData,
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
