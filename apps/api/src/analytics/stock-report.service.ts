import { Injectable } from '@nestjs/common';
import { OrderStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { brazilDateKey, parseReportRange, REPORT_TIME_ZONE } from './report-range';

const PAID = new Set<OrderStatus>([
  OrderStatus.PAID,
  OrderStatus.SEPARATING,
  OrderStatus.SEPARATED,
  OrderStatus.READY_TO_SHIP,
  OrderStatus.SHIPPED,
  OrderStatus.DELIVERED,
]);

const AGING_BUCKETS = [
  { label: '0-30 dias', max: 30 },
  { label: '31-60 dias', max: 60 },
  { label: '61-90 dias', max: 90 },
  { label: '91-180 dias', max: 180 },
  { label: '180+ dias', max: Infinity },
];

const number = (value: unknown) => Number(value ?? 0);
const DAY_MS = 86_400_000;

@Injectable()
export class StockReportService {
  constructor(private readonly prisma: PrismaService) {}

  async overview(from?: string, to?: string) {
    const range = parseReportRange(from, to);

    const [products, items] = await Promise.all([
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
          isUnique: true,
          categoryId: true,
          createdAt: true,
          category: { select: { id: true, name: true } },
        },
      }),
      this.prisma.orderItem.findMany({
        where: {
          order: {
            createdAt: { gte: range.start, lt: range.endExclusive },
            status: { in: [...PAID] },
          },
        },
        select: {
          productId: true,
          quantity: true,
          subtotal: true,
          order: { select: { createdAt: true } },
        },
      }),
    ]);

    const soldByProduct = new Map<string, { units: number; revenue: number }>();
    const timeline = new Map<string, { units: number; revenue: number }>();
    let unitsSoldInPeriod = 0;
    let revenueInPeriod = 0;
    for (const item of items) {
      const entry = soldByProduct.get(item.productId) ?? { units: 0, revenue: 0 };
      entry.units += item.quantity;
      entry.revenue += number(item.subtotal);
      soldByProduct.set(item.productId, entry);
      const key = brazilDateKey(item.order.createdAt);
      const day = timeline.get(key) ?? { units: 0, revenue: 0 };
      day.units += item.quantity;
      day.revenue += number(item.subtotal);
      timeline.set(key, day);
      unitsSoldInPeriod += item.quantity;
      revenueInPeriod += number(item.subtotal);
    }

    const now = Date.now();
    const categoryMap = new Map<
      string,
      {
        id: string;
        name: string;
        count: number;
        units: number;
        value: number;
        soldUnits: number;
        soldRevenue: number;
      }
    >();
    const statusMap = new Map<string, { count: number; units: number; value: number }>();
    const agingBuckets = AGING_BUCKETS.map((bucket) => ({
      bucket: bucket.label,
      count: 0,
      units: 0,
      value: 0,
    }));

    let totalUnits = 0;
    let valueAtPrice = 0;
    let valueAtSalePrice = 0;
    let markdownValue = 0;
    let outOfStockCount = 0;
    let lowStockCount = 0;
    let healthyStockCount = 0;
    let uniqueItemsCount = 0;
    let uniqueItemsValue = 0;

    const withValue = products.map((p) => {
      const unitPrice = number(p.salePrice ?? p.price);
      const value = unitPrice * p.stock;
      const sold = soldByProduct.get(p.id);
      const daysListed = Math.floor((now - p.createdAt.getTime()) / DAY_MS);

      totalUnits += p.stock;
      valueAtPrice += number(p.price) * p.stock;
      valueAtSalePrice += value;
      if (p.salePrice != null && number(p.salePrice) < number(p.price)) {
        markdownValue += (number(p.price) - number(p.salePrice)) * p.stock;
      }
      if (p.stock === 0) outOfStockCount += 1;
      else if (p.stock <= p.minimumStock) lowStockCount += 1;
      else healthyStockCount += 1;
      if (p.isUnique) {
        uniqueItemsCount += 1;
        uniqueItemsValue += value;
      }

      const categoryName = p.category?.name ?? 'Sem categoria';
      const categoryId = p.categoryId ?? 'sem-categoria';
      const category = categoryMap.get(categoryId) ?? {
        id: categoryId,
        name: categoryName,
        count: 0,
        units: 0,
        value: 0,
        soldUnits: 0,
        soldRevenue: 0,
      };
      category.count += 1;
      category.units += p.stock;
      category.value += value;
      category.soldUnits += sold?.units ?? 0;
      category.soldRevenue += sold?.revenue ?? 0;
      categoryMap.set(categoryId, category);

      const status = statusMap.get(p.status) ?? { count: 0, units: 0, value: 0 };
      status.count += 1;
      status.units += p.stock;
      status.value += value;
      statusMap.set(p.status, status);

      if (p.stock > 0) {
        const bucketIndex = AGING_BUCKETS.findIndex((b) => daysListed <= b.max);
        const bucket = agingBuckets[bucketIndex === -1 ? agingBuckets.length - 1 : bucketIndex];
        bucket.count += 1;
        bucket.units += p.stock;
        bucket.value += value;
      }

      return { ...p, unitPrice, value, sold, daysListed };
    });

    const topValue = [...withValue]
      .sort((a, b) => b.value - a.value)
      .slice(0, 20)
      .map((p) => ({
        id: p.id,
        name: p.name,
        sku: p.sku,
        stock: p.stock,
        unitPrice: p.unitPrice,
        value: p.value,
        category: p.category?.name ?? 'Sem categoria',
      }));

    const stagnant = withValue
      .filter((p) => p.stock > 0 && !p.sold)
      .sort((a, b) => b.value - a.value)
      .slice(0, 20)
      .map((p) => ({
        id: p.id,
        name: p.name,
        sku: p.sku,
        stock: p.stock,
        value: p.value,
        daysListed: p.daysListed,
      }));

    const lowStock = withValue
      .filter((p) => p.stock > 0 && p.stock <= p.minimumStock)
      .sort((a, b) => b.minimumStock - b.stock - (a.minimumStock - a.stock))
      .slice(0, 30)
      .map((p) => ({
        id: p.id,
        name: p.name,
        sku: p.sku,
        stock: p.stock,
        minimumStock: p.minimumStock,
        value: p.value,
      }));

    const outOfStock = withValue
      .filter((p) => p.stock === 0)
      .sort((a, b) => a.name.localeCompare(b.name))
      .slice(0, 50)
      .map((p) => ({
        id: p.id,
        name: p.name,
        sku: p.sku,
        minimumStock: p.minimumStock,
        status: p.status,
      }));

    const dailyPace = unitsSoldInPeriod / range.days;
    const daysOfInventory = dailyPace > 0 ? totalUnits / dailyPace : null;
    const sellThroughRate =
      unitsSoldInPeriod + totalUnits > 0
        ? (unitsSoldInPeriod / (unitsSoldInPeriod + totalUnits)) * 100
        : 0;

    return {
      period: { from: range.from, to: range.to, days: range.days, timeZone: REPORT_TIME_ZONE },
      summary: {
        totalSkus: products.length,
        totalUnits,
        valueAtPrice,
        valueAtSalePrice,
        markdownValue,
        avgUnitValue: totalUnits ? valueAtSalePrice / totalUnits : 0,
        outOfStockCount,
        lowStockCount,
        healthyStockCount,
        uniqueItemsCount,
        uniqueItemsValue,
      },
      turnover: {
        unitsSoldInPeriod,
        revenueInPeriod,
        sellThroughRate,
        daysOfInventory,
      },
      byCategory: [...categoryMap.values()].sort((a, b) => b.value - a.value),
      byStatus: [...statusMap.entries()]
        .map(([status, values]) => ({ status, ...values }))
        .sort((a, b) => b.value - a.value),
      aging: agingBuckets,
      topValue,
      stagnant,
      lowStock,
      outOfStock,
      timeline: [...timeline]
        .map(([date, values]) => ({ date, ...values }))
        .sort((a, b) => a.date.localeCompare(b.date)),
    };
  }
}
