import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
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
import { MlTokenService } from './ml-token.service';

/** Item de um pedido do Mercado Livre (formato da API /orders/{id}). */
interface MlOrderItem {
  item: { id?: string; title?: string; seller_sku?: string; seller_custom_field?: string };
  quantity: number;
  unit_price: number;
}

interface MlOrder {
  id: number | string;
  status?: string;
  date_created?: string;
  total_amount?: number;
  paid_amount?: number;
  order_items?: MlOrderItem[];
  buyer?: { id?: number; nickname?: string; first_name?: string; last_name?: string };
  shipping?: { id?: number | string };
}

interface MlAddress {
  receiver_name?: string;
  street_name?: string;
  street_number?: string | number;
  comment?: string;
  zip_code?: string;
  neighborhood?: { name?: string };
  city?: { name?: string };
  state?: { id?: string; name?: string };
}

interface MlShipment {
  id?: number | string;
  order_id?: number | string;
  status?: string;
  substatus?: string | null;
  tracking_number?: string | null;
  logistic_type?: string | null;
  receiver_address?: MlAddress;
}

/** Snapshot local mínimo para aplicar uma atualização de envio. */
interface LocalShipmentRef {
  id: string;
  status: ShipmentStatus;
  trackingCode: string | null;
  shippedAt: Date | null;
  deliveredAt: Date | null;
  order: { id: string; status: OrderStatus } | null;
}

export interface ImportResult {
  imported: boolean;
  orderId?: string;
  reason?: string;
}

/**
 * Importa pedidos vendidos no Mercado Livre para dentro do OMS, transformando-os
 * em pedidos internos prontos para a esteira de expedição.
 *
 * Princípios:
 *  - Idempotente: cada pedido externo (canal + id) entra uma única vez
 *    (restrição única em orders.channel/external_id).
 *  - Não inventa dados fiscais: a NF-e do ML é tratada à parte (ver Expedição).
 *  - Falhas de negócio (produto não encontrado) não derrubam o webhook: avisam o
 *    admin e retornam motivo. Apenas erros transitórios (API fora) propagam para
 *    a fila reprocessar.
 */
@Injectable()
export class MlOrderImportService {
  private readonly logger = new Logger(MlOrderImportService.name);
  private readonly baseUrl: string;
  private readonly sellerId: string;

  /** E-mail do usuário-sistema dono dos pedidos importados do Mercado Livre. */
  private static readonly CHANNEL_USER_EMAIL = 'mercadolivre@marketplace.local';

  /** Estados finais que a sincronização de envio nunca sobrescreve. */
  private static readonly FINAL_ORDER_STATUSES: OrderStatus[] = [
    OrderStatus.DELIVERED,
    OrderStatus.CANCELLED,
    OrderStatus.REFUNDED,
  ];

  constructor(
    private readonly config: ConfigService,
    private readonly tokenService: MlTokenService,
    private readonly prisma: PrismaService,
    private readonly stock: StockService,
    private readonly notifications: NotificationsService,
    private readonly events: EventBusService,
    private readonly queue: QueueService,
  ) {
    this.baseUrl = this.config.get<string>('ML_API_URL', 'https://api.mercadolibre.com');
    this.sellerId = this.config.get<string>('ML_SELLER_ID', '');
  }

  // ── Importação de um pedido ────────────────────────────────────────────────

