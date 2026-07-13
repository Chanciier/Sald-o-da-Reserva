import { BadRequestException, NotFoundException } from '@nestjs/common';
import { DeliveryMethod, OrderStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CartService } from '../cart/cart.service';
import { ShippingService } from '../shipping/shipping.service';
import { StockService } from '../stock/stock.service';
import { NotificationsService } from '../notifications/notifications.service';
import { EventBusService } from '../events/event-bus.service';
import { CheckoutService } from './checkout.service';

// ShippingService (transitively required by CheckoutService) depends on
// OrderWhatsappService -> BaileysService -> the ESM-only `@whiskeysockets/baileys`
// package, which Jest can't parse without a real WhatsApp connection anyway.
// Stub it out at the source so this pure-Prisma unit test never touches it.
jest.mock('../whatsapp/baileys.service', () => ({
  BaileysService: jest.fn(),
}));

/**
 * Testes unitários de CheckoutService.confirmarRetiradaCliente — confirmação
 * de retirada feita pelo próprio cliente (auto-atendimento), antes da baixa
 * definitiva da equipe. Prisma é mockado; nada aqui toca banco real.
 */
describe('CheckoutService.confirmarRetiradaCliente', () => {
  let service: CheckoutService;
  let prisma: {
    order: { findFirst: jest.Mock; update: jest.Mock };
    orderStatusEvent: { create: jest.Mock; findFirst: jest.Mock };
    auditLog: { create: jest.Mock };
  };

  const ORDER_ID = 'order-1';
  const USER_ID = 'user-1';

  function baseOrder(overrides: Partial<Record<string, unknown>> = {}) {
    return {
      id: ORDER_ID,
      status: OrderStatus.READY_TO_SHIP,
      deliveryMethod: DeliveryMethod.PICKUP,
      clientConfirmedPickupAt: null,
      ...overrides,
    };
  }

  beforeEach(() => {
    prisma = {
      order: {
        findFirst: jest.fn(),
        update: jest.fn(),
      },
      orderStatusEvent: {
        create: jest.fn().mockResolvedValue({}),
        findFirst: jest.fn().mockResolvedValue(null),
      },
      auditLog: {
        create: jest.fn().mockResolvedValue({}),
      },
    };
    service = new CheckoutService(
      prisma as unknown as PrismaService,
      {} as unknown as CartService,
      {} as unknown as ShippingService,
      {} as unknown as StockService,
      {} as unknown as NotificationsService,
      {} as unknown as EventBusService,
    );
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('confirms the customer own order when ready for pickup', async () => {
    prisma.order.findFirst.mockResolvedValue(baseOrder());
    prisma.order.update.mockResolvedValue(baseOrder({ clientConfirmedPickupAt: new Date() }));

    const result = await service.confirmarRetiradaCliente(USER_ID, ORDER_ID, {
      ipAddress: '1.2.3.4',
      userAgent: 'jest-agent',
    });

    expect(prisma.order.findFirst).toHaveBeenCalledWith({
      where: { id: ORDER_ID, userId: USER_ID },
      select: { id: true, status: true, deliveryMethod: true, clientConfirmedPickupAt: true },
    });
    expect(prisma.order.update).toHaveBeenCalledWith({
      where: { id: ORDER_ID },
      data: { clientConfirmedPickupAt: expect.any(Date) },
      select: { id: true, status: true, clientConfirmedPickupAt: true },
    });
    expect(prisma.orderStatusEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          orderId: ORDER_ID,
          status: OrderStatus.READY_TO_SHIP,
          title: 'Cliente informou que já retirou o pedido',
          actor: 'cliente',
        }),
      }),
    );
    expect(prisma.auditLog.create).toHaveBeenCalledWith({
      data: {
        action: 'order.pickup_confirmed_by_client',
        userId: USER_ID,
        ipAddress: '1.2.3.4',
        userAgent: 'jest-agent',
        metadata: { orderId: ORDER_ID },
      },
    });
    expect(result.clientConfirmedPickupAt).toBeTruthy();
  });

  it('rejects when the order does not belong to the requesting customer', async () => {
    // findFirst filters by { id, userId } — another customer's order (or a
    // non-existent one) never matches, so Prisma returns null either way.
    prisma.order.findFirst.mockResolvedValue(null);

    await expect(service.confirmarRetiradaCliente(USER_ID, ORDER_ID, {})).rejects.toThrow(
      NotFoundException,
    );
    expect(prisma.order.update).not.toHaveBeenCalled();
  });

  it('rejects orders with home delivery (not PICKUP)', async () => {
    prisma.order.findFirst.mockResolvedValue(
      baseOrder({ deliveryMethod: DeliveryMethod.SHIPPING }),
    );

    await expect(service.confirmarRetiradaCliente(USER_ID, ORDER_ID, {})).rejects.toThrow(
      BadRequestException,
    );
    expect(prisma.order.update).not.toHaveBeenCalled();
  });

  it('rejects orders not yet released for pickup (e.g. still SEPARATED)', async () => {
    prisma.order.findFirst.mockResolvedValue(baseOrder({ status: OrderStatus.SEPARATED }));

    await expect(service.confirmarRetiradaCliente(USER_ID, ORDER_ID, {})).rejects.toThrow(
      BadRequestException,
    );
    expect(prisma.order.update).not.toHaveBeenCalled();
  });

  it('rejects cancelled orders', async () => {
    prisma.order.findFirst.mockResolvedValue(baseOrder({ status: OrderStatus.CANCELLED }));

    await expect(service.confirmarRetiradaCliente(USER_ID, ORDER_ID, {})).rejects.toThrow(
      BadRequestException,
    );
    expect(prisma.order.update).not.toHaveBeenCalled();
  });

  it('rejects a duplicate confirmation with a clear message', async () => {
    prisma.order.findFirst.mockResolvedValue(
      baseOrder({ clientConfirmedPickupAt: new Date('2026-07-01') }),
    );

    await expect(service.confirmarRetiradaCliente(USER_ID, ORDER_ID, {})).rejects.toThrow(
      'Você já confirmou a retirada deste pedido.',
    );
    expect(prisma.order.update).not.toHaveBeenCalled();
  });

  it('rejects when the store already gave the definitive pickup confirmation', async () => {
    prisma.order.findFirst.mockResolvedValue(baseOrder({ status: OrderStatus.DELIVERED }));

    await expect(service.confirmarRetiradaCliente(USER_ID, ORDER_ID, {})).rejects.toThrow(
      'Este pedido já foi retirado.',
    );
    expect(prisma.order.update).not.toHaveBeenCalled();
  });
});
