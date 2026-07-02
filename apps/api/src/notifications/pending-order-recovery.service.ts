import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { CouponType, Marketplace, OrderStatus, Prisma, Role } from '@prisma/client';
import { createHash, randomBytes } from 'crypto';
import type { CartData } from '../cart/cart.types';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { PushNotificationsService } from './push-notifications.service';

const CART_DELAY_MS = 30 * 60 * 1000;
const COUPON_DELAY_MS = 24 * 60 * 60 * 1000;
const COUPON_VALIDITY_MS = 7 * 24 * 60 * 60 * 1000;
const BATCH_SIZE = 50;
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const CART_RECOVERY_INDEX = 'cart:recovery:index';
const CART_TTL = 7 * 24 * 60 * 60;

interface AvailabilityItem {
  quantity: number;
  product?: { status: string; stock: number };
}

interface AvailabilitySummary {
  available: number;
  unavailable: number;
}

@Injectable()
export class PendingOrderRecoveryService {
  private readonly logger = new Logger(PendingOrderRecoveryService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly push: PushNotificationsService,
    private readonly redis: RedisService,
  ) {}

  @Cron('*/5 * * * *')
  async process(): Promise<void> {
    const now = new Date();
    await this.createCartReminders(now);
    await this.createRecoveryCoupons(now);
    await this.deliverPendingPushes();
    await this.processAbandonedCarts(now);
  }

