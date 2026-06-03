import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CartService } from '../cart/cart.service';
import type { CreateOrderDto, ShippingMethod } from './dto/create-order.dto';

export interface ShippingOption {
  method: ShippingMethod;
  name: string;
  description: string;
  price: number;
}

const SHIPPING: Record<string, { name: string; description: string; price: number }> = {
  PAC: { name: 'PAC', description: '5 a 8 dias úteis', price: 19.9 },
  SEDEX: { name: 'SEDEX', description: '1 a 3 dias úteis', price: 34.9 },
  FREE: { name: 'Frete Grátis', description: '5 a 8 dias úteis', price: 0 },
};

const FREE_THRESHOLD = 300;

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

function serializeOrder(order: Record<string, unknown>) {
  return {
    ...order,
    subtotal: (order.subtotal as { toNumber(): number }).toNumber(),
    discount: (order.discount as { toNumber(): number }).toNumber(),
    shipping: (order.shipping as { toNumber(): number }).toNumber(),
    total: (order.total as { toNumber(): number }).toNumber(),
    items: Array.isArray(order.items)
      ? order.items.map((item: Record<string, unknown>) => ({
          ...item,
          price: (item.price as { toNumber(): number }).toNumber(),
          subtotal: (item.subtotal as { toNumber(): number }).toNumber(),
        }))
      : order.items,
  };
}

@Injectable()
export class CheckoutService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cartService: CartService,
  ) {}

  getShippingOptions(subtotal: number): ShippingOption[] {
    const options: ShippingOption[] = [
      { method: 'PAC', ...SHIPPING.PAC },
      { method: 'SEDEX', ...SHIPPING.SEDEX },
    ];
    if (subtotal >= FREE_THRESHOLD) {
      options.unshift({ method: 'FREE', ...SHIPPING.FREE });
    }
    return options;
  }

  async createOrder(userId: string, dto: CreateOrderDto) {
    const cart = await this.cartService.getCart(userId);
    if (!cart.items.length) throw new BadRequestException('Carrinho está vazio.');

    const productIds = cart.items.map((i) => i.productId);
    const products = await this.prisma.product.findMany({
      where: { id: { in: productIds } },
    });
    const productMap = new Map(products.map((p) => [p.id, p]));

    for (const item of cart.items) {
      const product = productMap.get(item.productId);
      if (!product || product.status !== 'ACTIVE') {
        throw new BadRequestException(`Produto "${item.name}" não está disponível.`);
      }
      if (product.stock < item.quantity) {
        throw new BadRequestException(
          `Estoque insuficiente para "${item.name}". Disponível: ${product.stock}.`,
        );
      }
    }

    // Shipping cost
    let shippingCost = 0;
    if (dto.shippingMethod === 'PAC') shippingCost = SHIPPING.PAC.price;
    else if (dto.shippingMethod === 'SEDEX') shippingCost = SHIPPING.SEDEX.price;
    else if (dto.shippingMethod === 'FREE') {
      if (cart.subtotal < FREE_THRESHOLD) {
        throw new BadRequestException('Pedido não elegível para frete grátis.');
      }
    }

    // Coupon (prefer DTO over cart)
    const couponCode = dto.couponCode?.toUpperCase() ?? cart.couponCode ?? null;
    let couponId: string | null = null;
    let discount = 0;

    if (couponCode) {
      const coupon = await this.prisma.coupon.findFirst({
        where: { code: couponCode, isActive: true },
      });
      if (coupon) {
        const eligible = !coupon.minOrderValue || cart.subtotal >= coupon.minOrderValue.toNumber();
        const notExpired = !coupon.expiresAt || coupon.expiresAt > new Date();
        const hasUses = coupon.usageLimit === null || coupon.usageCount < coupon.usageLimit;

        if (eligible && notExpired && hasUses) {
          if (coupon.type === 'PERCENT') {
            discount = cart.subtotal * (coupon.value.toNumber() / 100);
            if (coupon.maxDiscount) discount = Math.min(discount, coupon.maxDiscount.toNumber());
          } else {
            discount = coupon.value.toNumber();
          }
          discount = Math.min(discount, cart.subtotal);
          couponId = coupon.id;
        }
      }
    }

    const total = round2(Math.max(0, cart.subtotal - discount + shippingCost));

    const order = await this.prisma.$transaction(async (tx) => {
      const newOrder = await tx.order.create({
        data: {
          userId,
          couponId,
          subtotal: cart.subtotal,
          discount: round2(discount),
          shipping: shippingCost,
          total,
          shippingAddress: dto.shippingAddress as unknown as Prisma.InputJsonValue,
          shippingMethod: dto.shippingMethod,
          notes: dto.notes,
          items: {
            create: cart.items.map((item) => {
              const unitPrice = item.salePrice ?? item.price;
              return {
                productId: item.productId,
                name: item.name,
                sku: item.sku,
                price: unitPrice,
                quantity: item.quantity,
                subtotal: round2(unitPrice * item.quantity),
              };
            }),
          },
        },
        include: {
          items: {
            include: { product: { include: { images: { take: 1 } } } },
          },
          coupon: { select: { code: true } },
        },
      });

      for (const item of cart.items) {
        await tx.product.update({
          where: { id: item.productId },
          data: { stock: { decrement: item.quantity } },
        });
      }

      if (couponId) {
        await tx.coupon.update({
          where: { id: couponId },
          data: { usageCount: { increment: 1 } },
        });
      }

      return newOrder;
    });

    await this.cartService.clearCart(userId);

    return serializeOrder(order as unknown as Record<string, unknown>);
  }

  async findUserOrders(userId: string) {
    const orders = await this.prisma.order.findMany({
      where: { userId },
      include: {
        items: true,
        coupon: { select: { code: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
    return orders.map((o) => serializeOrder(o as unknown as Record<string, unknown>));
  }

  async findOrderById(userId: string, orderId: string) {
    const order = await this.prisma.order.findFirst({
      where: { id: orderId, userId },
      include: {
        items: {
          include: { product: { include: { images: { take: 1 } } } },
        },
        coupon: { select: { code: true, type: true, value: true } },
      },
    });
    if (!order) throw new NotFoundException('Pedido não encontrado.');

    return {
      ...serializeOrder(order as unknown as Record<string, unknown>),
      coupon: order.coupon
        ? {
            code: order.coupon.code,
            type: order.coupon.type,
            value: order.coupon.value.toNumber(),
          }
        : null,
    };
  }
}
