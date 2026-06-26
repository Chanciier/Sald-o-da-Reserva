import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, timingSafeEqual } from 'crypto';
import { OrderStatus, PaymentMethod, PaymentStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { MercadoPagoService } from '../mercadopago/mercadopago.service';
import { RedisService } from '../redis/redis.service';
import { InvoiceService } from '../invoices/invoice.service';
import { ShippingService } from '../shipping/shipping.service';
import { MetaService } from '../meta/meta.service';
import { StockService } from '../stock/stock.service';
import type { MpPaymentResponse, MpWebhookPayload } from '../mercadopago/mercadopago.types';

// Payment statuses that trigger stock restoration and order cancellation
const RESTORE_ON: PaymentStatus[] = [
  PaymentStatus.CANCELLED,
  PaymentStatus.REFUNDED,
  PaymentStatus.CHARGED_BACK,
];

const IDEMPOTENCY_TTL = 86_400; // 24h — covers MP retry window

@Injectable()
export class WebhooksService {
  private readonly logger = new Logger(WebhooksService.name);
  private readonly webhookSecret: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly mp: MercadoPagoService,
    private readonly redis: RedisService,
    private readonly invoiceService: InvoiceService,
    private readonly shippingService: ShippingService,
    private readonly meta: MetaService,
    private readonly stock: StockService,
    private readonly config: ConfigService,
  ) {
    this.webhookSecret = this.config.get<string>('MERCADO_PAGO_WEBHOOK_SECRET', '');
  }

  async handleMercadoPago(
    rawBody: Buffer,
    xSignature?: string,
    xRequestId?: string,
    queryId?: string,
  ): Promise<{ received: true }> {
    // Validate HMAC — return 200 on failure so MP doesn't keep retrying.
    // Se um secret está configurado, a assinatura é OBRIGATÓRIA: omitir o header
    // x-signature não pode ser usado para burlar a verificação.
    if (this.webhookSecret) {
      if (!xSignature || !this.validateSignature(rawBody, xSignature, xRequestId, queryId)) {
        this.logger.warn('Webhook MP: assinatura ausente ou inválida — ignorado');
        return { received: true };
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
      await this.processPaymentEvent(String(mpId), payload.action);
    } catch (err) {
      this.logger.error(`Webhook MP: unhandled error mpId=${mpId}`, err);
    }

    return { received: true };
  }

  private async processPaymentEvent(mpPaymentId: string, action?: string) {
    // Fetch current state from MP
    const mpPayment = await this.mp.getPayment(mpPaymentId);
    const rawStatus = mpPayment.status ?? 'unknown';

    // ── Idempotency ───────────────────────────────────────────────────────────
    const idempotencyKey = `webhook:mp:${mpPaymentId}:${rawStatus}`;
    if (await this.redis.exists(idempotencyKey)) {
      this.logger.log(`Webhook MP: idempotent skip mpId=${mpPaymentId} status=${rawStatus}`);
      return;
    }

    // ── Load payment from DB ──────────────────────────────────────────────────
    const payment = await this.prisma.payment.findUnique({
      where: { gatewayPaymentId: mpPaymentId },
      include: { order: { include: { items: true, user: { select: { email: true } } } } },
    });

    if (!payment) {
      this.logger.warn(`Webhook MP: mpId=${mpPaymentId} not found in DB — skipping`);
      return;
    }

    const newStatus = this.mp.mapStatus(rawStatus);

    // Skip if already at this exact state
    if (payment.status === newStatus && payment.rawStatus === rawStatus) {
      await this.redis.set(idempotencyKey, '1', IDEMPOTENCY_TTL);
      return;
    }

    // ── Determine side effects ────────────────────────────────────────────────
    // Stock is decremented when the payment becomes approved and restored when it
    // leaves an approved state (refund/chargeback/cancel). StockService is
    // idempotent via order.stockApplied, so this is safe across all webhook paths.
    const becomingApproved =
      newStatus === PaymentStatus.APPROVED && payment.status !== PaymentStatus.APPROVED;
    const becomingRestored = RESTORE_ON.includes(newStatus) && !RESTORE_ON.includes(payment.status);

    const newOrderStatus = mapToOrderStatus(newStatus);

    const extras =
      payment.method === PaymentMethod.PIX
        ? this.mp.extractPix(mpPayment)
        : payment.method === PaymentMethod.CREDIT_CARD ||
            payment.method === PaymentMethod.DEBIT_CARD
          ? this.mp.extractCard(mpPayment)
          : {};

    // ── DB Transaction ────────────────────────────────────────────────────────
    await this.prisma.$transaction(async (tx) => {
      await tx.payment.update({
        where: { id: payment.id },
        data: {
          status: newStatus,
          rawStatus,
          statusDetail: mpPayment.status_detail ?? null,
          ...extras,
        },
      });

      await tx.paymentLog.create({
        data: {
          paymentId: payment.id,
          event: action ?? `webhook.${rawStatus}`,
          status: rawStatus,
          rawData: mpPayment as unknown as Prisma.InputJsonValue,
        },
      });

      if (newOrderStatus) {
        await tx.order.update({
          where: { id: payment.orderId },
          data: { status: newOrderStatus },
        });
      }

      await tx.auditLog.create({
        data: {
          action: 'webhook.payment.updated',
          metadata: {
            mpPaymentId,
            paymentId: payment.id,
            orderId: payment.orderId,
            previousStatus: payment.rawStatus,
            newRawStatus: rawStatus,
            newStatus,
            action: action ?? null,
            orderStatusChanged: newOrderStatus ?? null,
          } as Prisma.InputJsonValue,
        },
      });
    });

    // ── Post-commit: stock, Redis, Invoice ────────────────────────────────────
    let stockChanged = false;
    if (becomingApproved) {
      stockChanged = await this.stock.applyForOrder(payment.orderId);
    } else if (becomingRestored) {
      stockChanged = await this.stock.restoreForOrder(payment.orderId);
    }
    if (stockChanged) {
      await this.redis.delPattern('products:*'); // refresh storefront availability
    }

    await this.redis.set(idempotencyKey, '1', IDEMPOTENCY_TTL);

    if (newStatus === PaymentStatus.APPROVED) {
      this.shippingService
        .purchaseLabel(payment.orderId)
        .catch((e) =>
          this.logger.warn(
            `Webhook MP: auto-shipping skipped for order=${payment.orderId} — ${(e as Error).message}`,
          ),
        );

      this.meta.purchase({
        orderId: payment.orderId,
        amount: payment.amount.toNumber(),
        contentIds: payment.order.items.map((i) => i.productId),
        numItems: payment.order.items.reduce((s, i) => s + i.quantity, 0),
        email: payment.order.user?.email,
      });
    }

    this.logger.log(
      `Webhook MP: processed mpId=${mpPaymentId} ${payment.rawStatus}→${rawStatus}` +
        (newOrderStatus ? ` order→${newOrderStatus}` : ''),
    );
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
      const { ts, v1 } = parts;
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
}

function mapToOrderStatus(status: PaymentStatus): OrderStatus | null {
  switch (status) {
    case PaymentStatus.APPROVED:
      return OrderStatus.PAID;
    case PaymentStatus.CANCELLED:
      return OrderStatus.CANCELLED;
    case PaymentStatus.REFUNDED:
      return OrderStatus.REFUNDED;
    case PaymentStatus.CHARGED_BACK:
      return OrderStatus.REFUNDED;
    default:
      return null;
  }
}

// Re-export for use in PaymentsService (polling path)
export type { MpPaymentResponse };
