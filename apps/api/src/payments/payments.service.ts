import { Injectable, Logger, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { Prisma, PaymentMethod, PaymentStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { CreatePaymentDto } from './dto/create-payment.dto';
import { InvoiceService } from '../invoices/invoice.service';

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly invoiceService: InvoiceService,
  ) {}

  // ── Create ───────────────────────────────────────────────────────────────

  async create(_orderId: string, _userId: string, _dto: CreatePaymentDto): Promise<never> {
    // TODO: implementar com MercadoPagoService
    throw new ServiceUnavailableException(
      'Gateway de pagamento em manutenção. Tente novamente em breve.',
    );
  }

  // ── Get status ────────────────────────────────────────────────────────────

  async getStatus(paymentId: string, userId: string) {
    const payment = await this.prisma.payment.findFirst({
      where: { id: paymentId, order: { userId } },
    });
    if (!payment) throw new NotFoundException('Pagamento não encontrado.');
    return this.serialize(payment);
  }

  // ── Get by order ──────────────────────────────────────────────────────────

  async getByOrder(orderId: string, userId: string) {
    const order = await this.prisma.order.findFirst({ where: { id: orderId, userId } });
    if (!order) throw new NotFoundException('Pedido não encontrado.');
    const payment = await this.prisma.payment.findUnique({ where: { orderId } });
    if (!payment) throw new NotFoundException('Pagamento não encontrado.');
    return this.serialize(payment);
  }

  // ── Admin: list all payments ──────────────────────────────────────────────

  async findAll(params: { page: number; limit: number; method?: string; status?: string }) {
    const where: Prisma.PaymentWhereInput = {
      ...(params.method ? { method: params.method as PaymentMethod } : {}),
      ...(params.status ? { status: params.status as PaymentStatus } : {}),
    };

    const [total, data] = await Promise.all([
      this.prisma.payment.count({ where }),
      this.prisma.payment.findMany({
        where,
        include: {
          order: {
            select: { id: true, total: true, user: { select: { email: true, name: true } } },
          },
        },
        skip: (params.page - 1) * params.limit,
        take: params.limit,
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    return {
      data: data.map((p) => ({
        ...this.serialize(p),
        order: p.order
          ? {
              id: p.order.id,
              total: (p.order.total as unknown as { toNumber(): number }).toNumber(),
              user: p.order.user,
            }
          : null,
      })),
      total,
      page: params.page,
      pages: Math.ceil(total / params.limit),
    };
  }

  // ── Webhook ───────────────────────────────────────────────────────────────

  async handleWebhook(_rawBody: Buffer) {
    // TODO: implementar com MercadoPagoService
    this.logger.log('Webhook recebido — processamento ainda não implementado.');
    return { received: true };
  }

  // ── Serialize ─────────────────────────────────────────────────────────────

  private serialize(p: {
    id: string;
    orderId: string;
    gatewayPaymentId: string | null;
    clientSecret: string | null;
    method: PaymentMethod;
    status: PaymentStatus;
    amount: Prisma.Decimal;
    pixQrCode: string | null;
    pixQrCodeBase64: string | null;
    pixExpiresAt: Date | null;
    boletoUrl: string | null;
    boletoCode: string | null;
    boletoExpiresAt: Date | null;
    cardBrand: string | null;
    cardLast4: string | null;
    installments: number | null;
    rawStatus: string | null;
    statusDetail: string | null;
    createdAt: Date;
    updatedAt: Date;
  }) {
    return {
      id: p.id,
      orderId: p.orderId,
      gatewayPaymentId: p.gatewayPaymentId,
      clientSecret: p.clientSecret,
      method: p.method,
      status: p.status,
      amount: p.amount.toNumber(),
      pixQrCode: p.pixQrCode,
      pixQrCodeBase64: p.pixQrCodeBase64,
      pixExpiresAt: p.pixExpiresAt?.toISOString() ?? null,
      boletoUrl: p.boletoUrl,
      boletoCode: p.boletoCode,
      boletoExpiresAt: p.boletoExpiresAt?.toISOString() ?? null,
      cardBrand: p.cardBrand,
      cardLast4: p.cardLast4,
      installments: p.installments,
      rawStatus: p.rawStatus,
      statusDetail: p.statusDetail,
      createdAt: p.createdAt.toISOString(),
      updatedAt: p.updatedAt.toISOString(),
    };
  }
}
