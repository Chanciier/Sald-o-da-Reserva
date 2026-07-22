import { ConfigService } from '@nestjs/config';
import { PDFDocument } from 'pdf-lib';
import { PrismaService } from '../prisma/prisma.service';
import { QueueService } from '../queue/queue.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PrintAgentWsGateway } from './print-agent-ws.gateway';
import { PrintStorageService } from './print-storage.service';
import { ShippingPrintService, PrintQueueNames } from './shipping-print.service';

/**
 * Cobre a observação da etiqueta do Melhor Envio: reconexão (label atrasado,
 * aparece depois de algumas tentativas), busca do PDF direto via
 * /me/imprimir/pdf (não a página interativa de /me/shipment/print),
 * reencaixe no tamanho físico 4x6" (com PDF real via pdf-lib — mesmo
 * padrão do PickupLabelService de usar a lib de verdade nos testes), e
 * esgotamento de tentativas → FAILED. `fetch` global e o upload pro S3
 * são os únicos pontos mockados.
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
  let notifications: { notify: jest.Mock; notifyPrintError: jest.Mock };
  let printAgentWs: { pushJobReady: jest.Mock };
  let config: { get: jest.Mock };
  let storage: { uploadPdf: jest.Mock };
  let fetchMock: jest.Mock;

  const ORDER_ID = 'order-1';
  const JOB_ID = 'job-1';
  const ME_ORDER_ID = 'me-order-1';
  const FILE_URL = 'https://me-bucket.s3.amazonaws.com/label.pdf?X-Amz-Signature=abc';

  jest.setTimeout(20000);

  /** PDF de 1 página, tamanho arbitrário (bem diferente de 4x6") — igual ao caso real. */
  async function samplePdfBytes(): Promise<Buffer> {
    const doc = await PDFDocument.create();
    const page = doc.addPage([577.5, 813]);
    // Página em branco não tem /Contents — embedPdf exige que exista.
    page.drawRectangle({ x: 0, y: 0, width: 100, height: 100 });
    return Buffer.from(await doc.save());
  }

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
    notifications = {
      notify: jest.fn().mockResolvedValue(undefined),
      notifyPrintError: jest.fn().mockResolvedValue(undefined),
    };
    printAgentWs = { pushJobReady: jest.fn() };
    config = { get: jest.fn((_key: string, def?: string) => def) };
    storage = {
      uploadPdf: jest.fn().mockResolvedValue('https://cdn.example.com/print-jobs/fitted.pdf'),
    };
    fetchMock = jest.fn();
    global.fetch = fetchMock as unknown as typeof fetch;

    service = new ShippingPrintService(
      prisma as unknown as PrismaService,
      queue as unknown as QueueService,
      notifications as unknown as NotificationsService,
      printAgentWs as unknown as PrintAgentWsGateway,
      config as unknown as ConfigService,
      storage as unknown as PrintStorageService,
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
    prisma.shipment.findUnique.mockResolvedValue({ labelUrl: null, meOrderId: null });

    await expect(queue.handler!({ orderId: ORDER_ID, printJobId: JOB_ID })).rejects.toThrow();

    expect(prisma.printJob.update).toHaveBeenCalledWith({
      where: { id: JOB_ID },
      data: { attempts: 3 },
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('etiqueta + DACE: busca os dois PDFs, reencaixa em 4x6" (etiqueta na pág. 1, DACE na pág. 2) e marca READY', async () => {
    prisma.printJob.findUnique.mockResolvedValue({ id: JOB_ID, status: 'PENDING', attempts: 5 });
    prisma.shipment.findUnique.mockResolvedValue({
      labelUrl: 'https://melhorenvio.com.br/imprimir/abc123',
      meOrderId: ME_ORDER_ID,
    });
    const labelBytes = await samplePdfBytes();
    const daceBytes = await samplePdfBytes();
    const DACE_FILE_URL = 'https://me-bucket.s3.amazonaws.com/dace.pdf?X-Amz-Signature=xyz';
    fetchMock
      .mockResolvedValueOnce({ ok: true, text: async () => JSON.stringify([FILE_URL]) })
      .mockResolvedValueOnce({ ok: true, arrayBuffer: async () => labelBytes.buffer })
      .mockResolvedValueOnce({ ok: true, text: async () => JSON.stringify({ pdf: DACE_FILE_URL }) })
      .mockResolvedValueOnce({ ok: true, arrayBuffer: async () => daceBytes.buffer });
    prisma.printJob.update.mockResolvedValue({
      id: JOB_ID,
      orderId: ORDER_ID,
      type: 'SHIPPING',
      status: 'READY',
      documentUrl: 'https://cdn.example.com/print-jobs/fitted.pdf',
    });

    await queue.handler!({ orderId: ORDER_ID, printJobId: JOB_ID });

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining(`/me/imprimir/pdf/${ME_ORDER_ID}`),
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: expect.stringContaining('Bearer') }),
      }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(2, FILE_URL);
    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      expect.stringContaining(`/me/imprimir/dace/pdf/${ME_ORDER_ID}`),
      expect.anything(),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(4, DACE_FILE_URL);

    // 2 páginas (etiqueta + DACE), cada uma já reencaixada em 4x6"
    // (288x432pt), não no tamanho original (577.5x813pt) dos PDFs de origem.
    const uploadedBuffer = storage.uploadPdf.mock.calls[0][0] as Buffer;
    const fittedDoc = await PDFDocument.load(uploadedBuffer);
    expect(fittedDoc.getPageCount()).toBe(2);
    for (const page of fittedDoc.getPages()) {
      const size = page.getSize();
      expect(size.width).toBeCloseTo(288, 0);
      expect(size.height).toBeCloseTo(432, 0);
    }

    expect(prisma.printJob.update).toHaveBeenCalledWith({
      where: { id: JOB_ID },
      data: { status: 'READY', documentUrl: 'https://cdn.example.com/print-jobs/fitted.pdf' },
    });
    expect(notifications.notify).toHaveBeenCalledWith(
      expect.objectContaining({ role: 'VENDEDOR', orderId: ORDER_ID, type: 'PRINT_JOB_READY' }),
    );
    expect(printAgentWs.pushJobReady).toHaveBeenCalledWith(
      expect.objectContaining({ id: JOB_ID, status: 'READY' }),
    );
  });

  it('sem DACE (nem todo envio tem uma): segue só com a etiqueta, sem falhar o job', async () => {
    prisma.printJob.findUnique.mockResolvedValue({ id: JOB_ID, status: 'PENDING', attempts: 5 });
    prisma.shipment.findUnique.mockResolvedValue({
      labelUrl: 'https://melhorenvio.com.br/imprimir/abc123',
      meOrderId: ME_ORDER_ID,
    });
    const labelBytes = await samplePdfBytes();
    fetchMock
      .mockResolvedValueOnce({ ok: true, text: async () => JSON.stringify([FILE_URL]) })
      .mockResolvedValueOnce({ ok: true, arrayBuffer: async () => labelBytes.buffer })
      .mockResolvedValueOnce({ ok: false, status: 404, text: async () => '' });
    prisma.printJob.update.mockResolvedValue({
      id: JOB_ID,
      orderId: ORDER_ID,
      type: 'SHIPPING',
      status: 'READY',
      documentUrl: 'https://cdn.example.com/print-jobs/fitted.pdf',
    });

    await queue.handler!({ orderId: ORDER_ID, printJobId: JOB_ID });

    const uploadedBuffer = storage.uploadPdf.mock.calls[0][0] as Buffer;
    const fittedDoc = await PDFDocument.load(uploadedBuffer);
    expect(fittedDoc.getPageCount()).toBe(1);
    expect(prisma.printJob.update).toHaveBeenCalledWith({
      where: { id: JOB_ID },
      data: { status: 'READY', documentUrl: 'https://cdn.example.com/print-jobs/fitted.pdf' },
    });
  });

  it('labelUrl existe mas o endpoint do PDF ainda falha: trata como não pronto e tenta de novo', async () => {
    prisma.printJob.findUnique.mockResolvedValue({ id: JOB_ID, status: 'PENDING', attempts: 2 });
    prisma.shipment.findUnique.mockResolvedValue({
      labelUrl: 'https://melhorenvio.com.br/imprimir/abc123',
      meOrderId: ME_ORDER_ID,
    });
    fetchMock.mockResolvedValue({ ok: false, status: 404, text: async () => '' });

    await expect(queue.handler!({ orderId: ORDER_ID, printJobId: JOB_ID })).rejects.toThrow();

    expect(prisma.printJob.update).toHaveBeenCalledWith({
      where: { id: JOB_ID },
      data: { attempts: 3 },
    });
    expect(storage.uploadPdf).not.toHaveBeenCalled();
  });

  it('esgota as tentativas: marca FAILED e não relança (para o polling)', async () => {
    prisma.printJob.findUnique.mockResolvedValue({ id: JOB_ID, status: 'PENDING', attempts: 59 });
    prisma.shipment.findUnique.mockResolvedValue({ labelUrl: null, meOrderId: null });

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
    expect(notifications.notifyPrintError).toHaveBeenCalledWith(
      expect.objectContaining({ orderId: ORDER_ID }),
    );
  });
});