  /**
   * Importa (ou reconcilia) um pedido do ML pelo id. Idempotente: se já existe,
   * apenas garante o status e retorna. Só importa pedidos pagos.
   */
  async importByOrderId(mlOrderId: string): Promise<ImportResult> {
    const externalId = String(mlOrderId);

    const existing = await this.prisma.order.findUnique({
      where: { channel_externalId: { channel: Marketplace.MERCADO_LIVRE, externalId } },
      select: { id: true },
    });
    if (existing) {
      // O webhook de orders também chega quando o pedido muda de estado no ML
      // (enviado/entregue). Reconcilia o envio para o site acompanhar — é a
      // única chance de atualizar quando o tópico de shipments não chega.
      await this.reconcileOrderShipment(existing.id).catch((err) => {
        this.logger.warn(
          `ML: reconciliação de envio do pedido ${existing.id} falhou: ${(err as Error).message}`,
        );
      });
      return { imported: false, orderId: existing.id, reason: 'já importado' };
    }

    const order = await this.fetchOrder(externalId);
    if (!order) {
      // Erro transitório (API fora / token): propaga para a fila reprocessar.
      throw new Error(`ML: não foi possível buscar o pedido ${externalId}`);
    }

    const status = (order.status ?? '').toLowerCase();
    if (status !== 'paid' && status !== 'partially_paid') {
      return { imported: false, reason: `status "${order.status}" ainda não pago` };
    }

    const items = order.order_items ?? [];
    if (!items.length) return { imported: false, reason: 'pedido sem itens' };

    // Mapeia cada item do ML para um produto do catálogo (publicação → SKU).
    const resolved = await this.resolveItems(items);
    if (resolved.unmatched.length) {
      const titles = resolved.unmatched.join('; ');
      await this.notifyImportBlocked(externalId, titles);
      return { imported: false, reason: `produto(s) não encontrado(s): ${titles}` };
    }

    const shipment = order.shipping?.id ? await this.fetchShipment(order.shipping.id) : null;
    const address = this.mapAddress(shipment?.receiver_address);
    const userId = await this.ensureChannelUser();

    const subtotal = resolved.lines.reduce((acc, l) => acc + l.price * l.quantity, 0);
    const total = order.paid_amount ?? order.total_amount ?? subtotal;
    const buyerName = this.buyerName(order);

    let created: { id: string };
    try {
      created = await this.prisma.$transaction(async (tx) => {
        const newOrder = await tx.order.create({
          data: {
            userId,
            channel: Marketplace.MERCADO_LIVRE,
            externalId,
            externalReference: order.shipping?.id ? String(order.shipping.id) : null,
            status: OrderStatus.PAID,
            deliveryMethod: DeliveryMethod.SHIPPING,
            subtotal: round2(subtotal),
            discount: 0,
            shipping: 0,
            total: round2(total),
            shippingAddress: address as unknown as Prisma.InputJsonValue,
            shippingMethod: shipment?.logistic_type
              ? `Mercado Livre (${shipment.logistic_type})`
              : 'Mercado Livre',
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

        // Remessa do ML: guarda o id do envio (etiqueta/rastreio são do próprio ML).
        await tx.shipment.create({
          data: {
            orderId: newOrder.id,
            externalId: shipment?.id ? String(shipment.id) : null,
            carrier: 'Mercado Livre',
            service: shipment?.logistic_type ?? 'ML',
            serviceId: 0,
            trackingCode: shipment?.tracking_number ?? null,
            status: ShipmentStatus.PENDING,
            price: 0,
          },
        });

        return newOrder;
      });
    } catch (err) {
      // Corrida de webhooks duplicados: outro processo já criou o pedido.
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        return { imported: false, reason: 'já importado (corrida)' };
      }
      throw err;
    }

    await recordOrderEvent(this.prisma, {
      orderId: created.id,
      status: OrderStatus.PAID,
      title: 'Pedido importado do Mercado Livre',
      description: `Pedido ML #${externalId}`,
    });

    // Sincroniza o estoque interno (baixa única e idempotente) e dispara o
    // orquestrador (itens únicos → SOLD + saída dos demais canais).
    await this.stock.applyForOrder(created.id).catch((err) => {
      this.logger.error(`Falha ao baixar estoque do pedido ML ${created.id}`, err as Error);
    });
    await this.propagateStock(resolved.lines.map((l) => l.productId));
    this.events.emit(OmsEvents.OrderPaid, { orderId: created.id });

    await this.notifyNewOrder(created.id, externalId, buyerName);
    this.logger.log(`ML: pedido ${externalId} importado como ${created.id}`);
    return { imported: true, orderId: created.id };
  }

  // ── Sincronização de envio (topic=shipments) ───────────────────────────────

  /** Atualiza rastreio/estado a partir de um shipment do ML. */
  async syncShipmentById(mlShipmentId: string): Promise<void> {
    const externalId = String(mlShipmentId);
    const shipment = await this.fetchShipment(externalId);
    if (!shipment) {
      // Erro transitório (API fora / token vencido): propaga para a fila
      // reprocessar. Antes o retorno silencioso descartava o "enviado/entregue"
      // para sempre — era isso que deixava pedidos parados no site.
      throw new Error(`ML: não foi possível buscar o envio ${externalId}`);
    }

    let local: LocalShipmentRef | null = await this.prisma.shipment.findFirst({
      where: { externalId },
      include: { order: { select: { id: true, status: true } } },
    });

    // Importações que falharam ao buscar o shipment na época ficaram com
    // externalId nulo: recupera o vínculo pelo pedido do ML e preenche.
    if (!local && shipment.order_id) {
      const order = await this.prisma.order.findUnique({
        where: {
          channel_externalId: {
            channel: Marketplace.MERCADO_LIVRE,
            externalId: String(shipment.order_id),
          },
        },
        select: { id: true },
      });
      if (order) {
        local = await this.prisma.shipment
          .update({
            where: { orderId: order.id },
            data: { externalId },
            include: { order: { select: { id: true, status: true } } },
          })
          .catch(() => null);
      }
    }
    if (!local) return; // pedido ainda não importado — o tópico de orders cuida

    await this.applyShipmentUpdate(local, shipment);
  }

  /**
   * Reconcilia o envio de um pedido ML já importado: busca o shipment na API e
   * espelha enviado/entregue no pedido interno. Chamado quando o webhook de
   * orders chega para pedido existente e pela rede de segurança periódica.
   * Falhas transitórias são toleradas (a próxima rodada tenta de novo).
   */
  async reconcileOrderShipment(internalOrderId: string): Promise<void> {
    const order = await this.prisma.order.findUnique({
      where: { id: internalOrderId },
      select: {
        id: true,
        status: true,
        channel: true,
        externalId: true,
        externalReference: true,
        shipment: true,
      },
    });
    if (!order || order.channel !== Marketplace.MERCADO_LIVRE || !order.shipment) return;
    if (MlOrderImportService.FINAL_ORDER_STATUSES.includes(order.status)) return;

    let mlShipmentId = order.shipment.externalId ?? order.externalReference;
    if (!mlShipmentId && order.externalId) {
      // Importação antiga sem vínculo: redescobre o envio pelo pedido do ML.
      const mlOrder = await this.fetchOrder(order.externalId);
      mlShipmentId = mlOrder?.shipping?.id ? String(mlOrder.shipping.id) : null;
    }
    if (!mlShipmentId) return;

    const shipment = await this.fetchShipment(mlShipmentId);
    if (!shipment) return;

    if (!order.shipment.externalId) {
      await this.prisma.shipment.update({
        where: { id: order.shipment.id },
        data: { externalId: String(mlShipmentId) },
      });
    }
    await this.applyShipmentUpdate(
      { ...order.shipment, order: { id: order.id, status: order.status } },
      shipment,
    );
  }

  /** Aplica rastreio/estado de um shipment do ML na remessa e no pedido locais. */
  private async applyShipmentUpdate(local: LocalShipmentRef, shipment: MlShipment): Promise<void> {
    const mapped = mapShipmentStatus(shipment.status);

    // Não rebaixa uma remessa já entregue (webhooks podem chegar fora de ordem).
    const nextShipmentStatus =
      mapped && !(local.status === ShipmentStatus.DELIVERED && mapped !== ShipmentStatus.DELIVERED)
        ? mapped
        : local.status;

    await this.prisma.shipment.update({
      where: { id: local.id },
      data: {
        trackingCode: shipment.tracking_number ?? local.trackingCode,
        status: nextShipmentStatus,
        ...(mapped === ShipmentStatus.SHIPPED && !local.shippedAt ? { shippedAt: new Date() } : {}),
        ...(mapped === ShipmentStatus.DELIVERED && !local.deliveredAt
          ? { deliveredAt: new Date() }
          : {}),
      },
    });

    // Avança o pedido junto do envio (enviado/entregue), sem retroceder estados
    // finais nem reabrir pedidos cancelados.
    const orderStatus =
      mapped === ShipmentStatus.DELIVERED
        ? OrderStatus.DELIVERED
        : mapped === ShipmentStatus.SHIPPED
          ? OrderStatus.SHIPPED
          : null;
    if (
      orderStatus &&
      local.order &&
      local.order.status !== orderStatus &&
      !MlOrderImportService.FINAL_ORDER_STATUSES.includes(local.order.status)
    ) {
      await this.prisma.order.update({
        where: { id: local.order.id },
        data: { status: orderStatus },
      });
      await recordOrderEvent(this.prisma, {
        orderId: local.order.id,
        status: orderStatus,
        dedupe: true,
      });
      this.logger.log(`ML: pedido ${local.order.id} avançou para ${orderStatus} (envio)`);
    }
  }

  // ── Etiqueta do Mercado Livre (PDF) ────────────────────────────────────────

  /** Baixa o PDF da etiqueta do envio ML vinculado a um pedido interno. */
  async getLabelPdf(internalOrderId: string): Promise<{ buffer: Buffer; contentType: string }> {
    const shipment = await this.prisma.shipment.findUnique({
      where: { orderId: internalOrderId },
      select: { externalId: true },
    });
    if (!shipment?.externalId) {
      throw new BadRequestException('Pedido sem envio do Mercado Livre vinculado.');
    }

    const token = await this.tokenService.getToken();
    const url = `${this.baseUrl}/shipment_labels?shipment_ids=${shipment.externalId}&response_type=pdf`;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new BadRequestException(
        `ML: falha ao obter etiqueta (HTTP ${res.status}). ${body.slice(0, 200)}`,
      );
    }
    const arrayBuffer = await res.arrayBuffer();
    return {
      buffer: Buffer.from(arrayBuffer),
      contentType: res.headers.get('content-type') ?? 'application/pdf',
    };
  }

  // ── Reconciliação periódica (rede de segurança p/ webhooks perdidos) ───────

  @Cron(CronExpression.EVERY_30_MINUTES)
  async reconcileRecent(): Promise<void> {
    if (!this.tokenService.isConfigured()) return;

    if (this.sellerId) {
      try {
        const orders = await this.fetchRecentPaidOrders();
        let imported = 0;
        for (const o of orders) {
          try {
            const result = await this.importByOrderId(String(o.id));
            if (result.imported) imported++;
          } catch (err) {
            this.logger.warn(`Reconcile: pedido ${o.id} falhou: ${(err as Error).message}`);
          }
        }
        if (imported) this.logger.log(`ML reconcile: ${imported} pedido(s) novo(s) importado(s)`);
      } catch (err) {
        this.logger.warn('ML reconcile: busca de pedidos recentes falhou', err as Error);
      }
    }

    await this.reconcileOpenShipments();
  }

  /**
   * Rede de segurança dos ENVIOS: espelha enviado/entregue dos pedidos ML em
   * aberto mesmo quando o webhook de shipments se perde (ou o app do ML não
   * está inscrito no tópico). Limitado aos 40 mais recentes por rodada.
   */
  private async reconcileOpenShipments(): Promise<void> {
    const open = await this.prisma.order.findMany({
      where: {
        channel: Marketplace.MERCADO_LIVRE,
        status: {
          in: [
            OrderStatus.PAID,
            OrderStatus.SEPARATING,
            OrderStatus.SEPARATED,
            OrderStatus.READY_TO_SHIP,
            OrderStatus.SHIPPED,
          ],
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 40,
      select: { id: true },
    });

    for (const { id } of open) {
      try {
        await this.reconcileOrderShipment(id);
      } catch (err) {
        this.logger.warn(`Reconcile envio do pedido ${id}: ${(err as Error).message}`);
      }
    }
  }

  // ── HTTP do Mercado Livre ──────────────────────────────────────────────────

  private async fetchOrder(id: string): Promise<MlOrder | null> {
    return this.get<MlOrder>(`/orders/${id}`);
  }

  private async fetchShipment(id: number | string): Promise<MlShipment | null> {
    return this.get<MlShipment>(`/shipments/${id}`);
  }

  /** Pedidos pagos recentes do vendedor (rede de segurança da reconciliação). */
  private async fetchRecentPaidOrders(): Promise<MlOrder[]> {
    const data = await this.get<{ results?: MlOrder[] }>(
      `/orders/search?seller=${this.sellerId}&order.status=paid&sort=date_desc&limit=25`,
    );
    return data?.results ?? [];
  }

  private async get<T>(path: string): Promise<T | null> {
    const token = await this.tokenService.getToken();
    if (!token) return null;
    let res = await fetch(`${this.baseUrl}${path}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.status === 401) {
      const refreshed = await this.tokenService.refreshToken().catch(() => null);
      if (refreshed) {
        res = await fetch(`${this.baseUrl}${path}`, {
          headers: { Authorization: `Bearer ${refreshed}` },
        });
      }
    }
    if (!res.ok) {
      this.logger.warn(`ML GET ${path.split('?')[0]}: HTTP ${res.status}`);
      return null;
    }
    return (await res.json().catch(() => null)) as T | null;
  }

  // ── Mapeamento ─────────────────────────────────────────────────────────────

  /** Resolve os itens do ML em produtos do catálogo (por publicação ou SKU). */
  private async resolveItems(items: MlOrderItem[]): Promise<{
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
      const externalItemId = it.item?.id ? String(it.item.id) : null;
      const sku = it.item?.seller_sku || it.item?.seller_custom_field || null;
      let product: { id: string; sku: string } | null = null;

      if (externalItemId) {
        const pub = await this.prisma.marketplacePublication.findFirst({
          where: { marketplace: Marketplace.MERCADO_LIVRE, externalId: externalItemId },
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
        unmatched.push(it.item?.title ?? externalItemId ?? sku ?? 'item desconhecido');
        continue;
      }

      lines.push({
        productId: product.id,
        name: it.item?.title ?? product.sku,
        sku: sku ?? product.sku,
        price: it.unit_price ?? 0,
        quantity: it.quantity ?? 1,
      });
    }

    return { lines, unmatched };
  }

  private mapAddress(addr?: MlAddress): Record<string, string> {
    if (!addr) return {};
    return {
      name: addr.receiver_name ?? '',
      street: addr.street_name ?? '',
      number: addr.street_number != null ? String(addr.street_number) : '',
      complement: addr.comment ?? '',
      neighborhood: addr.neighborhood?.name ?? '',
      city: addr.city?.name ?? '',
      state: addr.state?.id?.replace('BR-', '') ?? addr.state?.name ?? '',
      cep: (addr.zip_code ?? '').replace(/\D/g, ''),
    };
  }

  private buyerName(order: MlOrder): string {
    const b = order.buyer;
    const full = [b?.first_name, b?.last_name].filter(Boolean).join(' ').trim();
    return full || b?.nickname || 'Comprador Mercado Livre';
  }

  /** Garante o usuário-sistema dono dos pedidos do ML (não é um cliente real). */
  private async ensureChannelUser(): Promise<string> {
    const email = MlOrderImportService.CHANNEL_USER_EMAIL;
    const existing = await this.prisma.user.findUnique({ where: { email }, select: { id: true } });
    if (existing) return existing.id;
    const created = await this.prisma.user.create({
      data: {
        email,
        name: 'Mercado Livre',
        role: Role.CLIENTE,
        isActive: false,
        // Hash inutilizável: conta de sistema, nunca faz login.
        passwordHash: 'marketplace-system-account',
      },
      select: { id: true },
    });
    return created.id;
  }

  /** Propaga o estoque atual para os demais canais externos (exceto o de origem). */
  private async propagateStock(productIds: string[]): Promise<void> {
    for (const productId of new Set(productIds)) {
      const product = await this.prisma.product.findUnique({
        where: { id: productId },
        select: { stock: true, isUnique: true },
      });
      // Únicos já são tratados pelo orquestrador (REMOVE nos demais canais).
      if (!product || product.isUnique) continue;

      const pubs = await this.prisma.marketplacePublication.findMany({
        where: {
          productId,
          marketplace: { notIn: [Marketplace.SITE, Marketplace.MERCADO_LIVRE] },
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

  private async notifyNewOrder(
    orderId: string,
    externalId: string,
    buyerName: string,
  ): Promise<void> {
    await this.notifications
      .notify({
        role: Role.VENDEDOR,
        type: 'ML_ORDER_IMPORTED',
        title: 'Novo pedido — Mercado Livre',
        message: `Pedido ML #${externalId} (${buyerName}) entrou na fila de expedição.`,
        orderId,
      })
      .catch(() => undefined);
  }

  private async notifyImportBlocked(externalId: string, titles: string): Promise<void> {
    await this.notifications
      .notify({
        role: Role.ADMIN,
        type: 'ML_ORDER_IMPORT_BLOCKED',
        title: 'Pedido ML não importado',
        message: `Pedido ML #${externalId} não pôde entrar: produto(s) sem correspondência no catálogo (${titles}). Cadastre/publique e reprocesse.`,
      })
      .catch(() => undefined);
  }
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Converte o status do shipment do ML para o nosso ShipmentStatus. */
function mapShipmentStatus(status?: string): ShipmentStatus | null {
  switch ((status ?? '').toLowerCase()) {
    case 'ready_to_ship':
    case 'handling':
      return ShipmentStatus.LABEL_PURCHASED;
    case 'shipped':
      return ShipmentStatus.SHIPPED;
    case 'delivered':
      return ShipmentStatus.DELIVERED;
    case 'cancelled':
    case 'not_delivered':
      return ShipmentStatus.CANCELLED;
    default:
      return null;
  }
}
