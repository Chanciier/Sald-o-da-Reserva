import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PrintJobStatus, Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { QueueService } from '../queue/queue.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PrintAgentWsGateway } from './print-agent-ws.gateway';

export const PrintQueueNames = {
  ShippingLabelWatch: 'print.shipping.watch',
} as const;

interface ShippingWatchJob {
  orderId: string;
  printJobId: string;
}

// `purchaseLabel` (Melhor Envio) roda fire-and-forget logo após o pagamento
// aprovado e normalmente resolve em segundos, mas não há webhook de "etiqueta
// pronta" — por isso o polling. 60 tentativas a cada ~2s de tick dá bastante
// margem (~2min) antes de desistir e marcar o job como FAILED.
const MAX_ATTEMPTS = 60;

/**
 * Observa `Shipment.labelUrl` (preenchido pelo ShippingService, nunca por
 * este módulo) até a etiqueta oficial do Melhor Envio ficar disponível, sem
 * tocar em nenhum arquivo de `shipping/`. Zero webhook novo, zero linha
 * alterada no fluxo de pagamento/frete existente.
 */
@Injectable()
export class ShippingPrintService implements OnModuleInit {
  private readonly logger = new Logger(ShippingPrintService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly queue: QueueService,
    private readonly notifications: NotificationsService,
    private readonly printAgentWs: PrintAgentWsGateway,
  ) {}

  onModuleInit(): void {
    // maxAttempts alto o bastante para nunca dar dead-letter antes da nossa
    // própria contagem (PrintJob.attempts) decidir desistir.
    this.queue.register<ShippingWatchJob>(
      PrintQueueNames.ShippingLabelWatch,
      (data) => this.watch(data),
      { maxAttempts: MAX_ATTEMPTS + 10 },
    );
  }

  enqueueWatch(orderId: string, printJobId: string): Promise<void> {
    return this.queue.enqueue(PrintQueueNames.ShippingLabelWatch, { orderId, printJobId });
  }

  private async watch({ orderId, printJobId }: ShippingWatchJob): Promise<void> {
    const job = await this.prisma.printJob.findUnique({ where: { id: printJobId } });
    // Job já não está mais PENDING (cancelado, reimpresso, ou já resolvido por
    // uma tentativa anterior) — encerra o polling sem relançar.
    if (!job || job.status !== PrintJobStatus.PENDING) return;

    const shipment = await this.prisma.shipment.findUnique({
      where: { orderId },
      select: { labelUrl: true },
    });

    if (shipment?.labelUrl) {
      const updated = await this.prisma.printJob.update({
        where: { id: printJobId },
        data: { status: PrintJobStatus.READY, documentUrl: shipment.labelUrl },
      });
      await this.notifyReady(orderId);
      this.printAgentWs.pushJobReady(updated);
      return;
    }

    const attempts = job.attempts + 1;
    if (attempts >= MAX_ATTEMPTS) {
      await this.prisma.printJob.update({
        where: { id: printJobId },
        data: {
          status: PrintJobStatus.FAILED,
          attempts,
          lastError: 'Etiqueta do Melhor Envio não ficou pronta a tempo.',
        },
      });
      return;
    }

    await this.prisma.printJob.update({ where: { id: printJobId }, data: { attempts } });
    throw new Error('Etiqueta do Melhor Envio ainda não está pronta.');
  }

  private async notifyReady(orderId: string): Promise<void> {
    await this.notifications.notify({
      role: Role.ADMIN,
      type: 'PRINT_JOB_READY',
      title: 'Etiqueta de envio pronta',
      message: `Etiqueta de envio do pedido #${orderId.slice(-8).toUpperCase()} pronta para impressão.`,
      orderId,
    });
  }
}
