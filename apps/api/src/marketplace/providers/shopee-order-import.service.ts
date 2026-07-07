import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import {
  DeliveryMethod,
  Marketplace,
  OrderStatus,
  Prisma,
  Role,
  ShipmentStatus,
  SyncAction,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { StockService } from '../../stock/stock.service';
import { NotificationsService } from '../../notifications/notifications.service';
import { EventBusService } from '../../events/event-bus.service';
import { OmsEvents } from '../../events/oms-events';
import { QueueService } from '../../queue/queue.service';
import { QueueNames } from '../../queue/queue.types';
import { recordOrderEvent } from '../../common/order-timeline';
import { ShopeeTokenService } from './shopee-token.service';

interface ShopeeOrderItem {
  item_id?: number;
  item_name?: string;
  item_sku?: string;
  model_sku?: string;
  model_quantity_purchased?: number;
  model_discounted_price?: number;
  model_original_price?: number;
}

interface ShopeeAddress {
  name?: string;
  phone?: string;
  full_address?: string;
  district?: string;
  city?: string;
  state?: string;
  zipcode?: string;
}

interface ShopeeOrderDetail {
  order_sn: string;
  order_status?: string;
  total_amount?: number;
  buyer_username?: string;
  recipient_address?: ShopeeAddress;
  item_list?: ShopeeOrderItem[];
  shipping_carrier?: string;
}

export interface ImportResult {
  imported: boolean;
  orderId?: string;
  reason?: string;
}

// Status Shopee que significam "pago, pronto para expedir" (importáveis).
const IMPORTABLE_STATUSES = new Set(['READY_TO_SHIP', 'PROCESSED', 'SHIPPED', 'COMPLETED']);

/**
 * Importa pedidos vendidos na Shopee para dentro do OMS — mesmo papel do
 * MlOrderImportService, adaptado ao modelo de pedidos da Shopee (order_sn em
 * vez de id numérico, order_status já reflete o estado do envio).
 */
@Injectable()
export class ShopeeOrderImportService {
  private readonly logger = new Logger(ShopeeOrderImportService.name);

  private static readonly CHANNEL_USER_EMAIL = 'shopee@marketplace.local';

  constructor(
    private readonly tokens: ShopeeTokenService,
    private readonly prisma: PrismaService,
    private readonly stock: StockService,
    private readonly notifications: NotificationsService,
    private readonly events: EventBusService,
    private readonly queue: QueueService,
  ) {}

  // ── Importação de um pedido ────────────────────────────────────────────────

  async importByOrderSn(orderSn: string): Promise<ImportResult> {
    const existing = await this.prisma.order.findUnique({
      where: { channel_externalId: { channel: Marketplace.SHOPEE, externalId: orderSn } },
      select: { id: true },
    });
    if (existing) {
      await this.syncStatus(orderSn).catch(() => undefined);
      return { imported: false, orderId: existing.id, reason: 'já importado' };
    }

    const order = await this.fetchOrderDetail(orderSn);
    if (!order) {
      throw new Error(`Shopee: não foi possível buscar o pedido ${orderSn}`);
    }

    if (!IMPORTABLE_STATUSES.has(order.order_status ?? '')) {
      return { imported: false, reason: `status "${order.order_status}" ainda não pago/pronto` };
    }

    const items = order.item_list ?? [];
    if (!items.length) return { imported: false, reason: 'pedido sem itens' };

    const resolved = await this.resolveItems(items);
    if (resolved.unmatched.length) {
      const titles = resolved.unmatched.join('; ');
      await this.notifyImportBlocked(orderSn, titles);
      return { imported: false, reason: `produto(s) não encontrado(s): ${titles}` };
    }

    const address = order.recipient_address;
    const userId = await this.ensureChannelUser();
    const subtotal = resolved.lines.reduce((acc, l) => acc + l.price * l.quantity, 0);
    const total = order.total_amount ?? subtotal;
    const buyerName = address?.name || order.buyer_username || 'Comprador Shopee';

    let created: { id: string };
    try {
      created = await this.prisma.$transaction(async (tx) => {
        const newOrder = await tx.order.create({
          data: {
            userId,
            channel: Marketplace.SHOPEE,
            externalId: orderSn,
            externalReference: orderSn,
            status: OrderStatus.PAID,
            deliveryMethod: DeliveryMethod.SHIPPING,
            subtotal: round2(subtotal),
            discount: 0,
            shipping: 0,
            total: round2(total),
            shippingAddress: this.mapAddress(address) as unknown as Prisma.InputJsonValue,
            shippingMethod: order.shipping_carrier
              ? `Shopee (${order.shipping_carrier})`
              : 'Shopee',
            buyerName,
            stockApplied: false,
            items: {
              create: resolved.lines.map((l) => ({
                productId: l.productId,
                name: l.name,
                sku: l.sku,
                price: l.price,
                quantity: l.quantity,
                subtotal: round2(l.price * l.quantity),
              })),
            },
          },
        });

        await tx.shipment.create({
          data: {
            orderId: newOrder.id,
            externalId: orderSn,
            carrier: 'Shopee',
            service: order.shipping_carrier ?? 'Shopee',
            serviceId: 0,
            trackingCode: null,
            status: ShipmentStatus.PENDING,
            price: 0,
          },
        });

        return newOrder;
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        return { imported: false, reason: 'já importado (corrida)' };
      }
      throw err;
    }

    await recordOrderEvent(this.prisma, {
      orderId: created.id,
      status: OrderStatus.PAID,
      title: 'Pedido importado da Shopee',
      description: `Pedido Shopee #${orderSn}`,
    });

    await this.stock.applyForOrder(created.id).catch((err) => {
      this.logger.error(`Falha ao baixar estoque do pedido Shopee ${created.id}`, err as Error);
    });
    await this.propagateStock(resolved.lines.map((l) => l.productId));
    this.events.emit(OmsEvents.OrderPaid, { orderId: created.id });

    await this.notifyNewOrder(created.id, orderSn, buyerName);
    this.logger.log(`Shopee: pedido ${orderSn} importado como ${created.id}`);
    return { imported: true, orderId: created.id };
  }

  /** Reflete o order_status atual da Shopee no pedido/envio interno. */
  async syncStatus(orderSn: string): Promise<void> {
    const order = await this.fetchOrderDetail(orderSn);
    if (!order) return;

    const local = await this.prisma.shipment.findFirst({
      where: { externalId: orderSn, carrier: 'Shopee' },
      include: { order: { select: { id: true, status: true } } },
    });
    if (!local?.order) return;

    const mapped = mapOrderStatus(order.order_status);
    if (!mapped) return;

    if (mapped.shipment !== local.status) {
      await this.prisma.shipment.update({
        where: { id: local.id },
        data: {
          status: mapped.shipment,
          ...(mapped.shipment === ShipmentStatus.SHIPPED && !local.shippedAt
            ? { shippedAt: new Date() }
            : {}),
          ...(mapped.shipment === ShipmentStatus.DELIVERED ? { deliveredAt: new Date() } : {}),
        },
      });
    }
    if (mapped.order && local.order.status !== mapped.order) {
      await this.prisma.order.update({
        where: { id: local.order.id },
        data: { status: mapped.order },
      });
      await recordOrderEvent(this.prisma, {
        orderId: local.order.id,
        status: mapped.order,
        dedupe: true,
      });
    }
  }

  // ── Etiqueta (PDF) ──────────────────────────────────────────────────────────

  /**
   * Baixa o PDF da etiqueta de envio da Shopee. A Shopee gera o documento de
   * forma assíncrona: primeiro pedimos a criação, depois baixamos. Se o
   * documento ainda não estiver pronto, orienta a tentar novamente em alguns
   * segundos (comportamento normal da API da Shopee).
   */
  async getLabelPdf(internalOrderId: string): Promise<{ buffer: Buffer; contentType: string }> {
    const shipment = await this.prisma.shipment.findUnique({
      where: { orderId: internalOrderId },
      select: { externalId: true },
    });
    if (!shipment?.externalId) {
      throw new BadRequestException('Pedido sem envio da Shopee vinculado.');
    }
    const orderSn = shipment.externalId;

    await this.post('/api/v2/logistics/create_shipping_document', {
      order_list: [{ order_sn: orderSn }],
    }).catch(() => undefined);

    const built = await this.tokens.buildAuthenticatedUrl(
      '/api/v2/logistics/download_shipping_document',
    );
    if (!built) throw new BadRequestException('Shopee não conectada.');

    const res = await fetch(built.url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ order_list: [{ order_sn: orderSn }] }),
    });
    const contentType = res.headers.get('content-type') ?? '';
    if (!res.ok || !contentType.includes('pdf')) {
      const body = await res.text().catch(() => '');
      throw new BadRequestException(
        `Shopee: etiqueta ainda não disponível — tente novamente em alguns segundos. ${body.slice(0, 200)}`,
      );
    }
    const arrayBuffer = await res.arrayBuffer();
    return { buffer: Buffer.from(arrayBuffer), contentType: 'application/pdf' };
  }

  // ── Reconciliação periódica ─────────────────────────────────────────────────

  @Cron(CronExpression.EVERY_30_MINUTES)
  async reconcileRecent(): Promise<void> {
    if (!(await this.tokens.isConnected())) return;
    try {
      const orderSns = await this.fetchRecentOrderSns();
      let imported = 0;
      for (const sn of orderSns) {
        try {
          const result = await this.importByOrderSn(sn);
          if (result.imported) imported++;
        } catch (err) {
          this.logger.warn(`Reconcile: pedido ${sn} falhou: ${(err as Error).message}`);
        }
      }
      if (imported) this.logger.log(`Shopee reconcile: ${imported} pedido(s) novo(s) importado(s)`);
    } catch (err) {
      this.logger.warn('Shopee reconcile: busca de pedidos recentes falhou', err as Error);
    }
  }

  // ── HTTP da Shopee ──────────────────────────────────────────────────────────

  private async fetchOrderDetail(orderSn: string): Promise<ShopeeOrderDetail | null> {
    const fields =
      'item_list,recipient_address,total_amount,buyer_username,order_status,shipping_carrier';
    const data = await this.get<{ order_list?: ShopeeOrderDetail[] }>(
      '/api/v2/order/get_order_detail',
      { order_sn_list: orderSn, response_optional_fields: fields },
    );
    return data?.order_list?.[0] ?? null;
  }

  private async fetchRecentOrderSns(): Promise<string[]> {
    const now = Math.floor(Date.now() / 1000);
    const data = await this.get<{ order_list?: Array<{ order_sn: string }> }>(
      '/api/v2/order/get_order_list',
      {
        time_range_field: 'create_time',
        time_from: String(now - 24 * 60 * 60),
        time_to: String(now),
        page_size: '50',
      },
    );
    return (data?.order_list ?? []).map((o) => o.order_sn);
  }

  private async get<T>(path: string, params: Record<string, string>): Promise<T | null> {
    const built = await this.tokens.buildAuthenticatedUrl(path, params);
    if (!built) return null;
    const res = await fetch(built.url);
    if (!res.ok) {
      this.logger.warn(`Shopee GET ${path}: HTTP ${res.status}`);
      return null;
    }
    const data = (await res.json().catch(() => null)) as { response?: T } | null;
    return data?.response ?? null;
  }

  private async post<T>(path: string, body: unknown): Promise<T | null> {
    const built = await this.tokens.buildAuthenticatedUrl(path);
    if (!built) return null;
    const res = await fetch(built.url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      this.logger.warn(`Shopee POST ${path}: HTTP ${res.status}`);
      return null;
    }
    const data = (await res.json().catch(() => null)) as { response?: T } | null;
    return data?.response ?? null;
  }

  // ── Mapeamento ─────────────────────────────────────────────────────────────

  private async resolveItems(items: ShopeeOrderItem[]): Promise<{
    lines: { productId: string; name: string; sku: string; price: number; quantity: number }[];
    unmatched: string[];
  }> {
    const lines: {
      productId: string;
      name: string;
      sku: string;
      price: number;
      quantity: number;
    }[] = [];
    const unmatched: string[] = [];

    for (const it of items) {
      const externalItemId = it.item_id ? String(it.item_id) : null;
      const sku = it.model_sku || it.item_sku || null;
      let product: { id: string; sku: string } | null = null;

      if (externalItemId) {
        const pub = await this.prisma.marketplacePublication.findFirst({
          where: { marketplace: Marketplace.SHOPEE, externalId: externalItemId },
          select: { product: { select: { id: true, sku: true } } },
        });
        product = pub?.product ?? null;
      }
      if (!product && sku) {
        product = await this.prisma.product.findUnique({
          where: { sku },
          select: { id: true, sku: true },
        });
      }
      if (!product) {
        unmatched.push(it.item_name ?? externalItemId ?? sku ?? 'item desconhecido');
        continue;
      }

      lines.push({
        productId: product.id,
        name: it.item_name ?? product.sku,
        sku: sku ?? product.sku,
        price: it.model_discounted_price ?? it.model_original_price ?? 0,
        quantity: it.model_quantity_purchased ?? 1,
      });
    }

    return { lines, unmatched };
  }

  private mapAddress(addr?: ShopeeAddress): Record<string, string> {
    if (!addr) return {};
    return {
      name: addr.name ?? '',
      street: addr.full_address ?? '',
      number: '',
      complement: '',
      neighborhood: addr.district ?? '',
      city: addr.city ?? '',
      state: addr.state ?? '',
      cep: (addr.zipcode ?? '').replace(/\D/g, ''),
      phone: addr.phone ?? '',
    };
  }

  private async ensureChannelUser(): Promise<string> {
    const email = ShopeeOrderImportService.CHANNEL_USER_EMAIL;
    const existing = await this.prisma.user.findUnique({ where: { email }, select: { id: true } });
    if (existing) return existing.id;
    const created = await this.prisma.user.create({
      data: {
        email,
        name: 'Shopee',
        role: Role.CLIENTE,
        isActive: false,
        passwordHash: 'marketplace-system-account',
      },
      select: { id: true },
    });
    return created.id;
  }

  private async propagateStock(productIds: string[]): Promise<void> {
    for (const productId of new Set(productIds)) {
      const product = await this.prisma.product.findUnique({
        where: { id: productId },
        select: { stock: true, isUnique: true },
      });
      if (!product || product.isUnique) continue;

      const pubs = await this.prisma.marketplacePublication.findMany({
        where: {
          productId,
          marketplace: { notIn: [Marketplace.SITE, Marketplace.SHOPEE] },
          status: { in: ['PUBLISHED', 'PAUSED', 'SYNC_PENDING'] },
        },
        select: { marketplace: true },
      });
      for (const { marketplace } of pubs) {
        await this.queue.enqueue(QueueNames.MarketplaceSync, {
          productId,
          marketplace,
          action: SyncAction.UPDATE_STOCK,
          value: product.stock,
        });
      }
    }
  }

  private async notifyNewOrder(orderId: string, orderSn: string, buyerName: string): Promise<void> {
    await this.notifications
      .notify({
        role: Role.VENDEDOR,
        type: 'SHOPEE_ORDER_IMPORTED',
        title: 'Novo pedido — Shopee',
        message: `Pedido Shopee #${orderSn} (${buyerName}) entrou na fila de expedição.`,
        orderId,
      })
      .catch(() => undefined);
  }

  private async notifyImportBlocked(orderSn: string, titles: string): Promise<void> {
    await this.notifications
      .notify({
        role: Role.ADMIN,
        type: 'SHOPEE_ORDER_IMPORT_BLOCKED',
        title: 'Pedido Shopee não importado',
        message: `Pedido Shopee #${orderSn} não pôde entrar: produto(s) sem correspondência no catálogo (${titles}). Cadastre/publique e reprocesse.`,
      })
      .catch(() => undefined);
  }
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function mapOrderStatus(
  status?: string,
): { shipment: ShipmentStatus; order: OrderStatus | null } | null {
  switch (status) {
    case 'READY_TO_SHIP':
    case 'PROCESSED':
      return { shipment: ShipmentStatus.LABEL_PURCHASED, order: null };
    case 'SHIPPED':
      return { shipment: ShipmentStatus.SHIPPED, order: OrderStatus.SHIPPED };
    case 'COMPLETED':
      return { shipment: ShipmentStatus.DELIVERED, order: OrderStatus.DELIVERED };
    case 'CANCELLED':
    case 'IN_CANCEL':
      return { shipment: ShipmentStatus.CANCELLED, order: null };
    default:
      return null;
  }
}