  private async createCartReminders(now: Date): Promise<void> {
    const orders = await this.prisma.order.findMany({
      where: {
        status: OrderStatus.PENDING,
        channel: Marketplace.SITE,
        cartReminderCreatedAt: null,
        createdAt: { lte: new Date(now.getTime() - CART_DELAY_MS) },
      },
      select: {
        id: true,
        userId: true,
        items: {
          select: {
            quantity: true,
            product: { select: { status: true, stock: true } },
          },
        },
      },
      take: BATCH_SIZE,
      orderBy: { createdAt: 'asc' },
    });

    for (const order of orders) {
      const availability = this.summarizeAvailability(order.items);
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
        if (availability.available === 0) return;
        await tx.notification.create({
          data: {
            userId: order.userId,
            roleTarget: Role.CLIENTE,
            type: 'ABANDONED_CART_REMINDER',
            title: 'Pedido aguardando pagamento',
            message: this.availabilityMessage('Seu pedido ainda aguarda pagamento.', availability),
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
      select: {
        id: true,
        userId: true,
        items: {
          select: {
            quantity: true,
            product: { select: { status: true, stock: true } },
          },
        },
      },
      take: BATCH_SIZE,
      orderBy: { createdAt: 'asc' },
    });

    for (const order of orders) {
      const availability = this.summarizeAvailability(order.items);
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
            if (availability.available === 0) return;
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
                message: this.availabilityMessage(
                  `Use o cupom ${code} em uma nova compra. Válido por 7 dias.`,
                  availability,
                ),
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
        items: {
          select: {
            quantity: true,
            product: { select: { status: true, stock: true } },
          },
        },
      },
      take: BATCH_SIZE,
    });

    for (const order of orders) {
      const availability = this.summarizeAvailability(order.items);
      if (availability.available === 0) {
        await this.prisma.order.update({
          where: { id: order.id },
          data: {
            cartReminderPushSentAt: order.cartReminderCreatedAt ? new Date() : undefined,
            recoveryCouponPushSentAt: order.recoveryCouponCreatedAt ? new Date() : undefined,
          },
        });
        continue;
      }
      if (order.cartReminderCreatedAt && !order.cartReminderPushSentAt) {
        await this.deliver(
          order.id,
          order.userId,
          'ABANDONED_CART_REMINDER',
          {
            title: 'Pedido aguardando pagamento',
            body: this.availabilityMessage('Seu pedido ainda aguarda pagamento.', availability),
          },
          'cartReminderPushSentAt',
        );
      }
      if (order.recoveryCouponCreatedAt && !order.recoveryCouponPushSentAt) {
        await this.deliver(
          order.id,
          order.userId,
          'PENDING_ORDER_COUPON',
          {
            title: 'Oferta exclusiva',
            body: this.availabilityMessage('Você recebeu uma oferta exclusiva.', availability),
          },
          'recoveryCouponPushSentAt',
        );
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

  private async processAbandonedCarts(now: Date): Promise<void> {
    const userIds = await this.redis.zrangeByScore(
      CART_RECOVERY_INDEX,
      now.getTime(),
      BATCH_SIZE,
    );

    for (const userId of userIds) {
      const key = `cart:${userId}`;
      const cart = await this.redis.getJson<CartData>(key);
      if (!cart?.items.length) {
        await this.redis.zrem(CART_RECOVERY_INDEX, userId);
        continue;
      }

      const availability = await this.cartAvailability(cart);
      if (availability.available === 0) {
        await this.redis.zrem(CART_RECOVERY_INDEX, userId);
        continue;
      }

      const updatedAt = new Date(cart.updatedAt).getTime();
      if (!Number.isFinite(updatedAt)) {
        await this.redis.zrem(CART_RECOVERY_INDEX, userId);
        continue;
      }

      if (!cart.reminderCreatedAt && updatedAt <= now.getTime() - CART_DELAY_MS) {
        await this.prisma.notification.create({
          data: {
            userId,
            roleTarget: Role.CLIENTE,
            type: `CART_ABANDONED_REMINDER:${cart.recoveryId ?? updatedAt}`,
            title: 'Itens aguardando no carrinho',
            message: this.availabilityMessage('Seu carrinho ainda está esperando por você.', availability),
          },
        });
        cart.reminderCreatedAt = now.toISOString();
      }

      if (!cart.couponCreatedAt && updatedAt <= now.getTime() - COUPON_DELAY_MS) {
        cart.recoveryId ??= String(updatedAt);
        const code = this.cartCouponCode(userId, cart.recoveryId);
        await this.prisma.coupon.upsert({
          where: { code },
          update: {},
          create: {
            code,
            description: 'Oferta exclusiva de recuperação de carrinho',
            type: CouponType.PERCENT,
            value: 10,
            usageLimit: 1,
            ownerUserId: userId,
            expiresAt: new Date(now.getTime() + COUPON_VALIDITY_MS),
          },
        });
        await this.prisma.notification.create({
          data: {
            userId,
            roleTarget: Role.CLIENTE,
            type: `CART_RECOVERY_COUPON:${cart.recoveryId}`,
            title: 'Oferta exclusiva para seu carrinho',
            message: this.availabilityMessage(
              `Use o cupom ${code}. Válido por 7 dias e somente na sua conta.`,
              availability,
            ),
          },
        });
        cart.couponCreatedAt = now.toISOString();
      }

      if (cart.reminderCreatedAt && !cart.reminderPushSentAt) {
        const delivered = await this.deliverCartPush(userId, {
          title: 'Itens aguardando no carrinho',
          body: this.availabilityMessage('Seu carrinho ainda está esperando por você.', availability),
          type: 'CART_ABANDONED_REMINDER',
          url: '/carrinho',
        });
        if (delivered) cart.reminderPushSentAt = now.toISOString();
      }

      if (cart.couponCreatedAt && !cart.couponPushSentAt) {
        const delivered = await this.deliverCartPush(userId, {
          title: 'Oferta exclusiva para seu carrinho',
          body: this.availabilityMessage('Você recebeu um cupom exclusivo. Veja no carrinho.', availability),
          type: 'CART_RECOVERY_COUPON',
          url: '/carrinho',
        });
        if (delivered) cart.couponPushSentAt = now.toISOString();
      }

      const ttl = await this.redis.ttl(key);
      await this.redis.setJson(key, cart, ttl > 0 ? ttl : CART_TTL);
      if (cart.couponPushSentAt) {
        await this.redis.zrem(CART_RECOVERY_INDEX, userId);
      } else if (cart.couponCreatedAt) {
        await this.redis.zadd(CART_RECOVERY_INDEX, now.getTime() + 5 * 60 * 1000, userId);
      } else {
        await this.redis.zadd(CART_RECOVERY_INDEX, updatedAt + COUPON_DELAY_MS, userId);
      }
    }
  }

  private async cartAvailability(cart: CartData): Promise<AvailabilitySummary> {
    const products = await this.prisma.product.findMany({
      where: { id: { in: cart.items.map((item) => item.productId) } },
      select: { id: true, status: true, stock: true },
    });
    const byId = new Map(products.map((product) => [product.id, product]));
    return this.summarizeAvailability(
      cart.items.map((item) => ({ quantity: item.quantity, product: byId.get(item.productId) })),
    );
  }

  private async deliverCartPush(
    userId: string,
    payload: { title: string; body: string; type: string; url: string },
  ): Promise<boolean> {
    try {
      return await this.push.sendToUser(userId, payload);
    } catch (error) {
      this.logger.warn(`Web Push de carrinho pendente para user=${userId}`, error);
      return false;
    }
  }

  private summarizeAvailability(items: AvailabilityItem[]): AvailabilitySummary {
    return items.reduce<AvailabilitySummary>(
      (summary, item) => {
        if (item.product?.status === 'ACTIVE' && item.product.stock >= item.quantity) {
          summary.available += 1;
        } else {
          summary.unavailable += 1;
        }
        return summary;
      },
      { available: 0, unavailable: 0 },
    );
  }

  private availabilityMessage(prefix: string, summary: AvailabilitySummary): string {
    const unavailable = summary.unavailable
      ? ` ${summary.unavailable} item(ns) foi(ram) marcado(s) como indisponível(is).`
      : '';
    return `${prefix} ${summary.available} item(ns) disponível(is).${unavailable}`;
  }

  private cartCouponCode(userId: string, recoveryId: string): string {
    const digest = createHash('sha256').update(`${userId}:${recoveryId}`).digest();
    return Array.from(digest.subarray(0, 12), (byte) => ALPHABET[byte % ALPHABET.length]).join('');
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
