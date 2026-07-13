import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { DeliveryMethod, OrderStatus, PaymentStatus, ShipmentStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { MercadoPagoService } from '../mercadopago/mercadopago.service';
import { OrderWhatsappService } from '../whatsapp/order-whatsapp.service';
import { StockService } from '../stock/stock.service';
import { EventBusService } from '../events/event-bus.service';
import { OmsEvents } from '../events/oms-events';
import { recordOrderEvent } from '../common/order-timeline';
import { startOfBrazilDay, endOfBrazilDay } from '../analytics/report-range';

const CANCELLABLE_STATUSES: OrderStatus[] = [
  OrderStatus.PAID,
  OrderStatus.SEPARATING,
  OrderStatus.SEPARATED,
  OrderStatus.READY_TO_SHIP,
  OrderStatus.DELIVERED,
  OrderStatus.REFUNDED,
];

// Orders in these statuses never left the store, so cancelling them frees the
// stock back up. A DELIVERED order's item is already with the customer — do
// not restock it automatically, or it comes back to the catalog as if it were
// still on the shelf (see project-estoque-cancelamento-expedicao memory).
const STOCK_RESTORE_STATUSES: OrderStatus[] = [
  OrderStatus.PAID,
  OrderStatus.SEPARATING,
  OrderStatus.SEPARATED,
  OrderStatus.READY_TO_SHIP,
];

function serializeOrder(order: Record<string, unknown>) {
  return {
    ...order,
    subtotal: (order.subtotal as { toNumber(): number }).toNumber(),
    discount: (order.discount as { toNumber(): number }).toNumber(),
    shipping: (order.shipping as { toNumber(): number }).toNumber(),
    total: (order.total as { toNumber(): number }).toNumber(),
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function serializeOrderDetail(order: any) {
  return {
    ...serializeOrder(order as Record<string, unknown>),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    items: (order.items ?? []).map((it: any) => ({
      id: it.id,
      productId: it.productId,
      name: it.name,
      sku: it.sku,
      quantity: it.quantity,
      price: it.price.toNumber(),
      subtotal: it.subtotal.toNumber(),
      image: it.product?.images?.[0]?.url ?? null,
    })),
  };
}

async function generatePickupCode(prisma: PrismaService): Promise<string> {
  const last = await prisma.order.findFirst({
    where: { pickupCode: { startsWith: 'A-' } },
    orderBy: { createdAt: 'desc' },
    select: { pickupCode: true },
  });
  let num = 1;
  if (last?.pickupCode) {
    const match = last.pickupCode.match(/^A-(\d+)$/);
    if (match) num = parseInt(match[1], 10) + 1;
  }
  return `A-${String(num).padStart(4, '0')}`;
}

const ORDER_INCLUDE_BASE = {
  user: { select: { id: true, name: true, email: true } },
  _count: { select: { items: true } },
  payment: { select: { method: true, status: true } },
};

const PAGE_SIZE = 20;

function paginateResult<T>(
  data: T[],
  total: number,
  page: number,
): { data: T[]; total: number; page: number; pages: number } {
  return { data, total, page, pages: Math.ceil(total / PAGE_SIZE) };
}

@Injectable()
export class ExpedicaoService {
  private readonly logger = new Logger(ExpedicaoService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mp: MercadoPagoService,
    private readonly orderWa: OrderWhatsappService,
    private readonly stock: StockService,
    private readonly events: EventBusService,
  ) {}

  async getStats(userId: string | null) {
    const userFilter = userId ? { userId } : {};

    const today = startOfBrazilDay();
    const tomorrow = endOfBrazilDay();

    const [grouped, separatedOrders, enviadosHoje, retiradosHoje, entreguesEnvioHoje] =
      await Promise.all([
        this.prisma.order.groupBy({
          by: ['deliveryMethod', 'status'],
          where: userFilter,
          _count: { _all: true },
        }),
        this.prisma.order.findMany({
          where: { status: OrderStatus.SEPARATED, ...userFilter },
          include: {
            invoices: { select: { status: true } },
            shipment: { select: { status: true, labelUrl: true } },
          },
        }),
        this.prisma.order.count({
          where: {
            status: OrderStatus.SHIPPED,
            updatedAt: { gte: today, lt: tomorrow },
            ...userFilter,
          },
        }),
        this.prisma.order.count({
          where: {
            status: OrderStatus.DELIVERED,
            deliveryMethod: DeliveryMethod.PICKUP,
            updatedAt: { gte: today, lt: tomorrow },
            ...userFilter,
          },
        }),
        this.prisma.order.count({
          where: {
            status: OrderStatus.DELIVERED,
            deliveryMethod: DeliveryMethod.SHIPPING,
            updatedAt: { gte: today, lt: tomorrow },
            ...userFilter,
          },
        }),
      ]);

    // Soma as contagens do groupBy por método de entrega + lista de status.
    const count = (dm: DeliveryMethod, ...statuses: OrderStatus[]): number =>
      grouped
        .filter((g) => g.deliveryMethod === dm && statuses.includes(g.status))
        .reduce((sum, g) => sum + g._count._all, 0);

    const aguardandoNFe = separatedOrders.filter(
      (o) => !o.invoices.some((inv) => inv.status === 'AUTHORIZED'),
    ).length;

    const aguardandoEtiqueta = separatedOrders.filter(
      (o) => o.deliveryMethod === DeliveryMethod.SHIPPING && (!o.shipment || !o.shipment.labelUrl),
    ).length;

    const envio = {
      aguardandoSeparacao: count(DeliveryMethod.SHIPPING, OrderStatus.PAID),
      emSeparacao: count(DeliveryMethod.SHIPPING, OrderStatus.SEPARATING),
      prontos: count(DeliveryMethod.SHIPPING, OrderStatus.SEPARATED, OrderStatus.READY_TO_SHIP),
      emTransito: count(DeliveryMethod.SHIPPING, OrderStatus.SHIPPED),
      entreguesHoje: entreguesEnvioHoje,
    };

    const retirada = {
      aguardandoSeparacao: count(DeliveryMethod.PICKUP, OrderStatus.PAID),
      emSeparacao: count(DeliveryMethod.PICKUP, OrderStatus.SEPARATING),
      // Separados, mas ainda não marcados como prontos/postos no balcão.
      separados: count(DeliveryMethod.PICKUP, OrderStatus.SEPARATED),
      // Prontos na loja, aguardando o cliente buscar.
      aguardandoRetirada: count(DeliveryMethod.PICKUP, OrderStatus.READY_TO_SHIP),
      retiradosHoje,
    };

    return {
      // Campos legados (compatibilidade com versões anteriores do dashboard)
      aguardandoSeparacao: envio.aguardandoSeparacao + retirada.aguardandoSeparacao,
      aguardandoNFe,
      aguardandoEtiqueta,
      enviadosHoje,
      retiradosHoje,
      // Visão separada por tipo de entrega
      envio,
      retirada,
    };
  }

  async getFila(opts: {
    page: number;
    search?: string;
    deliveryMethod?: string;
    userId?: string | null;
  }) {
    const { page, search, deliveryMethod, userId } = opts;
    const skip = (page - 1) * PAGE_SIZE;

    const where: Record<string, unknown> = { status: OrderStatus.PAID };
    if (userId) where.userId = userId;
    if (deliveryMethod) where.deliveryMethod = deliveryMethod;
    if (search) {
      where.OR = [
        { id: { contains: search, mode: 'insensitive' } },
        { user: { name: { contains: search, mode: 'insensitive' } } },
        { user: { email: { contains: search, mode: 'insensitive' } } },
      ];
    }

    const [orders, total] = await Promise.all([
      this.prisma.order.findMany({
        where,
        include: ORDER_INCLUDE_BASE,
        orderBy: { createdAt: 'asc' },
        skip,
        take: PAGE_SIZE,
      }),
      this.prisma.order.count({ where }),
    ]);

    return paginateResult(
      orders.map((o) => serializeOrder(o as unknown as Record<string, unknown>)),
      total,
      page,
    );
  }

  async getSeparacao(opts: { page: number; deliveryMethod?: string; userId?: string | null }) {
    const { page, deliveryMethod, userId } = opts;
    const skip = (page - 1) * PAGE_SIZE;
    const where: Record<string, unknown> = { status: OrderStatus.SEPARATING };
    if (userId) where.userId = userId;
    if (deliveryMethod) where.deliveryMethod = deliveryMethod;

    const [orders, total] = await Promise.all([
      this.prisma.order.findMany({
        where,
        include: ORDER_INCLUDE_BASE,
        orderBy: { updatedAt: 'asc' },
        skip,
        take: PAGE_SIZE,
      }),
      this.prisma.order.count({ where }),
    ]);

    return paginateResult(
      orders.map((o) => serializeOrder(o as unknown as Record<string, unknown>)),
      total,
      page,
    );
  }

  async getProntos(opts: { page: number; deliveryMethod?: string; userId?: string | null }) {
    const { page, deliveryMethod, userId } = opts;
    const skip = (page - 1) * PAGE_SIZE;

    const where: Record<string, unknown> = {
      status: { in: [OrderStatus.SEPARATED, OrderStatus.READY_TO_SHIP] },
    };
    if (userId) where.userId = userId;
    if (deliveryMethod) where.deliveryMethod = deliveryMethod;

    const [orders, total] = await Promise.all([
      this.prisma.order.findMany({
        where,
        include: ORDER_INCLUDE_BASE,
        orderBy: { updatedAt: 'asc' },
        skip,
        take: PAGE_SIZE,
      }),
      this.prisma.order.count({ where }),
    ]);

    return paginateResult(
      orders.map((o) => serializeOrder(o as unknown as Record<string, unknown>)),
      total,
      page,
    );
  }

  async getEnviados(opts: { page: number; search?: string; userId?: string | null }) {
    const { page, search, userId } = opts;
    const skip = (page - 1) * PAGE_SIZE;

    const where: Record<string, unknown> = { status: OrderStatus.SHIPPED };
    if (userId) where.userId = userId;
    if (search) {
      where.OR = [
        { id: { contains: search, mode: 'insensitive' } },
        { user: { name: { contains: search, mode: 'insensitive' } } },
        { shipment: { trackingCode: { contains: search, mode: 'insensitive' } } },
      ];
    }

    const [orders, total] = await Promise.all([
      this.prisma.order.findMany({
        where,
        include: {
          ...ORDER_INCLUDE_BASE,
          shipment: {
            select: {
              carrier: true,
              trackingCode: true,
              status: true,
              updatedAt: true,
            },
          },
        },
        orderBy: { updatedAt: 'desc' },
        skip,
        take: PAGE_SIZE,
      }),
      this.prisma.order.count({ where }),
    ]);

    return paginateResult(
      orders.map((o) => serializeOrder(o as unknown as Record<string, unknown>)),
      total,
      page,
    );
  }

  async getRetirada(opts: {
    page: number;
    userId?: string | null;
    grupo?: 'separados' | 'prontos';
    search?: string;
  }) {
    const { page, userId, grupo, search } = opts;
    const skip = (page - 1) * PAGE_SIZE;

    const statusFilter =
      grupo === 'separados'
        ? OrderStatus.SEPARATED
        : grupo === 'prontos'
          ? OrderStatus.READY_TO_SHIP
          : { in: [OrderStatus.SEPARATED, OrderStatus.READY_TO_SHIP] };

    const where: Record<string, unknown> = {
      deliveryMethod: DeliveryMethod.PICKUP,
      status: statusFilter,
    };
    if (userId) where.userId = userId;
    if (search) {
      where.pickupCode = { contains: search, mode: 'insensitive' };
    }

    const [orders, total] = await Promise.all([
      this.prisma.order.findMany({
        where,
        include: ORDER_INCLUDE_BASE,
        orderBy: { pickupCode: 'desc' },
        skip,
        take: PAGE_SIZE,
      }),
      this.prisma.order.count({ where }),
    ]);

    return paginateResult(
      orders.map((o) => serializeOrder(o as unknown as Record<string, unknown>)),
      total,
      page,
    );
  }

  async getConcluidos(opts: {
    page: number;
    search?: string;
    deliveryMethod?: string;
    userId?: string | null;
  }) {
    const { page, search, deliveryMethod, userId } = opts;
    const skip = (page - 1) * PAGE_SIZE;

    const where: Record<string, unknown> = { status: OrderStatus.DELIVERED };
    if (userId) where.userId = userId;
    if (deliveryMethod) where.deliveryMethod = deliveryMethod;
    if (search) {
      where.OR = [
        { id: { contains: search, mode: 'insensitive' } },
        { user: { name: { contains: search, mode: 'insensitive' } } },
        { user: { email: { contains: search, mode: 'insensitive' } } },
      ];
    }

    const [orders, total] = await Promise.all([
      this.prisma.order.findMany({
        where,
        include: ORDER_INCLUDE_BASE,
        orderBy: { updatedAt: 'desc' },
        skip,
        take: PAGE_SIZE,
      }),
      this.prisma.order.count({ where }),
    ]);

    return paginateResult(
      orders.map((o) => serializeOrder(o as unknown as Record<string, unknown>)),
      total,
      page,
    );
  }

  async iniciarSeparacao(orderId: string, actor?: string | null) {
    const order = await this.prisma.order.findUnique({ where: { id: orderId } });
    if (!order) throw new NotFoundException('Pedido não encontrado.');
    if (order.status !== OrderStatus.PAID) {
      throw new BadRequestException(
        `Pedido deve estar em PAID para iniciar separação. Status atual: ${order.status}`,
      );
    }

    const data: Record<string, unknown> = { status: OrderStatus.SEPARATING };
    if (order.deliveryMethod === DeliveryMethod.PICKUP && !order.pickupCode) {
      data.pickupCode = await generatePickupCode(this.prisma);
    }

    const updated = await this.prisma.order.update({ where: { id: orderId }, data });
    await recordOrderEvent(this.prisma, { orderId, status: OrderStatus.SEPARATING, actor });
    return updated;
  }

  async atualizarItensSeparados(orderId: string, separatedItems: string[]) {
    const order = await this.prisma.order.findUnique({ where: { id: orderId } });
    if (!order) throw new NotFoundException('Pedido não encontrado.');
    if (order.status !== OrderStatus.SEPARATING) {
      throw new BadRequestException(
        `Pedido deve estar em SEPARATING para atualizar itens. Status atual: ${order.status}`,
      );
    }

    return this.prisma.order.update({
      where: { id: orderId },
      data: { separatedItems },
    });
  }

  async atualizarObservacao(orderId: string, separationNotes: string) {
    const order = await this.prisma.order.findUnique({ where: { id: orderId } });
    if (!order) throw new NotFoundException('Pedido não encontrado.');
    return this.prisma.order.update({
      where: { id: orderId },
      data: { separationNotes: separationNotes.slice(0, 1000) },
    });
  }

  // Detalhe completo de um pedido para a tela de separação/expedição: itens com
  // imagem do produto, linha do tempo de status, remessa e dados do cliente.
  async getOrderDetail(orderId: string, userId?: string | null) {
    const where: Record<string, unknown> = { id: orderId };
    if (userId) where.userId = userId;

    const order = await this.prisma.order.findFirst({
      where,
      include: {
        user: { select: { id: true, name: true, email: true } },
        items: {
          include: { product: { include: { images: { take: 1, orderBy: { position: 'asc' } } } } },
        },
        shipment: {
          select: {
            carrier: true,
            service: true,
            trackingCode: true,
            status: true,
            labelUrl: true,
            deliveryMin: true,
            deliveryMax: true,
          },
        },
        statusEvents: { orderBy: { createdAt: 'asc' } },
      },
    });
    if (!order) throw new NotFoundException('Pedido não encontrado.');

    return serializeOrderDetail(order);
  }

  // Lembrete automático de retirada: pedidos PICKUP prontos há mais de 72h que
  // ainda não foram retirados nem lembrados. Roda de hora em hora; só marca como
  // lembrado quando o WhatsApp realmente saiu (senão tenta de novo na próxima).
  @Cron(CronExpression.EVERY_HOUR)
  async remindPendingPickups() {
    const cutoff = new Date(Date.now() - 72 * 60 * 60 * 1000);
    const orders = await this.prisma.order.findMany({
      where: {
        deliveryMethod: DeliveryMethod.PICKUP,
        status: OrderStatus.READY_TO_SHIP,
        pickupRemindedAt: null,
        updatedAt: { lte: cutoff },
      },
      select: { id: true, customerPhone: true, buyerName: true, pickupCode: true },
      take: 50,
    });
    if (!orders.length) return;

    let sentCount = 0;
    for (const o of orders) {
      const sent = await this.orderWa.notifyPickupReminder(
        { phone: o.customerPhone, name: o.buyerName, orderId: o.id },
        o.pickupCode,
      );
      if (sent) {
        sentCount++;
        await this.prisma.order.update({
          where: { id: o.id },
          data: { pickupRemindedAt: new Date() },
        });
        await recordOrderEvent(this.prisma, {
          orderId: o.id,
          status: OrderStatus.READY_TO_SHIP,
          title: 'Lembrete de retirada enviado',
        });
      }
    }
    this.logger.log(`Lembretes de retirada: ${sentCount}/${orders.length} enviados`);
  }

  async finalizarSeparacao(orderId: string, actor?: string | null) {
    const order = await this.prisma.order.findUnique({ where: { id: orderId } });
    if (!order) throw new NotFoundException('Pedido não encontrado.');
    if (order.status !== OrderStatus.SEPARATING) {
      throw new BadRequestException(
        `Pedido deve estar em SEPARATING para finalizar separação. Status atual: ${order.status}`,
      );
    }

    const updated = await this.prisma.order.update({
      where: { id: orderId },
      data: { status: OrderStatus.SEPARATED },
    });
    await recordOrderEvent(this.prisma, { orderId, status: OrderStatus.SEPARATED, actor });
    return updated;
  }

  async marcarPronto(orderId: string, actor?: string | null) {
    const order = await this.prisma.order.findUnique({ where: { id: orderId } });
    if (!order) throw new NotFoundException('Pedido não encontrado.');
    if (order.status !== OrderStatus.SEPARATED) {
      throw new BadRequestException(
        `Pedido deve estar em SEPARATED para marcar como pronto. Status atual: ${order.status}`,
      );
    }

    const updated = await this.prisma.order.update({
      where: { id: orderId },
      data: { status: OrderStatus.READY_TO_SHIP },
    });

    const isPickup = order.deliveryMethod === DeliveryMethod.PICKUP;
    await recordOrderEvent(this.prisma, {
      orderId,
      status: OrderStatus.READY_TO_SHIP,
      title: isPickup ? 'Pronto para retirada' : 'Pronto para envio',
      actor,
    });

    // Aviso ao cliente (fire-and-forget; o service nunca lança). Pedidos de
    // marketplace não têm telefone/cliente local — o WhatsApp simplesmente no-opa.
    const target = { phone: order.customerPhone, name: order.buyerName, orderId };
    if (isPickup) {
      void this.orderWa.notifyPickupReady(target, order.pickupCode);
    } else {
      void this.orderWa.notifyReadyToShip(target);
    }

    return updated;
  }

  /**
   * Marca um pedido de ENVIO como despachado (READY_TO_SHIP/SEPARATED → SHIPPED).
   * Pensado para pedidos de marketplace (ex.: Mercado Livre), cuja etiqueta é do
   * próprio canal e não passa pelo Melhor Envio — então não há webhook do ME para
   * avançar o estado automaticamente.
   */
  async marcarEnviado(orderId: string, actor?: string | null) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { shipment: { select: { id: true } } },
    });
    if (!order) throw new NotFoundException('Pedido não encontrado.');
    if (order.deliveryMethod !== DeliveryMethod.SHIPPING) {
      throw new BadRequestException('Marcar como enviado só é válido para pedidos de envio.');
    }
    if (order.status !== OrderStatus.READY_TO_SHIP && order.status !== OrderStatus.SEPARATED) {
      throw new BadRequestException(
        `Pedido deve estar pronto/separado para marcar como enviado. Status atual: ${order.status}`,
      );
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const o = await tx.order.update({
        where: { id: orderId },
        data: { status: OrderStatus.SHIPPED },
      });
      if (order.shipment) {
        await tx.shipment.update({
          where: { id: order.shipment.id },
          data: { status: ShipmentStatus.SHIPPED, shippedAt: new Date() },
        });
      }
      return o;
    });

    await recordOrderEvent(this.prisma, { orderId, status: OrderStatus.SHIPPED, actor });
    void this.orderWa.notifyShipped({
      phone: order.customerPhone,
      name: order.buyerName,
      orderId,
    });
    return updated;
  }

  async confirmarRetirada(orderId: string, actor?: string | null) {
    const order = await this.prisma.order.findUnique({ where: { id: orderId } });
    if (!order) throw new NotFoundException('Pedido não encontrado.');

    if (order.deliveryMethod !== DeliveryMethod.PICKUP) {
      throw new BadRequestException('Confirmar retirada só é válido para pedidos PICKUP.');
    }

    if (order.status !== OrderStatus.READY_TO_SHIP && order.status !== OrderStatus.SEPARATED) {
      throw new BadRequestException(
        `Pedido deve estar em SEPARATED ou READY_TO_SHIP para confirmar retirada. Status atual: ${order.status}`,
      );
    }

    const updated = await this.prisma.order.update({
      where: { id: orderId },
      data: { status: OrderStatus.DELIVERED },
    });
    await recordOrderEvent(this.prisma, {
      orderId,
      status: OrderStatus.DELIVERED,
      title: 'Retirada confirmada',
      actor,
    });
    void this.orderWa.notifyPickupConfirmed({
      phone: order.customerPhone,
      name: order.buyerName,
      orderId,
    });

    return updated;
  }

  async cancelarPedido(
    orderId: string,
    actor?: string | null,
  ): Promise<{ ok: true; refundError?: string }> {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: {
        payment: { select: { id: true, status: true, gatewayPaymentId: true, method: true } },
      },
    });
    if (!order) throw new NotFoundException('Pedido não encontrado.');

    if (!CANCELLABLE_STATUSES.includes(order.status)) {
      throw new BadRequestException(`Pedido não pode ser cancelado no status ${order.status}.`);
    }

    // Attempt refund before cancellation transaction
    let refundError: string | undefined;
    const payment = order.payment;
    const canRefund =
      payment?.status === PaymentStatus.APPROVED &&
      !!payment.gatewayPaymentId &&
      payment.method !== 'BOLETO' &&
      this.mp.isConfigured();

    // alreadyRefundedOnMp is set to true when the MP API error indicates the payment
    // was refunded by a concurrent webhook — treated as success, not as failure
    let alreadyRefundedOnMp = false;

    if (canRefund) {
      try {
        await this.mp.createRefund(payment!.gatewayPaymentId!);
        this.logger.log(`Refund issued for order ${orderId}, payment ${payment!.gatewayPaymentId}`);
      } catch (err) {
        if (err instanceof Error) {
          refundError = err.message;
        } else if (typeof err === 'object' && err !== null) {
          const e = err as Record<string, unknown>;
          refundError = typeof e.message === 'string' ? e.message : JSON.stringify(e).slice(0, 200);
        } else {
          refundError = String(err);
        }
        this.logger.warn(
          `Refund failed for order ${orderId} (mp_id=${payment!.gatewayPaymentId}): ${refundError} | full=${JSON.stringify(err).slice(0, 500)}`,
        );

        // Race condition guard: webhook may have already processed the refund.
        // Verify with MP before surfacing an error to the operator.
        try {
          const mpPayment = await this.mp.getPayment(payment!.gatewayPaymentId!);
          if (mpPayment.status === 'refunded') {
            alreadyRefundedOnMp = true;
            refundError = undefined;
            this.logger.log(
              `Payment ${payment!.gatewayPaymentId} already refunded on MP (webhook race) — treating as success`,
            );
          }
        } catch {
          // getPayment failed — keep original refundError
        }
      }
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.order.update({
        where: { id: orderId },
        data: { status: OrderStatus.CANCELLED },
      });
      if (payment && ((canRefund && !refundError) || alreadyRefundedOnMp)) {
        await tx.payment.update({
          where: { id: payment.id },
          data: { status: PaymentStatus.REFUNDED },
        });
      }
    });

    // Devolução via StockService: o claim atômico de stockApplied garante que a
    // devolução acontece UMA vez, mesmo se o webhook de reembolso do MP chegar
    // em paralelo e também chamar restoreForOrder (incidente 09/07: o incremento
    // direto aqui duplicava o estoque nessa corrida).
    if (STOCK_RESTORE_STATUSES.includes(order.status)) {
      await this.stock.restoreForOrder(orderId);
      // Orchestrator: libera produtos únicos (o item nunca saiu da loja) e
      // propaga o estoque devolvido aos canais externos.
      this.events.emit(OmsEvents.OrderCancelled, { orderId, reason: 'expedicao.cancelamento' });
    }

    await recordOrderEvent(this.prisma, {
      orderId,
      status: OrderStatus.CANCELLED,
      actor,
      description: refundError ? `Reembolso não concluído: ${refundError}` : undefined,
    });

    return refundError ? { ok: true, refundError } : { ok: true };
  }

  async batchAction(ids: string[], action: string, actor?: string | null) {
    const results: { id: string; success: boolean; error?: string }[] = [];

    for (const id of ids) {
      try {
        switch (action) {
          case 'iniciar-separacao':
            await this.iniciarSeparacao(id, actor);
            break;
          case 'finalizar-separacao':
            await this.finalizarSeparacao(id, actor);
            break;
          case 'marcar-pronto':
            await this.marcarPronto(id, actor);
            break;
          case 'marcar-enviado':
            await this.marcarEnviado(id, actor);
            break;
          case 'confirmar-retirada':
            await this.confirmarRetirada(id, actor);
            break;
          default:
            throw new BadRequestException(`Ação desconhecida: ${action}`);
        }
        results.push({ id, success: true });
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        results.push({ id, success: false, error: message });
      }
    }

    const success = results.filter((r) => r.success).map((r) => r.id);
    const failed = results.filter((r) => !r.success);
    return { success, failed };
  }
}
