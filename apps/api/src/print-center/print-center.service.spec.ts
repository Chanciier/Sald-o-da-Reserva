import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ConfigService } from '@nestjs/config';
import { EventBusService } from '../events/event-bus.service';
import { OmsEvents } from '../events/oms-events';
import { NotificationsService } from '../notifications/notifications.service';
import { PickupLabelService } from './pickup-label.service';
import { ShippingPrintService } from './shipping-print.service';
import { PrintAgentWsGateway } from './print-agent-ws.gateway';
import { PrintCenterService } from './print-center.service';

/**
 * Testes do orquestrador do Print Center. Cobre os cenários pedidos:
 * pagamento/webhook duplicado (idempotência), pedido cancelado, retirada vs
 * entrega, e cada feature flag desligada. Nada aqui toca em pagamento, frete
 * ou checkout de verdade — todos os colaboradores são mocks.
 */
describe('PrintCenterService', () => {
  let service: PrintCenterService;
  let prisma: {
    order: { findUnique: jest.Mock };
    printJob: { create: jest.Mock; updateMany: jest.Mock };
  };
  let config: { get: jest.Mock };
  let events: { on: jest.Mock; handlers: Record<string, (payload: unknown) => Promise<void>> };
  let notifications: { notify: jest.Mock; notifyPrintError: jest.Mock };
  let pickupLabel: { generate: jest.Mock };
  let shippingPrint: { enqueueWatch: jest.Mock };
  let printAgentWs: { pushJobReady: jest.Mock };

  const ORDER_ID = 'order-1';

  function pickupOrder(overrides: Record<string, unknown> = {}) {
    return {
      id: ORDER_ID,
      deliveryMethod: 'PICKUP',
      buyerName: 'Cliente Teste',
      customerPhone: '11999999999',
      createdAt: new Date('2026-07-17T12:00:00Z'),
      items: [{ name: 'Produto A', sku: 'SKU-1', quantity: 2 }],
      ...overrides,
    };
  }

  function flags(enabled: Record<string, string>) {
    config.get.mockImplementation((key: string, def: string) => enabled[key] ?? def);
  }

  function duplicateError() {
    return new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
      code: 'P2002',
      clientVersion: '5.22.0',
    });
  }

  beforeEach(() => {
    prisma = {
      order: { findUnique: jest.fn() },
      printJob: { create: jest.fn(), updateMany: jest.fn() },
    };
    config = { get: jest.fn((_key: string, def: string) => def) };
    events = {
      handlers: {},
      on: jest.fn((event: string, handler: (payload: unknown) => Promise<void>) => {
        events.handlers[event] = handler;
      }),
    };
    notifications = {
      notify: jest.fn().mockResolvedValue(undefined),
      notifyPrintError: jest.fn().mockResolvedValue(undefined),
    };
    pickupLabel = { generate: jest.fn().mockResolvedValue('https://cdn.example.com/label.png') };
    shippingPrint = { enqueueWatch: jest.fn().mockResolvedValue(undefined) };
    printAgentWs = { pushJobReady: jest.fn() };

    service = new PrintCenterService(
      prisma as unknown as PrismaService,
      config as unknown as ConfigService,
      events as unknown as EventBusService,
      notifications as unknown as NotificationsService,
      pickupLabel as unknown as PickupLabelService,
      shippingPrint as unknown as ShippingPrintService,
      printAgentWs as unknown as PrintAgentWsGateway,
    );
    service.onModuleInit();
  });

  it('PRINT_CENTER_ENABLED=false: order.paid não cria nenhum job', async () => {
    flags({ PRINT_CENTER_ENABLED: 'false' });
    prisma.order.findUnique.mockResolvedValue(pickupOrder());

    await events.handlers[OmsEvents.OrderPaid]({ orderId: ORDER_ID });

    expect(prisma.order.findUnique).not.toHaveBeenCalled();
    expect(prisma.printJob.create).not.toHaveBeenCalled();
  });

  it('AUTO_PRINT_PICKUP=false: pedido de retirada pago não gera etiqueta', async () => {
    flags({ PRINT_CENTER_ENABLED: 'true', AUTO_PRINT_PICKUP: 'false' });
    prisma.order.findUnique.mockResolvedValue(pickupOrder());

    await events.handlers[OmsEvents.OrderPaid]({ orderId: ORDER_ID });

    expect(pickupLabel.generate).not.toHaveBeenCalled();
    expect(prisma.printJob.create).not.toHaveBeenCalled();
  });

  it('retirada paga com as flags ligadas: gera a etiqueta e cria o job READY', async () => {
    flags({ PRINT_CENTER_ENABLED: 'true', AUTO_PRINT_PICKUP: 'true' });
    prisma.order.findUnique.mockResolvedValue(pickupOrder());
    prisma.printJob.create.mockResolvedValue({ id: 'job-1', orderId: ORDER_ID, type: 'PICKUP' });

    await events.handlers[OmsEvents.OrderPaid]({ orderId: ORDER_ID });

    expect(pickupLabel.generate).toHaveBeenCalledTimes(1);
    expect(prisma.printJob.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          orderId: ORDER_ID,
          type: 'PICKUP',
          status: 'READY',
          documentUrl: 'https://cdn.example.com/label.png',
        }),
      }),
    );
    expect(notifications.notify).toHaveBeenCalledWith(
      expect.objectContaining({ role: 'VENDEDOR', orderId: ORDER_ID, type: 'PRINT_JOB_READY' }),
    );
    expect(printAgentWs.pushJobReady).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'job-1', type: 'PICKUP' }),
    );
  });

  it('falha ao gerar a etiqueta de retirada: notifica erro (só a conta do dono) e não cria job', async () => {
    flags({ PRINT_CENTER_ENABLED: 'true', AUTO_PRINT_PICKUP: 'true' });
    prisma.order.findUnique.mockResolvedValue(pickupOrder());
    pickupLabel.generate.mockRejectedValue(new Error('falha ao renderizar SVG'));

    await events.handlers[OmsEvents.OrderPaid]({ orderId: ORDER_ID });

    expect(prisma.printJob.create).not.toHaveBeenCalled();
    expect(notifications.notify).not.toHaveBeenCalled();
    expect(notifications.notifyPrintError).toHaveBeenCalledWith(
      expect.objectContaining({ orderId: ORDER_ID }),
    );
  });

  it('entrega paga com AUTO_PRINT_SHIPPING ligado: cria job PENDING e enfileira o watch', async () => {
    flags({ PRINT_CENTER_ENABLED: 'true', AUTO_PRINT_SHIPPING: 'true' });
    prisma.order.findUnique.mockResolvedValue(pickupOrder({ deliveryMethod: 'SHIPPING' }));
    prisma.printJob.create.mockResolvedValue({ id: 'job-2', orderId: ORDER_ID, type: 'SHIPPING' });

    await events.handlers[OmsEvents.OrderPaid]({ orderId: ORDER_ID });

    expect(pickupLabel.generate).not.toHaveBeenCalled();
    expect(prisma.printJob.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ orderId: ORDER_ID, type: 'SHIPPING', status: 'PENDING' }),
      }),
    );
    expect(shippingPrint.enqueueWatch).toHaveBeenCalledWith(ORDER_ID, 'job-2');
    // Job de envio nasce PENDING, não READY — o push só acontece depois, quando
    // o ShippingPrintService confirmar que a etiqueta do ME está pronta.
    expect(printAgentWs.pushJobReady).not.toHaveBeenCalled();
  });

  it('pagamento/webhook duplicado: segunda chamada de order.paid não duplica o job (P2002 é no-op)', async () => {
    flags({ PRINT_CENTER_ENABLED: 'true', AUTO_PRINT_PICKUP: 'true' });
    prisma.order.findUnique.mockResolvedValue(pickupOrder());
    prisma.printJob.create.mockRejectedValue(duplicateError());

    await events.handlers[OmsEvents.OrderPaid]({ orderId: ORDER_ID });

    expect(notifications.notify).not.toHaveBeenCalled();
  });

  it('erro real (não P2002) na criação do job propaga em vez de virar no-op', async () => {
    flags({ PRINT_CENTER_ENABLED: 'true', AUTO_PRINT_PICKUP: 'true' });
    prisma.order.findUnique.mockResolvedValue(pickupOrder());
    prisma.printJob.create.mockRejectedValue(new Error('db offline'));

    await expect(events.handlers[OmsEvents.OrderPaid]({ orderId: ORDER_ID })).rejects.toThrow(
      'db offline',
    );
  });

  it('pedido cancelado: jobs ainda não impressos viram FAILED', async () => {
    prisma.printJob.updateMany.mockResolvedValue({ count: 1 });

    await events.handlers[OmsEvents.OrderCancelled]({ orderId: ORDER_ID, reason: 'teste' });

    expect(prisma.printJob.updateMany).toHaveBeenCalledWith({
      where: { orderId: ORDER_ID, status: { notIn: ['PRINTED', 'FAILED'] } },
      data: { status: 'FAILED', lastError: 'Pedido cancelado.' },
    });
  });

  it('createManual: ignora as flags desligadas e cria o job mesmo assim', async () => {
    flags({ PRINT_CENTER_ENABLED: 'false' });
    prisma.order.findUnique.mockResolvedValue(pickupOrder());
    prisma.printJob.create.mockResolvedValue({ id: 'job-3', orderId: ORDER_ID, type: 'PICKUP' });

    const job = await service.createManual(ORDER_ID);

    expect(job).toEqual(expect.objectContaining({ id: 'job-3' }));
    expect(pickupLabel.generate).toHaveBeenCalledTimes(1);
  });

  it('createManual: lança NotFoundException se já existir job para o pedido (etiqueta duplicada)', async () => {
    flags({ PRINT_CENTER_ENABLED: 'true', AUTO_PRINT_PICKUP: 'true' });
    prisma.order.findUnique.mockResolvedValue(pickupOrder());
    prisma.printJob.create.mockRejectedValue(duplicateError());

    await expect(service.createManual(ORDER_ID)).rejects.toThrow();
  });
});
