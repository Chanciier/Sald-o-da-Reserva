import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MercadoPagoConfig, Payment as MpPayment } from 'mercadopago';
import { createHmac } from 'crypto';
import { Prisma, PaymentMethod, PaymentStatus, OrderStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { CreatePaymentDto } from './dto/create-payment.dto';

type MpRaw = Record<string, unknown>;

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);
  private readonly mp: MpPayment;
  private readonly webhookSecret: string;
  private readonly webhookUrl: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {
    const client = new MercadoPagoConfig({
      accessToken: this.config.get<string>('MERCADO_PAGO_ACCESS_TOKEN', ''),
      options: { timeout: 10000 },
    });
    this.mp = new MpPayment(client);
    this.webhookSecret = this.config.get<string>('MERCADO_PAGO_WEBHOOK_SECRET', '');
    this.webhookUrl = this.config.get<string>('MERCADO_PAGO_WEBHOOK_URL', '');
  }

  // ── Create ───────────────────────────────────────────────────────────────

  async create(orderId: string, userId: string, dto: CreatePaymentDto) {
    const order = await this.prisma.order.findFirst({
      where: { id: orderId, userId },
      include: { user: true, payment: true },
    });
    if (!order) throw new NotFoundException('Pedido não encontrado.');
    if (order.status === 'CANCELLED') throw new BadRequestException('Pedido cancelado.');

    // Idempotency: return existing active payment
    if (order.payment) {
      const terminal: string[] = ['REJECTED', 'CANCELLED'];
      if (!terminal.includes(order.payment.status)) {
        return this.serialize(order.payment);
      }
      // Delete rejected/cancelled to allow retry
      await this.prisma.payment.delete({ where: { id: order.payment.id } });
    }

    const accessToken = this.config.get<string>('MERCADO_PAGO_ACCESS_TOKEN', '');
    if (!accessToken) {
      throw new BadRequestException('Gateway de pagamento não configurado. Contate o suporte.');
    }

    const idempotencyKey = `order-${orderId}-${dto.method}`;
    const body = this.buildBody(order as Parameters<typeof this.buildBody>[0], dto);

    let mpRaw: MpRaw;
    try {
      mpRaw = (await this.mp.create({
        body: body as Parameters<typeof this.mp.create>[0]['body'],
        requestOptions: { idempotencyKey },
      })) as unknown as MpRaw;
    } catch (err: unknown) {
      const cause = err as { cause?: { description?: string }; message?: string };
      const msg =
        cause?.cause?.description ??
        cause?.message ??
        'Erro ao processar pagamento. Tente novamente.';
      this.logger.error('MP create payment error', { orderId, method: dto.method, err });
      throw new BadRequestException(msg);
    }

    const mpStatus = mpRaw.status as string;
    const status = this.mapStatus(mpStatus);
    const extras = this.extractExtras(dto.method, mpRaw);

    const payment = await this.prisma.$transaction(async (tx) => {
      const p = await tx.payment.create({
        data: {
          orderId,
          mpPaymentId: String(mpRaw.id),
          method: dto.method,
          status,
          amount: order.total,
          idempotencyKey,
          rawStatus: mpStatus,
          statusDetail: (mpRaw.status_detail as string) ?? null,
          ...extras,
        },
      });

      await tx.paymentLog.create({
        data: {
          paymentId: p.id,
          event: 'payment.created',
          status: mpStatus,
          rawData: mpRaw as unknown as Prisma.InputJsonValue,
        },
      });

      await tx.auditLog.create({
        data: {
          action: 'payment.created',
          userId,
          metadata: {
            paymentId: p.id,
            orderId,
            method: dto.method,
            mpPaymentId: String(mpRaw.id),
            amount: order.total.toNumber(),
          },
        },
      });

      return p;
    });

    this.logger.log(
      `Payment created: id=${payment.id} method=${dto.method} status=${status} order=${orderId}`,
    );
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

  // ── Webhook ───────────────────────────────────────────────────────────────

  async handleWebhook(body: MpRaw, xSignature: string | undefined, xRequestId: string | undefined) {
    // Validate HMAC-SHA256 signature if secret is configured
    if (this.webhookSecret && xSignature) {
      if (!this.validateSignature(body, xSignature, xRequestId)) {
        this.logger.warn('Webhook: invalid signature rejected');
        throw new BadRequestException('Assinatura inválida.');
      }
    }

    // Only handle payment events
    if (body.type !== 'payment') return { received: true };

    const dataId = String((body.data as MpRaw)?.id);
    if (!dataId || dataId === 'undefined') return { received: true };

    try {
      const mpRaw = (await this.mp.get({ id: dataId })) as unknown as MpRaw;
      await this.processUpdate(mpRaw);
    } catch (err) {
      this.logger.error(`Webhook: failed to process mpId=${dataId}`, err);
      // Return 200 anyway so MP doesn't retry indefinitely
    }

    return { received: true };
  }

  // ── Private: process webhook update ──────────────────────────────────────

  private async processUpdate(mpRaw: MpRaw) {
    const mpPaymentId = String(mpRaw.id);
    const mpStatus = mpRaw.status as string;
    const statusDetail = (mpRaw.status_detail as string) ?? null;
    const newStatus = this.mapStatus(mpStatus);

    const payment = await this.prisma.payment.findUnique({
      where: { mpPaymentId },
      include: { order: true },
    });

    if (!payment) {
      this.logger.warn(`Webhook: mpPaymentId=${mpPaymentId} not in DB – ignoring`);
      return;
    }

    // Idempotency: skip if status unchanged
    if (payment.status === newStatus) {
      this.logger.log(`Webhook: payment=${payment.id} already ${newStatus} – skip`);
      return;
    }

    const newOrderStatus = this.toOrderStatus(newStatus);

    await this.prisma.$transaction(async (tx) => {
      await tx.payment.update({
        where: { id: payment.id },
        data: { status: newStatus, rawStatus: mpStatus, statusDetail },
      });

      await tx.paymentLog.create({
        data: {
          paymentId: payment.id,
          event: `webhook.${mpStatus}`,
          status: mpStatus,
          rawData: mpRaw as unknown as Prisma.InputJsonValue,
        },
      });

      if (newOrderStatus && newOrderStatus !== payment.order.status) {
        await tx.order.update({
          where: { id: payment.orderId },
          data: { status: newOrderStatus },
        });
      }

      await tx.auditLog.create({
        data: {
          action: `payment.webhook.${mpStatus}`,
          userId: payment.order.userId,
          metadata: {
            paymentId: payment.id,
            mpPaymentId,
            orderId: payment.orderId,
            from: payment.status,
            to: newStatus,
            statusDetail,
          },
        },
      });
    });

    this.logger.log(
      `Webhook: payment=${payment.id} ${payment.status}→${newStatus} order=${payment.orderId}`,
    );
  }

  // ── Private: build MP request body ───────────────────────────────────────

  private buildBody(
    order: {
      id: string;
      total: { toNumber(): number };
      user: { email: string; name: string | null };
    },
    dto: CreatePaymentDto,
  ): MpRaw {
    const amount = order.total.toNumber();
    const fullName = order.user.name ?? order.user.email;
    const [firstName, ...nameParts] = fullName.split(' ');
    const lastName = nameParts.join(' ') || firstName;

    const base: MpRaw = {
      transaction_amount: amount,
      description: `Saldão da Reversa #${order.id.slice(-8).toUpperCase()}`,
      external_reference: order.id,
      ...(this.webhookUrl ? { notification_url: this.webhookUrl } : {}),
      payer: {
        email: order.user.email,
        first_name: firstName,
        last_name: lastName,
        ...(dto.payer?.identification
          ? {
              identification: {
                type: dto.payer.identification.type,
                number: dto.payer.identification.number,
              },
            }
          : {}),
      },
    };

    switch (dto.method) {
      case PaymentMethod.PIX:
        return {
          ...base,
          payment_method_id: 'pix',
          date_of_expiration: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
        };

      case PaymentMethod.BOLETO:
        return {
          ...base,
          payment_method_id: dto.boletoMethod ?? 'bolbradesco',
          date_of_expiration: (() => {
            const d = new Date();
            d.setDate(d.getDate() + 3);
            d.setHours(23, 59, 59, 0);
            return d.toISOString();
          })(),
        };

      case PaymentMethod.CREDIT_CARD:
      case PaymentMethod.DEBIT_CARD:
        if (!dto.cardToken)
          throw new BadRequestException('cardToken é obrigatório para pagamento com cartão.');
        if (!dto.paymentMethodId)
          throw new BadRequestException('paymentMethodId é obrigatório para pagamento com cartão.');
        return {
          ...base,
          token: dto.cardToken,
          payment_method_id: dto.paymentMethodId,
          installments: dto.installments ?? 1,
          statement_descriptor: 'SALDAO REVERSA',
        };

      default:
        throw new BadRequestException('Método de pagamento não suportado.');
    }
  }

  // ── Private: extract method-specific fields from MP response ─────────────

  private extractExtras(method: PaymentMethod, mp: MpRaw) {
    if (method === PaymentMethod.PIX) {
      const poi = mp.point_of_interaction as MpRaw | undefined;
      const txData = poi?.transaction_data as MpRaw | undefined;
      return {
        pixQrCode: (txData?.qr_code as string) ?? null,
        pixQrCodeBase64: (txData?.qr_code_base64 as string) ?? null,
        pixExpiresAt: mp.date_of_expiration ? new Date(mp.date_of_expiration as string) : null,
      };
    }

    if (method === PaymentMethod.BOLETO) {
      const txDetails = mp.transaction_details as MpRaw | undefined;
      const barcode = mp.barcode as MpRaw | undefined;
      return {
        boletoUrl: (txDetails?.external_resource_url as string) ?? null,
        boletoCode: (barcode?.content as string) ?? null,
        boletoExpiresAt: mp.date_of_expiration ? new Date(mp.date_of_expiration as string) : null,
      };
    }

    // Card
    const card = mp.card as MpRaw | undefined;
    return {
      cardBrand: (mp.payment_method_id as string) ?? null,
      cardLast4: (card?.last_four_digits as string) ?? null,
      installments: (mp.installments as number) ?? null,
    };
  }

  // ── Private: status mapping ───────────────────────────────────────────────

  private mapStatus(mpStatus: string): PaymentStatus {
    const map: Record<string, PaymentStatus> = {
      approved: 'APPROVED',
      authorized: 'AUTHORIZED',
      in_process: 'IN_PROCESS',
      in_mediation: 'IN_MEDIATION',
      pending: 'PENDING',
      rejected: 'REJECTED',
      cancelled: 'CANCELLED',
      refunded: 'REFUNDED',
      charged_back: 'CHARGED_BACK',
    };
    return map[mpStatus] ?? 'PENDING';
  }

  private toOrderStatus(ps: PaymentStatus): OrderStatus | null {
    if (ps === 'APPROVED') return 'PAID';
    if (ps === 'REFUNDED' || ps === 'CHARGED_BACK') return 'REFUNDED';
    if (ps === 'CANCELLED') return 'CANCELLED';
    return null;
  }

  // ── Private: webhook HMAC-SHA256 validation ───────────────────────────────

  private validateSignature(body: MpRaw, xSignature: string, xRequestId?: string): boolean {
    try {
      const ts = xSignature
        .split(',')
        .find((p) => p.startsWith('ts='))
        ?.slice(3);
      const v1 = xSignature
        .split(',')
        .find((p) => p.startsWith('v1='))
        ?.slice(3);
      if (!ts || !v1) return false;

      const dataId = (body.data as MpRaw)?.id;
      const parts: string[] = [];
      if (dataId) parts.push(`id:${dataId}`);
      if (xRequestId) parts.push(`request-id:${xRequestId}`);
      parts.push(`ts:${ts}`);
      const manifest = parts.join(';') + ';';

      const hash = createHmac('sha256', this.webhookSecret).update(manifest).digest('hex');
      return hash === v1;
    } catch {
      return false;
    }
  }

  // ── Private: serialize Decimal fields ────────────────────────────────────

  private serialize(p: {
    id: string;
    orderId: string;
    mpPaymentId: string | null;
    method: string;
    status: string;
    amount: { toNumber(): number };
    idempotencyKey: string;
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
    return { ...p, amount: p.amount.toNumber() };
  }
}
