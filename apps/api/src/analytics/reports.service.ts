import { Injectable } from '@nestjs/common';
import { OrderStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { brazilDateKey, brazilHour, parseReportRange, REPORT_TIME_ZONE } from './report-range';

const PAID = new Set<OrderStatus>([
  OrderStatus.PAID,
  OrderStatus.SEPARATING,
  OrderStatus.SEPARATED,
  OrderStatus.READY_TO_SHIP,
  OrderStatus.SHIPPED,
  OrderStatus.DELIVERED,
]);

const number = (value: unknown) => Number(value ?? 0);
const pct = (current: number, previous: number) =>
  previous ? ((current - previous) / previous) * 100 : current ? 100 : 0;

@Injectable()
export class ReportsService {
  constructor(private readonly prisma: PrismaService) {}

  async overview(from?: string, to?: string) {
    const range = parseReportRange(from, to);
    const dateWhere = { gte: range.start, lt: range.endExclusive };
    const previousWhere = { gte: range.previousStart, lt: range.previousEndExclusive };
    const include = {
      user: { select: { id: true, name: true, email: true, createdAt: true } },
      payment: { select: { method: true, status: true } },
      items: { include: { product: { select: { category: { select: { name: true } } } } } },
    } as const;

    const [orders, previousOrders, products, customersTotal] = await Promise.all([
      this.prisma.order.findMany({
        where: { createdAt: dateWhere },
        include,
        orderBy: { createdAt: 'asc' },
      }),
      this.prisma.order.findMany({
        where: { createdAt: previousWhere, status: { in: [...PAID] } },
        select: { total: true, userId: true, items: { select: { quantity: true } } },
      }),
      this.prisma.product.findMany({
        select: {
          id: true,
          name: true,
          sku: true,
          stock: true,
          minimumStock: true,
          price: true,
          salePrice: true,
          status: true,
        },
      }),
      this.prisma.user.count({ where: { role: 'CLIENTE' } }),
    ]);

    const paid = orders.filter((order) => PAID.has(order.status));
    const revenue = paid.reduce((sum, order) => sum + number(order.total), 0);
    const previousRevenue = previousOrders.reduce((sum, order) => sum + number(order.total), 0);
    const units = paid
      .flatMap((order) => order.items)
      .reduce((sum, item) => sum + item.quantity, 0);
    const previousUnits = previousOrders
      .flatMap((order) => order.items)
      .reduce((sum, item) => sum + item.quantity, 0);

    const timeline = new Map<string, { revenue: number; orders: number; units: number }>();
    const hourly = Array.from({ length: 24 }, (_, hour) => ({ hour, revenue: 0, orders: 0 }));
    const weekdays = Array.from({ length: 7 }, (_, weekday) => ({
      weekday,
      revenue: 0,
      orders: 0,
    }));
    const channels = new Map<string, { revenue: number; orders: number }>();
    const payments = new Map<string, { revenue: number; orders: number }>();
    const status = new Map<string, number>();
    const productMap = new Map<
      string,
      { productId: string; name: string; sold: number; revenue: number }
    >();
    const categoryMap = new Map<string, { name: string; sold: number; revenue: number }>();
    const customerMap = new Map<
      string,
      { id: string; name: string; email: string; orders: number; spent: number; lastOrderAt: Date }
    >();

    for (const order of orders) status.set(order.status, (status.get(order.status) ?? 0) + 1);
    for (const order of paid) {
      const value = number(order.total);
      const key = brazilDateKey(order.createdAt);
      const day = timeline.get(key) ?? { revenue: 0, orders: 0, units: 0 };
      day.revenue += value;
      day.orders += 1;
      const hour = hourly[brazilHour(order.createdAt)];
      hour.revenue += value;
      hour.orders += 1;
      const weekday = new Date(`${key}T12:00:00Z`).getUTCDay();
      weekdays[weekday].revenue += value;
      weekdays[weekday].orders += 1;
      const channel = channels.get(order.channel) ?? { revenue: 0, orders: 0 };
      channel.revenue += value;
      channel.orders += 1;
      channels.set(order.channel, channel);
      const method = order.payment?.method ?? 'NÃO INFORMADO';
      const payment = payments.get(method) ?? { revenue: 0, orders: 0 };
      payment.revenue += value;
      payment.orders += 1;
      payments.set(method, payment);
      const customer = customerMap.get(order.userId) ?? {
        id: order.userId,
        name: order.user.name ?? 'Sem nome',
        email: order.user.email,
        orders: 0,
        spent: 0,
        lastOrderAt: order.createdAt,
      };
      customer.orders += 1;
      customer.spent += value;
      if (order.createdAt > customer.lastOrderAt) customer.lastOrderAt = order.createdAt;
      customerMap.set(order.userId, customer);
      for (const item of order.items) {
        day.units += item.quantity;
        const product = productMap.get(item.productId) ?? {
          productId: item.productId,
          name: item.name,
          sold: 0,
          revenue: 0,
        };
        product.sold += item.quantity;
        product.revenue += number(item.subtotal);
        productMap.set(item.productId, product);
        const name = item.product.category?.name ?? 'Sem categoria';
        const category = categoryMap.get(name) ?? { name, sold: 0, revenue: 0 };
        category.sold += item.quantity;
        category.revenue += number(item.subtotal);
        categoryMap.set(name, category);
      }
      timeline.set(key, day);
    }

    const customers = [...customerMap.values()].sort((a, b) => b.spent - a.spent);
    const newCustomers = new Set(
      orders
        .filter((o) => o.user.createdAt >= range.start && o.user.createdAt < range.endExclusive)
        .map((o) => o.userId),
    ).size;
    const repeatCustomers = customers.filter((customer) => customer.orders > 1).length;
    const inventoryValue = products.reduce(
      (sum, p) => sum + number(p.salePrice ?? p.price) * p.stock,
      0,
    );
    const lowStock = products
      .filter((p) => p.stock <= p.minimumStock)
      .sort((a, b) => a.stock - b.stock);

    return {
      period: { from: range.from, to: range.to, days: range.days, timeZone: REPORT_TIME_ZONE },
      sales: {
        revenue,
        paidOrders: paid.length,
        allOrders: orders.length,
        units,
        avgTicket: paid.length ? revenue / paid.length : 0,
        cancellationRate: orders.length
          ? (orders.filter(
              (o) => o.status === OrderStatus.CANCELLED || o.status === OrderStatus.REFUNDED,
            ).length /
              orders.length) *
            100
          : 0,
        comparison: {
          revenue: pct(revenue, previousRevenue),
          orders: pct(paid.length, previousOrders.length),
          units: pct(units, previousUnits),
        },
        timeline: [...timeline].map(([date, values]) => ({ date, ...values })),
        hourly,
        weekdays,
        channels: [...channels].map(([name, values]) => ({ name, ...values })),
        payments: [...payments].map(([name, values]) => ({ name, ...values })),
        status: [...status].map(([name, count]) => ({ name, count })),
      },
      products: {
        units,
        revenue,
        inventoryValue,
        active: products.filter((p) => p.status === 'ACTIVE').length,
        lowStockCount: lowStock.length,
        top: [...productMap.values()].sort((a, b) => b.revenue - a.revenue).slice(0, 20),
        categories: [...categoryMap.values()].sort((a, b) => b.revenue - a.revenue),
        lowStock: lowStock.slice(0, 20).map((p) => ({
          id: p.id,
          name: p.name,
          sku: p.sku,
          stock: p.stock,
          minimumStock: p.minimumStock,
        })),
      },
      customers: {
        total: customersTotal,
        buyers: customers.length,
        newCustomers,
        repeatCustomers,
        repeatRate: customers.length ? (repeatCustomers / customers.length) * 100 : 0,
        revenuePerBuyer: customers.length ? revenue / customers.length : 0,
        top: customers.slice(0, 20),
      },
    };
  }
}
