import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import type { CartData, CartItem, CartResponse, CouponSummary } from './cart.types';
import { randomUUID } from 'crypto';

const CART_TTL = 7 * 24 * 60 * 60;
const CART_RECOVERY_INDEX = 'cart:recovery:index';
const CART_REMINDER_DELAY_MS = 30 * 60 * 1000;

@Injectable()
export class CartService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  private cartKey(userId: string) {
    return `cart:${userId}`;
  }

  private async getRaw(userId: string): Promise<CartData> {
    const data = await this.redis.getJson<CartData>(this.cartKey(userId));
    return data ?? { items: [], couponCode: null, updatedAt: new Date().toISOString() };
  }

  private async save(userId: string, cart: CartData): Promise<void> {
    cart.updatedAt = new Date().toISOString();
    cart.recoveryId ??= randomUUID();
    cart.reminderCreatedAt = undefined;
    cart.reminderPushSentAt = undefined;
    await this.redis.setJson(this.cartKey(userId), cart, CART_TTL);
    await this.redis.zadd(
      CART_RECOVERY_INDEX,
      new Date(cart.updatedAt).getTime() + CART_REMINDER_DELAY_MS,
      userId,
    );
  }

  private round2(n: number) {
    return Math.round(n * 100) / 100;
  }

  private async enrich(userId: string, cart: CartData): Promise<CartResponse> {
    const products = await this.prisma.product.findMany({
      where: { id: { in: cart.items.map((item) => item.productId) } },
      select: { id: true, status: true, stock: true, price: true, salePrice: true },
    });
    const productById = new Map(products.map((product) => [product.id, product]));
    const items = cart.items.map((item) => {
      const product = productById.get(item.productId);
      const available = product?.status === 'ACTIVE' && product.stock >= item.quantity;
      return {
        ...item,
        stock: product?.stock ?? 0,
        price: product?.price.toNumber() ?? item.price,
        salePrice: product?.salePrice?.toNumber() ?? null,
        available,
      };
    });
    const availableItems = items.filter((item) => item.available);
    const subtotal = availableItems.reduce((sum, i) => {
      return sum + (i.salePrice ?? i.price) * i.quantity;
    }, 0);

    let discount = 0;
    let coupon: CouponSummary | null = null;

    if (cart.couponCode) {
      const dbCoupon = await this.prisma.coupon.findFirst({
        where: {
          code: cart.couponCode,
          isActive: true,
          OR: [{ ownerUserId: null }, { ownerUserId: userId }],
        },
      });
      const usable =
        dbCoupon &&
        (!dbCoupon.expiresAt || dbCoupon.expiresAt > new Date()) &&
        (dbCoupon.usageLimit === null || dbCoupon.usageCount < dbCoupon.usageLimit);
      if (usable) {
        if (dbCoupon.type === 'PERCENT') {
          discount = subtotal * (dbCoupon.value.toNumber() / 100);
          if (dbCoupon.maxDiscount) {
            discount = Math.min(discount, dbCoupon.maxDiscount.toNumber());
          }
        } else {
          discount = dbCoupon.value.toNumber();
        }
        discount = Math.min(discount, subtotal);
        coupon = {
          code: dbCoupon.code,
          type: dbCoupon.type,
          value: dbCoupon.value.toNumber(),
          description: dbCoupon.description,
        };
      }
    }

    const total = Math.max(0, subtotal - discount);
    const itemCount = items.reduce((sum, i) => sum + i.quantity, 0);

    return {
      items,
      couponCode: cart.couponCode,
      coupon,
      subtotal: this.round2(subtotal),
      discount: this.round2(discount),
      total: this.round2(total),
      itemCount,
      updatedAt: cart.updatedAt,
    };
  }

  async getCart(userId: string): Promise<CartResponse> {
    const cart = await this.getRaw(userId);
    if (cart.items.length) {
      await this.redis.zadd(
        CART_RECOVERY_INDEX,
        new Date(cart.updatedAt).getTime() + CART_REMINDER_DELAY_MS,
        userId,
      );
    }
    return this.enrich(userId, cart);
  }

  async addItem(userId: string, productId: string, quantity: number): Promise<CartResponse> {
    const product = await this.prisma.product.findUnique({
      where: { id: productId, status: 'ACTIVE' },
      include: { images: { take: 1 } },
    });
    if (!product) throw new NotFoundException('Produto não encontrado.');
    if (product.stock === 0) throw new BadRequestException('Produto sem estoque.');

    const cart = await this.getRaw(userId);
    const existing = cart.items.find((i) => i.productId === productId);

    if (existing) {
      const newQty = existing.quantity + quantity;
      if (newQty > product.stock) {
        throw new BadRequestException(`Estoque disponível: ${product.stock} unidade(s).`);
      }
      existing.quantity = newQty;
      existing.stock = product.stock;
    } else {
      if (quantity > product.stock) {
        throw new BadRequestException(`Estoque disponível: ${product.stock} unidade(s).`);
      }
      const item: CartItem = {
        productId: product.id,
        name: product.name,
        slug: product.slug,
        sku: product.sku,
        price: product.price.toNumber(),
        salePrice: product.salePrice?.toNumber() ?? null,
        image: product.images[0]?.url ?? null,
        quantity,
        stock: product.stock,
      };
      cart.items.push(item);
    }

    await this.save(userId, cart);
    return this.enrich(userId, cart);
  }

  async updateItem(userId: string, productId: string, quantity: number): Promise<CartResponse> {
    if (quantity <= 0) return this.removeItem(userId, productId);

    const cart = await this.getRaw(userId);
    const item = cart.items.find((i) => i.productId === productId);
    if (!item) throw new NotFoundException('Item não encontrado no carrinho.');

    const product = await this.prisma.product.findUnique({ where: { id: productId } });
    if (!product) throw new NotFoundException('Produto não encontrado.');
    if (quantity > product.stock) {
      throw new BadRequestException(`Estoque disponível: ${product.stock} unidade(s).`);
    }

    item.quantity = quantity;
    item.stock = product.stock;
    item.price = product.price.toNumber();
    item.salePrice = product.salePrice?.toNumber() ?? null;

    await this.save(userId, cart);
    return this.enrich(userId, cart);
  }

  async removeItem(userId: string, productId: string): Promise<CartResponse> {
    const cart = await this.getRaw(userId);
    cart.items = cart.items.filter((i) => i.productId !== productId);
    await this.save(userId, cart);
    return this.enrich(userId, cart);
  }

  async clearCart(userId: string): Promise<void> {
    await this.redis.del(this.cartKey(userId));
    await this.redis.zrem(CART_RECOVERY_INDEX, userId);
  }

  async applyCoupon(userId: string, code: string): Promise<CartResponse> {
    const coupon = await this.prisma.coupon.findFirst({
      where: {
        code: code.toUpperCase(),
        isActive: true,
        OR: [{ ownerUserId: null }, { ownerUserId: userId }],
      },
    });
    if (!coupon) throw new NotFoundException('Cupom não encontrado ou inativo.');
    if (coupon.expiresAt && coupon.expiresAt < new Date()) {
      throw new BadRequestException('Cupom expirado.');
    }
    if (coupon.usageLimit !== null && coupon.usageCount >= coupon.usageLimit) {
      throw new BadRequestException('Limite de uso do cupom atingido.');
    }

    const cart = await this.getRaw(userId);

    if (coupon.minOrderValue) {
      const subtotal = (await this.enrich(userId, cart)).subtotal;
      if (subtotal < coupon.minOrderValue.toNumber()) {
        throw new BadRequestException(
          `Valor mínimo para este cupom: R$ ${coupon.minOrderValue.toNumber().toFixed(2).replace('.', ',')}.`,
        );
      }
    }

    cart.couponCode = coupon.code;
    await this.save(userId, cart);
    return this.enrich(userId, cart);
  }

  async removeCoupon(userId: string): Promise<CartResponse> {
    const cart = await this.getRaw(userId);
    cart.couponCode = null;
    await this.save(userId, cart);
    return this.enrich(userId, cart);
  }
}
