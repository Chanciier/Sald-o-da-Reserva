import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuthService } from '../auth/auth.service';
import { StockService } from '../stock/stock.service';
import { NotificationsService } from '../notifications/notifications.service';
import { EventBusService } from '../events/event-bus.service';
import { OmsEvents } from '../events/oms-events';
import { IntermediadorService } from '../intermediador/intermediador.service';
import { ClubSignupService } from './club-signup.service';

/**
 * Testes do fluxo "clica pra assinar, preenche os dados, paga" do Clube
 * Reversa — sem carrinho. Prisma/AuthService/StockService são mocks; nada
 * aqui toca banco ou HTTP de verdade.
 */
describe('ClubSignupService.subscribe', () => {
  let service: ClubSignupService;
  let prisma: {
    product: { findFirst: jest.Mock };
    order: { create: jest.Mock };
    orderStatusEvent: { create: jest.Mock };
  };
  let authService: { guestCheckout: jest.Mock };
  let stock: { reserveForOrder: jest.Mock };
  let notifications: { notifyNewOrder: jest.Mock };
  let events: { emit: jest.Mock };
  let intermediador: { checkClubMembership: jest.Mock };

  const AUTH_RESULT = {
    user: { id: 'user-1', email: 'guest+11122233396@saldaodareserva.com.br' },
    accessToken: 'access-token',
    refreshToken: 'refresh-token',
  };

  const DTO = { name: 'Fulano', phone: '11999999999', cpf: '11122233396' };

  beforeEach(() => {
    prisma = {
      product: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'product-1',
          name: 'Clube Reversa',
          sku: 'CLUBE-REVERSA',
          price: { toString: () => '120' },
        }),
      },
      order: { create: jest.fn().mockResolvedValue({ id: 'order-1' }) },
      orderStatusEvent: { create: jest.fn().mockResolvedValue({}) },
    };
    authService = { guestCheckout: jest.fn().mockResolvedValue(AUTH_RESULT) };
    stock = { reserveForOrder: jest.fn().mockResolvedValue({ reserved: [], conflicts: [] }) };
    notifications = { notifyNewOrder: jest.fn().mockResolvedValue(undefined) };
    events = { emit: jest.fn() };
    intermediador = {
      checkClubMembership: jest.fn().mockResolvedValue({ isMember: false, validUntil: null }),
    };

    service = new ClubSignupService(
      prisma as unknown as PrismaService,
      authService as unknown as AuthService,
      stock as unknown as StockService,
      notifications as unknown as NotificationsService,
      events as unknown as EventBusService,
      intermediador as unknown as IntermediadorService,
    );
  });

  it('creates the guest account and a PICKUP order directly, without any cart', async () => {
    const result = await service.subscribe(DTO, '1.2.3.4', 'jest-agent');

    expect(authService.guestCheckout).toHaveBeenCalledWith(DTO, '1.2.3.4', 'jest-agent');
    expect(prisma.order.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId: 'user-1',
          deliveryMethod: 'PICKUP',
          buyerName: 'Fulano',
          customerPhone: '11999999999',
          recipientDocument: '11122233396',
          recipientDocumentType: 'CPF',
          items: { create: [expect.objectContaining({ productId: 'product-1', quantity: 1 })] },
        }),
      }),
    );
    expect(notifications.notifyNewOrder).toHaveBeenCalledWith('order-1');
    expect(stock.reserveForOrder).toHaveBeenCalledWith('order-1');
    expect(events.emit).toHaveBeenCalledWith(OmsEvents.OrderCreated, { orderId: 'order-1' });
    expect(result).toEqual({ ...AUTH_RESULT, orderId: 'order-1' });
  });

  it('rejects when no Clube Reversa product is active', async () => {
    prisma.product.findFirst.mockResolvedValue(null);

    await expect(service.subscribe(DTO, '1.2.3.4', 'jest-agent')).rejects.toThrow(
      NotFoundException,
    );
    expect(prisma.order.create).not.toHaveBeenCalled();
  });

  it('never blocks the signup if notifyNewOrder or reserveForOrder fail', async () => {
    notifications.notifyNewOrder.mockRejectedValue(new Error('notify down'));
    stock.reserveForOrder.mockRejectedValue(new Error('stock down'));

    const result = await service.subscribe(DTO, '1.2.3.4', 'jest-agent');

    expect(result.orderId).toBe('order-1');
  });

  it('reuses the existing account when the buyer is already logged in — never calls guestCheckout', async () => {
    const result = await service.subscribe(DTO, '1.2.3.4', 'jest-agent', 'existing-user-1');

    expect(authService.guestCheckout).not.toHaveBeenCalled();
    expect(prisma.order.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ userId: 'existing-user-1' }) }),
    );
    // Sem tokens novos — o front já tem sessão válida, nada pra persistir.
    expect(result).toEqual({ orderId: 'order-1' });
  });

  it('rejects a new signup when the CPF is already an active club member', async () => {
    intermediador.checkClubMembership.mockResolvedValue({
      isMember: true,
      validUntil: '2027-01-15T00:00:00.000Z',
    });

    await expect(service.subscribe(DTO, '1.2.3.4', 'jest-agent')).rejects.toThrow(
      ConflictException,
    );
    expect(authService.guestCheckout).not.toHaveBeenCalled();
    expect(prisma.order.create).not.toHaveBeenCalled();
  });

  it('never blocks the signup if the membership check itself fails (fail-open)', async () => {
    intermediador.checkClubMembership.mockRejectedValue(new Error('intermediador fora do ar'));

    const result = await service.subscribe(DTO, '1.2.3.4', 'jest-agent');

    expect(result.orderId).toBe('order-1');
  });
});

describe('ClubSignupService.checkCpfStatus', () => {
  let service: ClubSignupService;
  let intermediador: { checkClubMembership: jest.Mock };

  beforeEach(() => {
    intermediador = { checkClubMembership: jest.fn() };
    service = new ClubSignupService(
      {} as unknown as PrismaService,
      {} as unknown as AuthService,
      {} as unknown as StockService,
      {} as unknown as NotificationsService,
      {} as unknown as EventBusService,
      intermediador as unknown as IntermediadorService,
    );
  });

  it('rejects a malformed CPF before calling the intermediador', async () => {
    await expect(service.checkCpfStatus('123')).rejects.toThrow(BadRequestException);
    expect(intermediador.checkClubMembership).not.toHaveBeenCalled();
  });

  it('returns the intermediador status for a well-formed CPF', async () => {
    intermediador.checkClubMembership.mockResolvedValue({
      isMember: true,
      validUntil: '2027-01-15T00:00:00.000Z',
    });

    const result = await service.checkCpfStatus('11122233396');

    expect(intermediador.checkClubMembership).toHaveBeenCalledWith('11122233396');
    expect(result).toEqual({ isMember: true, validUntil: '2027-01-15T00:00:00.000Z' });
  });

  it('fails open (not a member) when the intermediador check errors out', async () => {
    intermediador.checkClubMembership.mockRejectedValue(new Error('intermediador fora do ar'));

    const result = await service.checkCpfStatus('11122233396');

    expect(result).toEqual({ isMember: false, validUntil: null });
  });
});
