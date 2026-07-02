import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { CouponType, Marketplace, OrderStatus, Prisma, Role } from '@prisma/client';
import { randomBytes } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { PushNotificationsService } from './push-notifications.service';

const CART_DELAY_MS = 30 * 60 * 1000;
const COUPON_DELAY_MS = 24 * 60 * 60 * 1000;
const COUPON_VALIDITY_MS = 7 * 24 * 60 * 60 * 1000;
const BATCH_SIZE = 50;
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

@Injectable()
export class PendingOrderRecoveryService {
  private readonly logger = new Logger(PendingOrderRecoveryService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly push: PushNotificationsService,
  ) {}

  @Cron('*/5 * * * *')
  async process(): Promise<void> {
    const now = new Date();
    await this.createCartReminders(now);
    await this.createRecoveryCoupons(now);
    await this.deliverPendingPushes();
  }

  private async createCartReminders(now: Date): Promise<void> {
    const orders = await this.prisma.order.findMany({
      where: {
        status: OrderStatus.PENDING,
        channel: Marketplace.SITE,
        cartReminderCreatedAt: null,
        createdAt: { lte: new Date(now.getTime() - CART_DELAY_MS) },
      },
      select: { id: true, userId: true },
      take: BATCH_SIZE,
      orderBy: { createdAt: 'asc' },
    });

    for (const order of orders) {
      await this.prisma.$transaction(async (tx) => {
        const claimed = await tx.order.updateMany({
          where: {
            id: order.id,
            status: OrderStatus.PENDING,
            channel: Marketplace.SITE,
            cartReminderCreatedAt: null,
          },
          data: { cartReminderCreatedAt: now },
        });
        if (claimed.count === 0) return;
        await tx.notification.create({
          data: {
            userId: order.userId,
            roleTarget: Role.CLIENTE,
            type: 'ABANDONED_CART_REMINDER',
            title: 'Pedido aguardando pagamento',
            message: 'Seu pedido ainda está aguardando pagamento.',
            orderId: order.id,
          },
        });
      });
    }
  }

  private async createRecoveryCoupons(now: Date): Promise<void> {
    const orders = await this.prisma.order.findMany({
      where: {
        status: OrderStatus.PENDING,
        channel: Marketplace.SITE,
        recoveryCouponCreatedAt: null,
        createdAt: { lte: new Date(now.getTime() - COUPON_DELAY_MS) },
      },
      select: { id: true, userId: true },
      take: BATCH_SIZE,
      orderBy: { createdAt: 'asc' },
    });

    for (const order of orders) {
      for (let attempt = 0; attempt < 5; attempt += 1) {
        try {
          const code = this.generateCode();
          await this.prisma.$transaction(async (tx) => {
            const claimed = await tx.order.updateMany({
              where: {
                id: order.id,
                status: OrderStatus.PENDING,
                channel: Marketplace.SITE,
                recoveryCouponCreatedAt: null,
              },
              data: { recoveryCouponCreatedAt: now },
            });
            if (claimed.count === 0) return;
            await tx.coupon.create({
              data: {
                code,
                description: 'Oferta exclusiva de recuperação de pedido',
                type: CouponType.PERCENT,
                value: 10,
                usageLimit: 1,
                ownerUserId: order.userId,
                sourceOrderId: order.id,
                expiresAt: new Date(now.getTime() + COUPON_VALIDITY_MS),
              },
            });
            await tx.notification.create({
              data: {
                userId: order.userId,
                roleTarget: Role.CLIENTE,
                type: 'PENDING_ORDER_COUPON',
                title: 'Oferta exclusiva',
                message: `Use o cupom ${code} em uma nova compra. Válido por 7 dias.`,
                orderId: order.id,
              },
            });
          });
          break;
        } catch (error) {
          if (this.isCodeCollision(error) && attempt < 4) continue;
          if (this.isSourceOrderConflict(error)) break;
          throw error;
        }
      }
    }
  }

  private async deliverPendingPushes(): Promise<void> {
    const orders = await this.prisma.order.findMany({
      where: {
        status: OrderStatus.PENDING,
        channel: Marketplace.SITE,
        OR: [
          { cartReminderCreatedAt: { not: null }, cartReminderPushSentAt: null },
          { recoveryCouponCreatedAt: { not: null }, recoveryCouponPushSentAt: null },
        ],
      },
      select: {
        id: true,
        userId: true,
        cartReminderCreatedAt: true,
        cartReminderPushSentAt: true,
        recoveryCouponCreatedAt: true,
        recoveryCouponPushSentAt: true,
      },
      take: BATCH_SIZE,
    });

    for (const order of orders) {
      if (order.cartReminderCreatedAt && !order.cartReminderPushSentAt) {
        await this.deliver(order.id, order.userId, 'ABANDONED_CART_REMINDER', {
          title: 'Pedido aguardando pagamento',
          body: 'Você tem um pedido aguardando pagamento.',
        }, 'cartReminderPushSentAt');
      }
      if (order.recoveryCouponCreatedAt && !order.recoveryCouponPushSentAt) {
        await this.deliver(order.id, order.userId, 'PENDING_ORDER_COUPON', {
          title: 'Oferta exclusiva',
          body: 'Você recebeu uma oferta exclusiva. Veja no site.',
        }, 'recoveryCouponPushSentAt');
      }
    }
  }

  private async deliver(
    orderId: string,
    userId: string,
    type: string,
    content: { title: string; body: string },
    sentField: 'cartReminderPushSentAt' | 'recoveryCouponPushSentAt',
  ): Promise<void> {
    try {
      const delivered = await this.push.sendToUser(userId, { ...content, orderId, type });
      if (!delivered) return;
      await this.prisma.order.updateMany({
        where: { id: orderId, status: OrderStatus.PENDING, [sentField]: null },
        data: { [sentField]: new Date() },
      });
    } catch (error) {
      this.logger.warn(`Web Push pendente para pedido=${orderId}`, error);
    }
  }

  private generateCode(): string {
    const bytes = randomBytes(12);
    return Array.from(bytes, (byte) => ALPHABET[byte % ALPHABET.length]).join('');
  }

  private isCodeCollision(error: unknown): boolean {
    return error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002' && String(error.meta?.target).includes('code');
  }

  private isSourceOrderConflict(error: unknown): boolean {
    return error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002' && String(error.meta?.target).includes('source_order_id');
  }
}
