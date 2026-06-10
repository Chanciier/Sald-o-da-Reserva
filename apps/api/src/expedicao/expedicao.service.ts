import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { DeliveryMethod, OrderStatus, PaymentStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { MercadoPagoService } from '../mercadopago/mercadopago.service';

const CANCELLABLE_STATUSES: OrderStatus[] = [
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

function generatePickupCode(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code = 'RET-';
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
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
  ) {}

  async getStats(userId: string | null) {
    const userFilter = userId ? { userId } : {};

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const [aguardandoSeparacao, separatedOrders, enviadosHoje, retiradosHoje] = await Promise.all([
      this.prisma.order.count({
        where: { status: OrderStatus.PAID, ...userFilter },
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
    ]);

    const aguardandoNFe = separatedOrders.filter(
      (o) => !o.invoices.some((inv) => inv.status === 'AUTHORIZED'),
    ).length;

    const aguardandoEtiqueta = separatedOrders.filter(
      (o) => o.deliveryMethod === DeliveryMethod.SHIPPING && (!o.shipment || !o.shipment.labelUrl),
    ).length;

    return {
      aguardandoSeparacao,
      aguardandoNFe,
      aguardandoEtiqueta,
      enviadosHoje,
      retiradosHoje,
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

  async getSeparacao(opts: { page: number; userId?: string | null }) {
    const { page, userId } = opts;
    const skip = (page - 1) * PAGE_SIZE;
    const where: Record<string, unknown> = { status: OrderStatus.SEPARATING };
    if (userId) where.userId = userId;

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

  async getRetirada(opts: { page: number; userId?: string | null }) {
    const { page, userId } = opts;
    const skip = (page - 1) * PAGE_SIZE;

    const where: Record<string, unknown> = {
      deliveryMethod: DeliveryMethod.PICKUP,
      status: { in: [OrderStatus.SEPARATED, OrderStatus.READY_TO_SHIP] },
    };
    if (userId) where.userId = userId;

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

  async getConcluidos(opts: { page: number; search?: string; userId?: string | null }) {
    const { page, search, userId } = opts;
    const skip = (page - 1) * PAGE_SIZE;

    const where: Record<string, unknown> = { status: OrderStatus.DELIVERED };
    if (userId) where.userId = userId;
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

  async iniciarSeparacao(orderId: string) {
    const order = await this.prisma.order.findUnique({ where: { id: orderId } });
    if (!order) throw new NotFoundException('Pedido não encontrado.');
    if (order.status !== OrderStatus.PAID) {
      throw new BadRequestException(
        `Pedido deve estar em PAID para iniciar separação. Status atual: ${order.status}`,
      );
    }

    const data: Record<string, unknown> = { status: OrderStatus.SEPARATING };
    if (order.deliveryMethod === DeliveryMethod.PICKUP && !order.pickupCode) {
      data.pickupCode = generatePickupCode();
    }

    return this.prisma.order.update({ where: { id: orderId }, data });
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

  async finalizarSeparacao(orderId: string) {
    const order = await this.prisma.order.findUnique({ where: { id: orderId } });
    if (!order) throw new NotFoundException('Pedido não encontrado.');
    if (order.status !== OrderStatus.SEPARATING) {
      throw new BadRequestException(
        `Pedido deve estar em SEPARATING para finalizar separação. Status atual: ${order.status}`,
      );
    }

    return this.prisma.order.update({
      where: { id: orderId },
      data: { status: OrderStatus.SEPARATED },
    });
  }

  async marcarPronto(orderId: string) {
    const order = await this.prisma.order.findUnique({ where: { id: orderId } });
    if (!order) throw new NotFoundException('Pedido não encontrado.');
    if (order.status !== OrderStatus.SEPARATED) {
      throw new BadRequestException(
        `Pedido deve estar em SEPARATED para marcar como pronto. Status atual: ${order.status}`,
      );
    }

    return this.prisma.order.update({
      where: { id: orderId },
      data: { status: OrderStatus.READY_TO_SHIP },
    });
  }

  async confirmarRetirada(orderId: string) {
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

    return this.prisma.order.update({
      where: { id: orderId },
      data: { status: OrderStatus.DELIVERED },
    });
  }

  async cancelarPedido(orderId: string): Promise<{ ok: true; refundError?: string }> {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: {
        items: { select: { productId: true, quantity: true } },
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

    if (canRefund) {
      try {
        await this.mp.createRefund(payment!.gatewayPaymentId!);
        this.logger.log(`Refund issued for order ${orderId}, payment ${payment!.gatewayPaymentId}`);
      } catch (err) {
        refundError = err instanceof Error ? err.message : String(err);
        this.logger.warn(`Refund failed for order ${orderId}: ${refundError}`);
      }
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.order.update({
        where: { id: orderId },
        data: { status: OrderStatus.CANCELLED },
      });
      if (payment && canRefund && !refundError) {
        await tx.payment.update({
          where: { id: payment.id },
          data: { status: PaymentStatus.REFUNDED },
        });
      }
      for (const item of order.items) {
        const updated = await tx.product.update({
          where: { id: item.productId },
          data: { stock: { increment: item.quantity } },
          select: { stock: true, status: true },
        });
        if (updated.stock > 0 && updated.status === 'INACTIVE') {
          await tx.product.update({
            where: { id: item.productId },
            data: { status: 'ACTIVE' },
          });
        }
      }
    });

    return refundError ? { ok: true, refundError } : { ok: true };
  }

  async batchAction(ids: string[], action: string) {
    const results: { id: string; success: boolean; error?: string }[] = [];

    for (const id of ids) {
      try {
        switch (action) {
          case 'iniciar-separacao':
            await this.iniciarSeparacao(id);
            break;
          case 'finalizar-separacao':
            await this.finalizarSeparacao(id);
            break;
          case 'marcar-pronto':
            await this.marcarPronto(id);
            break;
          case 'confirmar-retirada':
            await this.confirmarRetirada(id);
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
