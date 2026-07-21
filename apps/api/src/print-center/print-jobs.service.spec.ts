import { PrismaService } from '../prisma/prisma.service';
import { PrintAgentWsGateway } from './print-agent-ws.gateway';
import { PrintJobsService } from './print-jobs.service';

/**
 * Cobre reimpressão (com auditoria), claim do Print Agent (incluindo
 * duplicidade — dois devices reivindicando o mesmo job) e as transições de
 * status que o device pode reportar — incluindo "erro de impressora" (→ FAILED).
 */
describe('PrintJobsService', () => {
  let service: PrintJobsService;
  let prisma: {
    printJob: { findUnique: jest.Mock; update: jest.Mock; updateMany: jest.Mock };
    auditLog: { create: jest.Mock };
  };
  let printAgentWs: { pushJobReady: jest.Mock };

  const JOB_ID = 'job-1';
  const DEVICE_ID = 'device-1';

  beforeEach(() => {
    prisma = {
      printJob: { findUnique: jest.fn(), update: jest.fn(), updateMany: jest.fn() },
      auditLog: { create: jest.fn().mockResolvedValue({}) },
    };
    printAgentWs = { pushJobReady: jest.fn() };
    service = new PrintJobsService(
      prisma as unknown as PrismaService,
      printAgentWs as unknown as PrintAgentWsGateway,
    );
  });

  describe('reprint', () => {
    it('volta o job para READY (documento já existe) e grava AuditLog', async () => {
      prisma.printJob.findUnique.mockResolvedValue({
        id: JOB_ID,
        orderId: 'order-1',
        type: 'PICKUP',
        documentUrl: 'https://cdn.example.com/label.png',
        status: 'FAILED',
      });
      prisma.printJob.update.mockResolvedValue({ id: JOB_ID, status: 'READY' });

      await service.reprint(JOB_ID, 'admin@example.com');

      expect(prisma.printJob.update).toHaveBeenCalledWith({
        where: { id: JOB_ID },
        data: {
          status: 'READY',
          attempts: 0,
          lastError: null,
          deviceId: null,
          sentAt: null,
          printedAt: null,
        },
      });
      expect(prisma.auditLog.create).toHaveBeenCalledWith({
        data: {
          action: 'print.reprint',
          metadata: {
            printJobId: JOB_ID,
            orderId: 'order-1',
            type: 'PICKUP',
            actor: 'admin@example.com',
          },
        },
      });
      expect(printAgentWs.pushJobReady).toHaveBeenCalledWith(
        expect.objectContaining({ id: JOB_ID, status: 'READY' }),
      );
    });

    it('sem documento ainda (etiqueta de envio nunca ficou pronta): volta para PENDING, sem push', async () => {
      prisma.printJob.findUnique.mockResolvedValue({
        id: JOB_ID,
        orderId: 'order-1',
        type: 'SHIPPING',
        documentUrl: null,
        status: 'FAILED',
      });
      prisma.printJob.update.mockResolvedValue({ id: JOB_ID, status: 'PENDING' });

      await service.reprint(JOB_ID, 'admin@example.com');

      expect(prisma.printJob.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ status: 'PENDING' }) }),
      );
      expect(printAgentWs.pushJobReady).not.toHaveBeenCalled();
    });
  });

  describe('claim', () => {
    it('READY → SENT, associa o device (updateMany atômico)', async () => {
      prisma.printJob.updateMany.mockResolvedValue({ count: 1 });
      prisma.printJob.findUnique.mockResolvedValue({
        id: JOB_ID,
        status: 'SENT',
        deviceId: DEVICE_ID,
      });

      await service.claim(JOB_ID, DEVICE_ID);

      expect(prisma.printJob.updateMany).toHaveBeenCalledWith({
        where: { id: JOB_ID, status: 'READY' },
        data: { status: 'SENT', deviceId: DEVICE_ID, sentAt: expect.any(Date) },
      });
    });

    it('rejeita claim de job que não está READY', async () => {
      prisma.printJob.updateMany.mockResolvedValue({ count: 0 });
      prisma.printJob.findUnique.mockResolvedValue({ id: JOB_ID, status: 'PENDING' });

      await expect(service.claim(JOB_ID, DEVICE_ID)).rejects.toThrow();
    });

    it('duplicidade: dois devices reivindicam o mesmo job ao mesmo tempo — só um vence', async () => {
      // O primeiro updateMany() afeta a linha (count=1); como o WHERE já exige
      // status=READY, o segundo updateMany() para o mesmo id não encontra mais
      // nenhuma linha em READY e afeta 0 — exatamente a garantia que impede
      // imprimir o mesmo job duas vezes.
      prisma.printJob.updateMany
        .mockResolvedValueOnce({ count: 1 })
        .mockResolvedValueOnce({ count: 0 });
      prisma.printJob.findUnique
        .mockResolvedValueOnce({ id: JOB_ID, status: 'SENT', deviceId: 'device-1' })
        .mockResolvedValueOnce({ id: JOB_ID, status: 'SENT', deviceId: 'device-1' });

      const [first, second] = await Promise.allSettled([
        service.claim(JOB_ID, 'device-1'),
        service.claim(JOB_ID, 'device-2'),
      ]);

      expect(first.status).toBe('fulfilled');
      expect(second.status).toBe('rejected');
    });
  });

  describe('updateStatus', () => {
    it('rejeita update de um device diferente do dono do job', async () => {
      prisma.printJob.findUnique.mockResolvedValue({
        id: JOB_ID,
        status: 'SENT',
        deviceId: 'outro-device',
      });

      await expect(service.updateStatus(JOB_ID, DEVICE_ID, 'PRINTING')).rejects.toThrow();
    });

    it('SENT → PRINTING é uma transição válida', async () => {
      prisma.printJob.findUnique.mockResolvedValue({
        id: JOB_ID,
        status: 'SENT',
        deviceId: DEVICE_ID,
      });
      prisma.printJob.update.mockResolvedValue({ id: JOB_ID, status: 'PRINTING' });

      await service.updateStatus(JOB_ID, DEVICE_ID, 'PRINTING');

      expect(prisma.printJob.update).toHaveBeenCalledWith({
        where: { id: JOB_ID },
        data: { status: 'PRINTING', lastError: null, attempts: undefined, printedAt: undefined },
      });
    });

    it('rejeita transição inválida (ex: READY direto para PRINTED)', async () => {
      prisma.printJob.findUnique.mockResolvedValue({
        id: JOB_ID,
        status: 'READY',
        deviceId: DEVICE_ID,
      });

      await expect(service.updateStatus(JOB_ID, DEVICE_ID, 'PRINTED')).rejects.toThrow();
    });

    it('erro de impressora: PRINTING → FAILED registra o motivo e soma uma tentativa', async () => {
      prisma.printJob.findUnique.mockResolvedValue({
        id: JOB_ID,
        status: 'PRINTING',
        deviceId: DEVICE_ID,
      });
      prisma.printJob.update.mockResolvedValue({ id: JOB_ID, status: 'FAILED' });

      await service.updateStatus(JOB_ID, DEVICE_ID, 'FAILED', 'Impressora sem papel');

      expect(prisma.printJob.update).toHaveBeenCalledWith({
        where: { id: JOB_ID },
        data: {
          status: 'FAILED',
          lastError: 'Impressora sem papel',
          attempts: { increment: 1 },
          printedAt: undefined,
        },
      });
    });
  });
});
