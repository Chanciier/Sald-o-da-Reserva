import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, timingSafeEqual } from 'crypto';
import { OrderStatus, PaymentMethod, PaymentStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { MercadoPagoService } from '../mercadopago/mercadopago.service';
import { RedisService } from '../redis/redis.service';
import { InvoiceService } from '../invoices/invoice.service';
import { ShippingService } from '../shipping/shipping.service';
import type { MpPaymentResponse, MpWebhookPayload } from '../mercadopago/mercadopago.types';

// Payment statuses that trigger stock restoration and order cancellation
const RESTORE_ON: PaymentStatus[] = [
  PaymentStatus.CANCELLED,
  PaymentStatus.REFUNDED,
  PaymentStatus.CHARGED_BACK,
];

const IDEMPOTENCY_TTL = 86_400; // 24h — covers MP retry window
const STOCK_RESTORE_TTL = 86_400 * 30; // 30d — idempotency for stock ops

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
    // Validate HMAC — return 200 on failure so MP doesn't keep retrying
    if (this.webhookSecret && xSignature) {
      if (!this.validateSignature(rawBody, xSignature, xRequestId, queryId)) {
        this.logger.warn('Webhook MP: invalid HMAC signature');
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
      include: { order: { include: { items: true } } },
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
    const shouldRestoreStock =
      RESTORE_ON.includes(newStatus) && !RESTORE_ON.includes(payment.status);

    const stockKey = `webhook:stock:restored:${payment.orderId}`;
    const stockAlreadyRestored = shouldRestoreStock ? await this.redis.exists(stockKey) : false;
    const actuallyRestoreStock = shouldRestoreStock && !stockAlreadyRestored;

    const newOrderStatus = mapToOrderStatus(newStatus);

    const extras =
      payment.method === PaymentMethod.PIX
        ? this.mp.extractPix(mpPayment)
        : payment.method === PaymentMethod.CREDIT_CARD ||
            payment.method === PaymentMethod.DEBIT_CARD
          ? this.mp.extractCard(mpPayment)
          : {};

    // ── DB Transaction ────────────────────────────────────────────────────────
    const restoredItems = await this.prisma.$transaction(async (tx) => {
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

      let itemsRestored: Array<{ productId: string; quantity: number }> = [];
      if (actuallyRestoreStock) {
        itemsRestored = payment.order.items.map((i) => ({
          productId: i.productId,
          quantity: i.quantity,
        }));
        for (const item of itemsRestored) {
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
            stockRestored: actuallyRestoreStock,
            itemsRestored,
          } as Prisma.InputJsonValue,
        },
      });

      return itemsRestored;
    });

    // ── Post-commit: Redis + Invoice ──────────────────────────────────────────
    await this.redis.set(idempotencyKey, '1', IDEMPOTENCY_TTL);

    if (actuallyRestoreStock && restoredItems.length) {
      await this.redis.set(stockKey, '1', STOCK_RESTORE_TTL);
      this.logger.log(
        `Webhook MP: stock restored for order=${payment.orderId} (${restoredItems.length} SKUs)`,
      );
    }

    if (newStatus === PaymentStatus.APPROVED) {
      this.invoiceService
        .emitForOrder(payment.orderId)
        .catch((e) => this.logger.error('Webhook MP: invoice emission failed', e));

      this.shippingService
        .purchaseLabel(payment.orderId)
        .catch((e) =>
          this.logger.warn(
            `Webhook MP: auto-shipping skipped for order=${payment.orderId} — ${(e as Error).message}`,
          ),
        );
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
