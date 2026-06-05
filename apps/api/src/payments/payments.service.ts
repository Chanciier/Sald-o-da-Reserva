import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Stripe from 'stripe';
import { Prisma, PaymentMethod, PaymentStatus, OrderStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { CreatePaymentDto } from './dto/create-payment.dto';
import { InvoiceService } from '../invoices/invoice.service';

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);
  private readonly stripe: Stripe;
  private readonly webhookSecret: string;
  private readonly frontendUrl: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly invoiceService: InvoiceService,
  ) {
    this.stripe = new Stripe(this.config.get<string>('STRIPE_SECRET_KEY', ''));
    this.webhookSecret = this.config.get<string>('STRIPE_WEBHOOK_SECRET', '');
    this.frontendUrl = this.config.get<string>('FRONTEND_URL', 'http://localhost:3000');
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
      const isCard = dto.method === 'CREDIT_CARD' || dto.method === 'DEBIT_CARD';
      const terminal: PaymentStatus[] = ['REJECTED', 'CANCELLED'];
      if (isCard) terminal.push('PENDING');
      if (!terminal.includes(order.payment.status)) {
        return this.serialize(order.payment);
      }
      await this.prisma.payment.delete({ where: { id: order.payment.id } });
    }

    const secretKey = this.config.get<string>('STRIPE_SECRET_KEY', '');
    if (!secretKey) {
      throw new BadRequestException('Gateway de pagamento não configurado. Contate o suporte.');
    }

    const amount = Math.round(order.total.toNumber() * 100); // Stripe uses cents
    const fullName = order.user.name ?? order.user.email;
    const returnUrl = `${this.frontendUrl}/pedidos/${orderId}`;

    let pi: Stripe.PaymentIntent;

    try {
      switch (dto.method) {
        case PaymentMethod.PIX:
          pi = await this.stripe.paymentIntents.create({
            amount,
            currency: 'brl',
            payment_method_types: ['pix'],
            payment_method_data: { type: 'pix' },
            confirm: true,
            return_url: returnUrl,
            metadata: { orderId, userId },
          });
          break;

        case PaymentMethod.BOLETO: {
          const taxId = (dto.taxId ?? '').replace(/\D/g, '') || '00000000000';
          pi = await this.stripe.paymentIntents.create({
            amount,
            currency: 'brl',
            payment_method_types: ['boleto'],
            payment_method_data: {
              type: 'boleto',
              billing_details: { name: fullName, email: order.user.email },
              boleto: { tax_id: taxId },
            },
            confirm: true,
            return_url: returnUrl,
            payment_method_options: { boleto: { expires_after_days: 3 } },
            metadata: { orderId, userId },
          });
          break;
        }

        case PaymentMethod.CREDIT_CARD:
        case PaymentMethod.DEBIT_CARD:
          pi = await this.stripe.paymentIntents.create({
            amount,
            currency: 'brl',
            payment_method_types: ['card'],
            metadata: { orderId, userId },
          });
          break;

        default:
          throw new BadRequestException('Método de pagamento não suportado.');
      }
    } catch (err: unknown) {
      if (err instanceof BadRequestException) throw err;
      const msg = (err as Stripe.errors.StripeError).message ?? 'Erro ao processar pagamento.';
      this.logger.error('Stripe create payment error', { orderId, method: dto.method, err });
      throw new BadRequestException(msg);
    }

    const status = this.mapStatus(pi.status);
    const extras = this.extractExtras(dto.method, pi);

    const payment = await this.prisma.$transaction(async (tx) => {
      const p = await tx.payment.create({
        data: {
          orderId,
          gatewayPaymentId: pi.id,
          clientSecret: pi.client_secret ?? null,
          method: dto.method,
          status,
          amount: order.total,
          idempotencyKey: `${orderId}-${dto.method}-${Date.now()}`,
          rawStatus: pi.status,
          ...extras,
        },
      });

      await tx.paymentLog.create({
        data: {
          paymentId: p.id,
          event: 'payment.created',
          status: pi.status,
          rawData: pi as unknown as Prisma.InputJsonValue,
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
            stripePaymentIntentId: pi.id,
            amount: order.total.toNumber(),
          } as Prisma.InputJsonValue,
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

  // ── Stripe Webhook ────────────────────────────────────────────────────────

  async handleWebhook(rawBody: Buffer, signature: string) {
    let event: Stripe.Event;

    if (this.webhookSecret && signature) {
      try {
        event = this.stripe.webhooks.constructEvent(rawBody, signature, this.webhookSecret);
      } catch {
        this.logger.warn('Webhook: invalid signature');
        throw new BadRequestException('Assinatura inválida.');
      }
    } else {
      event = JSON.parse(rawBody.toString()) as Stripe.Event;
    }

    const pi = event.data.object as Stripe.PaymentIntent;

    const handled = [
      'payment_intent.succeeded',
      'payment_intent.payment_failed',
      'payment_intent.canceled',
      'payment_intent.processing',
      'payment_intent.requires_action',
    ];

    if (!handled.includes(event.type)) return { received: true };

    try {
      await this.processUpdate(pi, event.type);
    } catch (err) {
      this.logger.error(`Webhook: failed to process piId=${pi.id}`, err);
    }

    return { received: true };
  }

  // ── Private: process webhook update ──────────────────────────────────────

  private async processUpdate(pi: Stripe.PaymentIntent, eventType: string) {
    const payment = await this.prisma.payment.findUnique({
      where: { gatewayPaymentId: pi.id },
    });

    if (!payment) {
      this.logger.warn(`Webhook: no payment found for piId=${pi.id}`);
      return;
    }

    const newStatus = this.mapStatus(pi.status);
    if (payment.status === newStatus) return;

    const extras = this.extractExtras(payment.method, pi);

    await this.prisma.$transaction(async (tx) => {
      await tx.payment.update({
        where: { id: payment.id },
        data: { status: newStatus, rawStatus: pi.status, ...extras },
      });

      await tx.paymentLog.create({
        data: {
          paymentId: payment.id,
          event: eventType,
          status: pi.status,
          rawData: pi as unknown as Prisma.InputJsonValue,
        },
      });

      if (newStatus === 'APPROVED') {
        await tx.order.update({
          where: { id: payment.orderId },
          data: { status: OrderStatus.PAID },
        });
      }
    });

    if (newStatus === 'APPROVED') {
      this.invoiceService
        .emitForOrder(payment.orderId)
        .catch((e) => this.logger.error('Invoice emission failed', e));
    }
  }

  // ── Private: map Stripe status ────────────────────────────────────────────

  private mapStatus(stripeStatus: Stripe.PaymentIntent.Status): PaymentStatus {
    switch (stripeStatus) {
      case 'succeeded':
        return 'APPROVED';
      case 'canceled':
        return 'CANCELLED';
      case 'requires_capture':
        return 'AUTHORIZED';
      case 'processing':
      case 'requires_action':
      case 'requires_confirmation':
      case 'requires_payment_method':
      default:
        return 'PENDING';
    }
  }

  // ── Private: extract method-specific fields from Stripe PI ───────────────

  private extractExtras(method: PaymentMethod, pi: Stripe.PaymentIntent) {
    const nextAction = pi.next_action;

    if (method === PaymentMethod.PIX) {
      const pix = nextAction?.pix_display_qr_code as
        | { data?: string; image_url_png?: string; expiration_timestamp?: number }
        | undefined;
      return {
        pixQrCode: pix?.data ?? null,
        pixQrCodeBase64: pix?.image_url_png ?? null,
        pixExpiresAt: pix?.expiration_timestamp ? new Date(pix.expiration_timestamp * 1000) : null,
      };
    }

    if (method === PaymentMethod.BOLETO) {
      const boleto = nextAction?.boleto_display_details as
        | { hosted_voucher_url?: string; number?: string; expires_at?: number }
        | undefined;
      return {
        boletoUrl: boleto?.hosted_voucher_url ?? null,
        boletoCode: boleto?.number ?? null,
        boletoExpiresAt: boleto?.expires_at ? new Date(boleto.expires_at * 1000) : null,
      };
    }

    if (method === PaymentMethod.CREDIT_CARD || method === PaymentMethod.DEBIT_CARD) {
      const charge = (pi.latest_charge as Stripe.Charge | null)?.payment_method_details?.card;
      const installmentsObj = charge?.installments as { count?: number } | null | undefined;
      return {
        cardBrand: charge?.brand ?? null,
        cardLast4: charge?.last4 ?? null,
        installments: installmentsObj?.count ?? null,
      };
    }

    return {};
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
