import { BadRequestException, NotFoundException } from '@nestjs/common';
import { DeliveryMethod, DocumentType, OrderStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CartService } from '../cart/cart.service';
import { ShippingService } from '../shipping/shipping.service';
import { StockService } from '../stock/stock.service';
import { NotificationsService } from '../notifications/notifications.service';
import { EventBusService } from '../events/event-bus.service';
import { CheckoutService } from './checkout.service';
import { CheckoutIdentityNormalizer } from './recipient/checkout-identity.normalizer';

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
      {} as unknown as CheckoutIdentityNormalizer,
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

/**
 * Testes unitários de CheckoutService.createOrder — cobrem que o fluxo inline
 * (sem perfil) permanece byte-a-byte igual ao de hoje, e que o novo fluxo com
 * RecipientProfile/SavedAddress grava exatamente o que o normalizador resolve,
 * nunca lendo os perfis de novo depois. Prisma/colaboradores são mockados.
 */
describe('CheckoutService.createOrder', () => {
  const USER_ID = 'user-1';

  const CART = {
    items: [
      {
        productId: 'prod-1',
        name: 'Produto Teste',
        sku: 'SKU-1',
        price: 100,
        salePrice: null,
        quantity: 1,
        available: true,
      },
    ],
    subtotal: 100,
    couponCode: null,
  };

  const INLINE_ADDRESS = {
    name: 'Fulano',
    cep: '12345678',
    street: 'Rua A',
    number: '10',
    neighborhood: 'Centro',
    city: 'SJC',
    state: 'SP',
  };

  function baseDto(overrides: Record<string, unknown> = {}) {
    return {
      deliveryMethod: DeliveryMethod.SHIPPING,
      shippingAddress: INLINE_ADDRESS,
      shippingMethod: 'PAC',
      shippingPrice: 20,
      meServiceId: 1,
      meCarrier: 'Correios',
      customerPhone: '12991234567',
      ...overrides,
    };
  }

  let prisma: {
    product: { findMany: jest.Mock };
    coupon: { findFirst: jest.Mock };
    user: { update: jest.Mock };
    order: { findFirst: jest.Mock };
    orderStatusEvent: { create: jest.Mock };
    $transaction: jest.Mock;
  };
  let tx: {
    order: { create: jest.Mock; findFirst: jest.Mock };
    coupon: { updateMany: jest.Mock };
    shipment: { create: jest.Mock };
  };
  let cartService: { getCart: jest.Mock; clearCart: jest.Mock };
  let shippingService: { resolveQuotedPrice: jest.Mock };
  let stock: { reserveForOrder: jest.Mock };
  let notifications: { notifyNewOrder: jest.Mock };
  let events: { emit: jest.Mock };
  let identityNormalizer: { resolveIdentity: jest.Mock; resolveAddress: jest.Mock };
  let service: CheckoutService;

  function decimal(n: number) {
    return { toNumber: () => n };
  }

  const CREATED_ORDER = {
    id: 'order-1',
    items: [],
    coupon: null,
    subtotal: decimal(100),
    discount: decimal(0),
    shipping: decimal(20),
    total: decimal(120),
  };

  beforeEach(() => {
    tx = {
      order: {
        create: jest.fn().mockResolvedValue(CREATED_ORDER),
        findFirst: jest.fn().mockResolvedValue(null),
      },
      coupon: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
      shipment: { create: jest.fn().mockResolvedValue({}) },
    };
    prisma = {
      product: {
        findMany: jest.fn().mockResolvedValue([{ id: 'prod-1', status: 'ACTIVE', stock: 10 }]),
      },
      coupon: { findFirst: jest.fn() },
      user: { update: jest.fn().mockResolvedValue({}) },
      order: { findFirst: jest.fn() },
      orderStatusEvent: { create: jest.fn().mockResolvedValue({}) },
      $transaction: jest.fn((cb) => cb(tx)),
    };
    cartService = {
      getCart: jest.fn().mockResolvedValue(CART),
      clearCart: jest.fn().mockResolvedValue(undefined),
    };
    shippingService = { resolveQuotedPrice: jest.fn().mockResolvedValue(20) };
    stock = { reserveForOrder: jest.fn().mockResolvedValue(undefined) };
    notifications = { notifyNewOrder: jest.fn().mockResolvedValue(undefined) };
    events = { emit: jest.fn() };
    identityNormalizer = {
      resolveIdentity: jest.fn().mockResolvedValue({
        recipientProfileId: null,
        buyerName: 'Fulano',
        recipientDocument: '11122233396',
        recipientDocumentType: DocumentType.CPF,
        recipientEmail: null,
      }),
      resolveAddress: jest.fn().mockResolvedValue({
        savedAddressId: null,
        address: INLINE_ADDRESS,
      }),
    };

    service = new CheckoutService(
      prisma as unknown as PrismaService,
      cartService as unknown as CartService,
      shippingService as unknown as ShippingService,
      stock as unknown as StockService,
      notifications as unknown as NotificationsService,
      events as unknown as EventBusService,
      identityNormalizer as unknown as CheckoutIdentityNormalizer,
    );
  });

  it('old inline flow: writes buyerName/document straight from the DTO and syncs User.cpf', async () => {
    await service.createOrder(USER_ID, baseDto({ buyerName: 'Fulano', cpf: '11122233396' }));

    expect(identityNormalizer.resolveIdentity).toHaveBeenCalledWith(USER_ID, {
      recipientProfileId: undefined,
      buyerName: 'Fulano',
      cpf: '11122233396',
    });
    expect(tx.order.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          buyerName: 'Fulano',
          recipientProfileId: null,
          savedAddressId: null,
          recipientDocument: '11122233396',
          recipientDocumentType: DocumentType.CPF,
          recipientEmail: null,
          shippingAddress: INLINE_ADDRESS,
        }),
      }),
    );
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: USER_ID },
      data: { cpf: '11122233396' },
    });
  });

  it('new flow: uses the normalizer snapshot for a selected profile/address and skips the User.cpf sync', async () => {
    identityNormalizer.resolveIdentity.mockResolvedValue({
      recipientProfileId: 'profile-1',
      buyerName: 'Maria Souza',
      recipientDocument: '22233344400',
      recipientDocumentType: DocumentType.CPF,
      recipientEmail: 'maria@example.com',
    });
    identityNormalizer.resolveAddress.mockResolvedValue({
      savedAddressId: 'addr-1',
      address: { ...INLINE_ADDRESS, name: 'Maria Souza' },
    });

    await service.createOrder(
      USER_ID,
      baseDto({
        recipientProfileId: 'profile-1',
        savedAddressId: 'addr-1',
        cpf: '99999999999', // should be ignored: a profile was selected
      }),
    );

    expect(identityNormalizer.resolveAddress).toHaveBeenCalledWith(USER_ID, 'profile-1', {
      savedAddressId: 'addr-1',
      shippingAddress: INLINE_ADDRESS,
    });
    expect(tx.order.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          buyerName: 'Maria Souza',
          recipientProfileId: 'profile-1',
          savedAddressId: 'addr-1',
          recipientDocument: '22233344400',
          recipientEmail: 'maria@example.com',
        }),
      }),
    );
    // Um perfil foi selecionado — nunca sobrescrever o CPF da CONTA com o
    // documento de um perfil que pode representar um terceiro.
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it('propagates 404 when the normalizer rejects a profile owned by another user', async () => {
    identityNormalizer.resolveIdentity.mockRejectedValue(
      new NotFoundException('Perfil de destinatário não encontrado.'),
    );

    await expect(
      service.createOrder(USER_ID, baseDto({ recipientProfileId: 'someone-elses-profile' })),
    ).rejects.toThrow(NotFoundException);
    expect(tx.order.create).not.toHaveBeenCalled();
  });

  it('PICKUP: never resolves an address and stores shippingAddress as JsonNull', async () => {
    await service.createOrder(
      USER_ID,
      baseDto({
        deliveryMethod: DeliveryMethod.PICKUP,
        shippingAddress: undefined,
        meServiceId: undefined,
      }),
    );

    expect(identityNormalizer.resolveAddress).not.toHaveBeenCalled();
    expect(tx.order.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          shippingAddress: Prisma.JsonNull,
          savedAddressId: null,
        }),
      }),
    );
    expect(tx.shipment.create).not.toHaveBeenCalled();
  });

  it('requires either shippingAddress or savedAddressId for SHIPPING orders', async () => {
    await expect(
      service.createOrder(
        USER_ID,
        baseDto({ shippingAddress: undefined, savedAddressId: undefined }),
      ),
    ).rejects.toThrow(BadRequestException);
    expect(identityNormalizer.resolveIdentity).not.toHaveBeenCalled();
  });
});
