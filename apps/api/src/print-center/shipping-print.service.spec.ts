import { PrismaService } from '../prisma/prisma.service';
import { QueueService } from '../queue/queue.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PrintAgentWsGateway } from './print-agent-ws.gateway';
import { ShippingPrintService, PrintQueueNames } from './shipping-print.service';

/**
 * Cobre a observação da etiqueta do Melhor Envio: reconexão (label atrasado,
 * aparece depois de algumas tentativas) e esgotamento de tentativas → FAILED.
 * Nenhuma chamada real ao Melhor Envio acontece — Shipment.labelUrl é lido
 * direto do Prisma (mockado), exatamente como o serviço real faz.
 */
describe('ShippingPrintService', () => {
  let service: ShippingPrintService;
  let prisma: {
    printJob: { findUnique: jest.Mock; update: jest.Mock };
    shipment: { findUnique: jest.Mock };
  };
  let queue: {
    register: jest.Mock;
    enqueue: jest.Mock;
    handler?: (data: unknown) => Promise<void>;
  };
  let notifications: { notify: jest.Mock };
  let printAgentWs: { pushJobReady: jest.Mock };

  const ORDER_ID = 'order-1';
  const JOB_ID = 'job-1';

  beforeEach(() => {
    prisma = {
      printJob: { findUnique: jest.fn(), update: jest.fn().mockResolvedValue({}) },
      shipment: { findUnique: jest.fn() },
    };
    queue = {
      register: jest.fn((_name: string, handler: (data: unknown) => Promise<void>) => {
        queue.handler = handler;
      }),
      enqueue: jest.fn().mockResolvedValue(undefined),
    };
    notifications = { notify: jest.fn().mockResolvedValue(undefined) };
    printAgentWs = { pushJobReady: jest.fn() };

    service = new ShippingPrintService(
      prisma as unknown as PrismaService,
      queue as unknown as QueueService,
      notifications as unknown as NotificationsService,
      printAgentWs as unknown as PrintAgentWsGateway,
    );
    service.onModuleInit();
  });

  it('registra o handler na fila print.shipping.watch', () => {
    expect(queue.register).toHaveBeenCalledWith(
      PrintQueueNames.ShippingLabelWatch,
      expect.any(Function),
      expect.objectContaining({ maxAttempts: expect.any(Number) }),
    );
  });

  it('enqueueWatch delega para QueueService.enqueue', async () => {
    await service.enqueueWatch(ORDER_ID, JOB_ID);
    expect(queue.enqueue).toHaveBeenCalledWith(PrintQueueNames.ShippingLabelWatch, {
      orderId: ORDER_ID,
      printJobId: JOB_ID,
    });
  });

  it('job não está mais PENDING (cancelado/já resolvido): encerra sem escrever nada', async () => {
    prisma.printJob.findUnique.mockResolvedValue({ id: JOB_ID, status: 'FAILED', attempts: 3 });

    await queue.handler!({ orderId: ORDER_ID, printJobId: JOB_ID });

    expect(prisma.shipment.findUnique).not.toHaveBeenCalled();
    expect(prisma.printJob.update).not.toHaveBeenCalled();
  });

  it('reconexão: etiqueta ainda não pronta → incrementa attempts e relança para a fila retentar', async () => {
    prisma.printJob.findUnique.mockResolvedValue({ id: JOB_ID, status: 'PENDING', attempts: 2 });
    prisma.shipment.findUnique.mockResolvedValue({ labelUrl: null });

    await expect(queue.handler!({ orderId: ORDER_ID, printJobId: JOB_ID })).rejects.toThrow();

    expect(prisma.printJob.update).toHaveBeenCalledWith({
      where: { id: JOB_ID },
      data: { attempts: 3 },
    });
  });

  it('etiqueta aparece: marca READY com o documentUrl e notifica o admin', async () => {
    prisma.printJob.findUnique.mockResolvedValue({ id: JOB_ID, status: 'PENDING', attempts: 5 });
    prisma.shipment.findUnique.mockResolvedValue({ labelUrl: 'https://me.example.com/label.pdf' });
    prisma.printJob.update.mockResolvedValue({
      id: JOB_ID,
      orderId: ORDER_ID,
      type: 'SHIPPING',
      status: 'READY',
      documentUrl: 'https://me.example.com/label.pdf',
    });

    await queue.handler!({ orderId: ORDER_ID, printJobId: JOB_ID });

    expect(prisma.printJob.update).toHaveBeenCalledWith({
      where: { id: JOB_ID },
      data: { status: 'READY', documentUrl: 'https://me.example.com/label.pdf' },
    });
    expect(notifications.notify).toHaveBeenCalledWith(
      expect.objectContaining({ orderId: ORDER_ID, type: 'PRINT_JOB_READY' }),
    );
    expect(printAgentWs.pushJobReady).toHaveBeenCalledWith(
      expect.objectContaining({ id: JOB_ID, status: 'READY' }),
    );
  });

  it('esgota as tentativas: marca FAILED e não relança (para o polling)', async () => {
    prisma.printJob.findUnique.mockResolvedValue({ id: JOB_ID, status: 'PENDING', attempts: 59 });
    prisma.shipment.findUnique.mockResolvedValue({ labelUrl: null });

    await expect(
      queue.handler!({ orderId: ORDER_ID, printJobId: JOB_ID }),
    ).resolves.toBeUndefined();

    expect(prisma.printJob.update).toHaveBeenCalledWith({
      where: { id: JOB_ID },
      data: {
        status: 'FAILED',
        attempts: 60,
        lastError: 'Etiqueta do Melhor Envio não ficou pronta a tempo.',
      },
    });
    expect(notifications.notify).not.toHaveBeenCalled();
  });
});
