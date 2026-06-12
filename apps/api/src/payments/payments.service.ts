import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, timingSafeEqual } from 'crypto';
import { OrderStatus, PaymentMethod, PaymentStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { MercadoPagoService } from '../mercadopago/mercadopago.service';
import { MailService } from '../mail/mail.service';
import type { MpPaymentResponse, MpWebhookPayload } from '../mercadopago/mercadopago.types';
import type { CreatePaymentDto } from './dto/create-payment.dto';
import type { CreateCardPaymentDto } from './dto/create-card-payment.dto';
import { InvoiceService } from '../invoices/invoice.service';

const TERMINAL: PaymentStatus[] = ['REJECTED', 'CANCELLED', 'REFUNDED', 'CHARGED_BACK'];

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);
  private readonly webhookSecret: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly mp: MercadoPagoService,
    private readonly config: ConfigService,
    private readonly invoiceService: InvoiceService,
    private readonly mail: MailService,
  ) {
    this.webhookSecret = this.config.get<string>('MERCADO_PAGO_WEBHOOK_SECRET', '');
  }

  // ── POST /payments/pix ────────────────────────────────────────────────────

  async createPix(orderId: string, userId: string) {
    const order = await this.loadOrder(orderId, userId);
    const existing = await this.reuseOrClear(order, PaymentMethod.PIX);
    if (existing) return this.getById(existing.id, userId);

    const idempotencyKey = `pix-${orderId}-${Date.now()}`;
    let mpPayment: MpPaymentResponse;
    try {
      mpPayment = await this.mp.createPix({
        amount: order.total.toNumber(),
        description: `Pedido ${orderId.slice(-8).toUpperCase()}`,
        payerEmail: order.user.email,
        payerName: order.user.name ?? order.user.email,
        orderId,
        idempotencyKey,
      });
    } catch (err) {
      this.logger.error('MP createPix error', err);
      throw new BadRequestException(extractMpError(err));
    }

    const payment = await this.saveFromMp(orderId, PaymentMethod.PIX, order.total, mpPayment);
    this.logger.log(`PIX created: payment=${payment.id} mp=${mpPayment.id} order=${orderId}`);
    return this.serialize(payment);
  }

  // ── POST /payments/card ───────────────────────────────────────────────────

  async createCard(orderId: string, userId: string, dto: CreateCardPaymentDto) {
    const order = await this.loadOrder(orderId, userId);
    if (order.payment?.status === 'APPROVED') {
      return this.getById(order.payment.id, userId);
    }
    if (order.payment) {
      await this.prisma.payment.delete({ where: { id: order.payment.id } });
    }

    const idempotencyKey = `card-${orderId}-${Date.now()}`;
    let mpPayment: MpPaymentResponse;
    try {
      mpPayment = await this.mp.createCard({
        amount: order.total.toNumber(),
        description: `Pedido ${orderId.slice(-8).toUpperCase()}`,
        token: dto.token,
        installments: dto.installments,
        paymentMethodId: dto.paymentMethodId,
        issuerId: dto.issuerId,
        payerEmail: order.user.email,
        payerName: order.user.name ?? order.user.email,
        identificationNumber: dto.identificationNumber,
        orderId,
        idempotencyKey,
      });
    } catch (err) {
      this.logger.error(
        `MP createCard error | orderId=${orderId} paymentMethodId=${dto.paymentMethodId} installments=${dto.installments}`,
        JSON.stringify(err, Object.getOwnPropertyNames(err as object)),
      );
      throw new BadRequestException(extractMpError(err));
    }

    const payment = await this.saveFromMp(
      orderId,
      PaymentMethod.CREDIT_CARD,
      order.total,
      mpPayment,
    );
    this.logger.log(
      `Card payment: payment=${payment.id} mp=${mpPayment.id} status=${mpPayment.status} order=${orderId}`,
    );
    return this.serialize(payment);
  }

  // ── GET /payments/:id ─────────────────────────────────────────────────────

  async getById(paymentId: string, userId: string) {
    const payment = await this.prisma.payment.findFirst({
      where: { id: paymentId, order: { userId } },
    });
    if (!payment) throw new NotFoundException('Pagamento não encontrado.');

    if (payment.gatewayPaymentId) {
      try {
        const mpPayment = await this.mp.getPayment(payment.gatewayPaymentId);
        const updated = await this.syncFromMp(payment.id, mpPayment);
        if (updated) return this.serialize(updated);
      } catch (err) {
        this.logger.warn(`Failed to sync payment ${paymentId} from MP`, err);
      }
    }

    return this.serialize(payment);
  }

  // ── Legacy: POST /payments/order/:orderId ─────────────────────────────────

  async create(orderId: string, userId: string, dto: CreatePaymentDto) {
    if (dto.method === PaymentMethod.PIX) {
      return this.createPix(orderId, userId);
    }
    if (dto.method === PaymentMethod.CREDIT_CARD || dto.method === PaymentMethod.DEBIT_CARD) {
      throw new BadRequestException(
        'Use POST /payments/card com o token do cartão para pagamento com cartão.',
      );
    }
    throw new BadRequestException('Método de pagamento não suportado.');
  }

  // ── GET /payments/:paymentId/status (alias) ───────────────────────────────

  async getStatus(paymentId: string, userId: string) {
    return this.getById(paymentId, userId);
  }

  // ── GET /payments/order/:orderId ────────────────────────────────────────────

  async getByOrder(orderId: string, userId: string) {
    const order = await this.prisma.order.findFirst({ where: { id: orderId, userId } });
    if (!order) throw new NotFoundException('Pedido não encontrado.');
    const payment = await this.prisma.payment.findUnique({ where: { orderId } });
    if (!payment) throw new NotFoundException('Pagamento não encontrado.');
    return this.getById(payment.id, userId);
  }

  // ── Admin ─────────────────────────────────────────────────────────────────

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

  async handleWebhook(rawBody: Buffer, xSignature?: string, xRequestId?: string, queryId?: string) {
    if (this.webhookSecret && xSignature) {
      if (!this.validateSignature(rawBody, xSignature, xRequestId, queryId)) {
        this.logger.warn('Webhook: invalid signature');
        throw new BadRequestException('Assinatura inválida.');
      }
    }

    let payload: MpWebhookPayload;
    try {
      payload = JSON.parse(rawBody.toString()) as MpWebhookPayload;
    } catch {
      return { received: true };
    }

    if (payload.type !== 'payment') return { received: true };

    const mpId = payload.data?.id ?? queryId;
    if (!mpId) return { received: true };

    try {
      const mpPayment = await this.mp.getPayment(String(mpId));
      await this.processMpPayment(mpPayment);
    } catch (err) {
      this.logger.error(`Webhook: failed to process mpId=${mpId}`, err);
    }

    return { received: true };
  }

  // ── Private ───────────────────────────────────────────────────────────────

  private async loadOrder(orderId: string, userId: string) {
    const order = await this.prisma.order.findFirst({
      where: { id: orderId, userId },
      include: { user: true, payment: true },
    });
    if (!order) throw new NotFoundException('Pedido não encontrado.');
    if (order.status === 'CANCELLED') throw new BadRequestException('Pedido cancelado.');
    return order;
  }

  private async reuseOrClear(
    order: { payment: { id: string; status: PaymentStatus; method: PaymentMethod } | null },
    method: PaymentMethod,
  ) {
    if (!order.payment) return null;

    const p = order.payment;
    if (p.method === method && p.status === 'APPROVED') return p;
    if (p.method === method && !TERMINAL.includes(p.status)) return p;

    await this.prisma.payment.delete({ where: { id: p.id } });
    return null;
  }

  private async saveFromMp(
    orderId: string,
    method: PaymentMethod,
    amount: Prisma.Decimal,
    mp: MpPaymentResponse,
  ) {
    const status = this.mp.mapStatus(mp.status);
    const extras = method === PaymentMethod.PIX ? this.mp.extractPix(mp) : this.mp.extractCard(mp);

    return this.prisma
      .$transaction(async (tx) => {
        const existing = await tx.payment.findUnique({ where: { orderId } });
        if (existing && !TERMINAL.includes(existing.status) && existing.status !== 'APPROVED') {
          await tx.payment.delete({ where: { id: existing.id } });
        }

        const p = await tx.payment.create({
          data: {
            orderId,
            gatewayPaymentId: mp.id ? String(mp.id) : null,
            method,
            status,
            amount,
            idempotencyKey: `${orderId}-${method}-${Date.now()}`,
            rawStatus: mp.status ?? null,
            statusDetail: mp.status_detail ?? null,
            ...extras,
          },
        });

        await tx.paymentLog.create({
          data: {
            paymentId: p.id,
            event: 'payment.created',
            status: mp.status ?? null,
            rawData: mp as unknown as Prisma.InputJsonValue,
          },
        });

        if (status === 'APPROVED') {
          await tx.order.update({
            where: { id: orderId },
            data: { status: OrderStatus.PAID },
          });
        }

        await tx.auditLog.create({
          data: {
            action: 'payment.created',
            metadata: {
              paymentId: p.id,
              orderId,
              method,
              mpPaymentId: mp.id,
              amount: amount.toNumber(),
              status,
            } as Prisma.InputJsonValue,
          },
        });

        return p;
      })
      .then(async (p) => {
        if (p.status === 'APPROVED') {
          this.prisma.order
            .findUnique({ where: { id: orderId }, include: { user: true } })
            .then((o) => {
              if (o?.user)
                this.mail
                  .sendOrderConfirmedEmail(o.user.email, o.user.name, orderId, o.total.toNumber())
                  .catch((e) => this.logger.error('Order confirmed email failed', e));
            })
            .catch(() => {});
        }
        return p;
      });
  }

  private async syncFromMp(paymentId: string, mp: MpPaymentResponse) {
    return this.processMpPayment(mp, paymentId);
  }

  private async processMpPayment(mp: MpPaymentResponse, knownPaymentId?: string) {
    const mpId = mp.id ? String(mp.id) : null;
    if (!mpId) return null;

    const payment =
      (knownPaymentId
        ? await this.prisma.payment.findUnique({ where: { id: knownPaymentId } })
        : null) ?? (await this.prisma.payment.findUnique({ where: { gatewayPaymentId: mpId } }));

    if (!payment) {
      this.logger.warn(`Webhook: mpPaymentId=${mpId} not in DB`);
      return null;
    }

    const newStatus = this.mp.mapStatus(mp.status);
    const extras =
      payment.method === PaymentMethod.PIX
        ? this.mp.extractPix(mp)
        : payment.method === PaymentMethod.CREDIT_CARD ||
            payment.method === PaymentMethod.DEBIT_CARD
          ? this.mp.extractCard(mp)
          : {};

    if (payment.status === newStatus && payment.rawStatus === mp.status) {
      return payment;
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const p = await tx.payment.update({
        where: { id: payment.id },
        data: {
          status: newStatus,
          rawStatus: mp.status ?? null,
          statusDetail: mp.status_detail ?? null,
          ...extras,
        },
      });

      await tx.paymentLog.create({
        data: {
          paymentId: p.id,
          event: `webhook.${mp.status}`,
          status: mp.status ?? null,
          rawData: mp as unknown as Prisma.InputJsonValue,
        },
      });

      if (newStatus === 'APPROVED') {
        await tx.order.update({
          where: { id: payment.orderId },
          data: { status: OrderStatus.PAID },
        });
      }

      return p;
    });

    if (newStatus === 'APPROVED') {
      this.prisma.order
        .findUnique({ where: { id: payment.orderId }, include: { user: true } })
        .then((o) => {
          if (o?.user)
            this.mail
              .sendOrderConfirmedEmail(
                o.user.email,
                o.user.name,
                payment.orderId,
                o.total.toNumber(),
              )
              .catch((e) => this.logger.error('Order confirmed email failed', e));
        })
        .catch(() => {});
    }

    return updated;
  }

  private validateSignature(
    rawBody: Buffer,
    xSignature: string,
    xRequestId?: string,
    queryId?: string,
  ): boolean {
    try {
      const parts = Object.fromEntries(
        xSignature.split(',').map((p) => {
          const [k, v] = p.split('=');
          return [k.trim(), v.trim()];
        }),
      );
      const ts = parts.ts;
      const v1 = parts.v1;
      if (!ts || !v1) return false;

      const dataId = queryId ? queryId.toLowerCase() : '';
      const manifest = xRequestId
        ? `id:${dataId};request-id:${xRequestId};ts:${ts};`
        : `id:${dataId};ts:${ts};`;

      const hash = createHmac('sha256', this.webhookSecret).update(manifest).digest('hex');
      return timingSafeEqual(Buffer.from(hash), Buffer.from(v1));
    } catch {
      return false;
    }
  }

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

