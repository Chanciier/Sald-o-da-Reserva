import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { DeliveryMethod, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CartService } from '../cart/cart.service';
import { ShippingService, ShippingQuoteOption } from '../shipping/shipping.service';
import type { CreateOrderDto } from './dto/create-order.dto';

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
    private readonly shippingService: ShippingService,
  ) {}

  async getShippingOptions(subtotal: number, cep?: string): Promise<ShippingQuoteOption[]> {
    const options = cep
      ? await this.shippingService.quote(cep)
      : this.shippingService['fallbackOptions']();

    // Add free shipping if eligible
    const FREE_THRESHOLD = 300;
    if (subtotal >= FREE_THRESHOLD) {
      const free: ShippingQuoteOption = {
        serviceId: 0,
        method: 'FREE',
        name: 'Frete Grátis',
        carrier: '',
        description: '5–8 dias úteis',
        price: 0,
        deliveryMin: 5,
        deliveryMax: 8,
      };
      return [free, ...options];
    }

    return options;
  }

  async createOrder(userId: string, dto: CreateOrderDto) {
    const isPickup = dto.deliveryMethod === DeliveryMethod.PICKUP;

    if (!isPickup && !dto.shippingAddress) {
      throw new BadRequestException('Endereço de entrega obrigatório para envio.');
    }

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

    const shippingCost = isPickup ? 0 : round2(Math.max(0, dto.shippingPrice ?? 0));

    // Coupon
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
          deliveryMethod: dto.deliveryMethod ?? DeliveryMethod.SHIPPING,
          subtotal: cart.subtotal,
          discount: round2(discount),
          shipping: shippingCost,
          total,
          shippingAddress: isPickup
            ? Prisma.JsonNull
            : (dto.shippingAddress as unknown as Prisma.InputJsonValue),
          shippingMethod: isPickup ? 'PICKUP' : (dto.shippingMethod ?? 'N/A'),
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

      // Create shipment record (PICKUP orders have no shipment)
      if (!isPickup) {
        await tx.shipment.create({
          data: {
            orderId: newOrder.id,
            serviceId: dto.meServiceId ?? 0,
            carrier: dto.meCarrier ?? 'N/A',
            service: dto.shippingMethod ?? 'N/A',
            price: shippingCost,
            deliveryMin: dto.deliveryMin ?? null,
            deliveryMax: dto.deliveryMax ?? null,
          },
        });
      }

      return newOrder;
    });

    await this.cartService.clearCart(userId);

    return serializeOrder(order as unknown as Record<string, unknown>);
  }

  async findUserOrders(userId: string) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const prismaAny = this.prisma as any;
    const orders = await prismaAny.order.findMany({
      where: { userId },
      include: {
        items: true,
        coupon: { select: { code: true } },
        shipment: { select: { status: true, trackingCode: true, carrier: true, service: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
    return (orders as Record<string, unknown>[]).map((o) =>
      serializeOrder(o as unknown as Record<string, unknown>),
    );
  }

  async findAllOrders(opts: { page: number; status?: string; search?: string }) {
    const take = 20;
    const skip = (opts.page - 1) * take;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const where: any = {};
    if (opts.status) where.status = opts.status;
    if (opts.search) {
      where.OR = [
        { id: { contains: opts.search, mode: 'insensitive' } },
        { user: { email: { contains: opts.search, mode: 'insensitive' } } },
        { user: { name: { contains: opts.search, mode: 'insensitive' } } },
      ];
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const prismaAny = this.prisma as any;
    const [orders, total] = await Promise.all([
      prismaAny.order.findMany({
        where,
        take,
        skip,
        orderBy: { createdAt: 'desc' },
        include: {
          user: { select: { id: true, name: true, email: true } },
          items: { select: { name: true, quantity: true, subtotal: true } },
          payment: { select: { method: true, status: true } },
          shipment: { select: { status: true, carrier: true, trackingCode: true } },
          coupon: { select: { code: true } },
        },
      }),
      this.prisma.order.count({ where }),
    ]);

    return {
      data: (orders as Record<string, unknown>[]).map((o) =>
        serializeOrder(o as unknown as Record<string, unknown>),
      ),
      total,
      page: opts.page,
      pages: Math.ceil(total / take),
    };
  }

  async updateOrderStatus(orderId: string, status: string) {
    const order = await this.prisma.order.findUnique({ where: { id: orderId } });
    if (!order) throw new Error('Pedido não encontrado.');

    return this.prisma.order.update({
      where: { id: orderId },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      data: { status: status as any },
      select: { id: true, status: true },
    });
  }

  async findOrderById(userId: string, orderId: string) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const prismaAny = this.prisma as any;
    const order = await prismaAny.order.findFirst({
      where: { id: orderId, userId },
      include: {
        items: { include: { product: { include: { images: { take: 1 } } } } },
        coupon: { select: { code: true, type: true, value: true } },
        shipment: {
          select: {
            id: true,
            status: true,
            carrier: true,
            service: true,
            trackingCode: true,
            labelUrl: true,
            meOrderId: true,
            deliveryMin: true,
            deliveryMax: true,
            shippedAt: true,
            deliveredAt: true,
          },
        },
      },
    });
    if (!order) throw new NotFoundException('Pedido não encontrado.');

    const o = order as Record<string, unknown> & {
      coupon: { code: string; type: string; value: { toNumber(): number } } | null;
    };

    return {
      ...serializeOrder(o),
      coupon: o.coupon
        ? { code: o.coupon.code, type: o.coupon.type, value: o.coupon.value.toNumber() }
        : null,
    };
  }
}