const MP_ERROR_MAP: Record<string, string> = {
  internal_error: 'Erro no processamento do cartão. Verifique os dados e tente novamente.',
  cc_rejected_call_for_authorize:
    'Cartão requer autorização. Entre em contato com o banco emissor.',
  cc_rejected_insufficient_amount: 'Saldo insuficiente no cartão.',
  cc_rejected_bad_filled_security_code: 'Código de segurança (CVV) incorreto.',
  cc_rejected_bad_filled_date: 'Data de validade incorreta.',
  cc_rejected_bad_filled_card_number: 'Número do cartão incorreto.',
  cc_rejected_blacklist: 'Cartão não aceito para esta transação.',
  cc_rejected_card_disabled: 'Cartão desabilitado. Entre em contato com o banco emissor.',
  cc_rejected_duplicated_payment: 'Pagamento duplicado. Aguarde alguns minutos e tente novamente.',
  cc_rejected_high_risk: 'Pagamento recusado por segurança.',
  cc_rejected_max_attempts: 'Número máximo de tentativas excedido. Tente outro cartão.',
  pending_contingency: 'Pagamento em processamento. Aguarde a confirmação.',
  pending_review_manual: 'Pagamento em análise. Você será notificado em breve.',
  rejected_by_bank: 'Pagamento recusado pelo banco. Entre em contato com o banco emissor.',
};

function extractMpError(err: unknown): string {
  if (err && typeof err === 'object') {
    const e = err as Record<string, unknown>;

    // MP SDK v2: cause can be an array of { code, description }
    const causeArr = e.cause as Array<{ code?: number; description?: string }> | undefined;
    if (Array.isArray(causeArr) && causeArr.length > 0) {
      const desc = causeArr[0].description?.toLowerCase();
      if (desc && MP_ERROR_MAP[desc]) return MP_ERROR_MAP[desc];
      if (desc) return desc;
    }

    // MP SDK v2: cause as object
    const cause = e.cause as Record<string, unknown> | undefined;
    if (cause?.message) {
      const msg = String(cause.message).toLowerCase();
      return MP_ERROR_MAP[msg] ?? String(cause.message);
    }
    if (cause?.error) {
      const msg = String(cause.error).toLowerCase();
      return MP_ERROR_MAP[msg] ?? String(cause.error);
    }
    if (e.message) {
      const msg = String(e.message).toLowerCase();
      return MP_ERROR_MAP[msg] ?? String(e.message);
    }
  }
  return 'Erro ao processar pagamento. Verifique os dados do cartão e tente novamente.';
}
