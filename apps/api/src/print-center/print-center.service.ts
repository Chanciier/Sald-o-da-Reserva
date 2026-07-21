import { Injectable, Logger, NotFoundException, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  DeliveryMethod,
  Prisma,
  PrintJob,
  PrintJobStatus,
  PrintJobType,
  Role,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { EventBusService } from '../events/event-bus.service';
import { OmsEvents } from '../events/oms-events';
import { NotificationsService } from '../notifications/notifications.service';
import { PickupLabelService } from './pickup-label.service';
import { ShippingPrintService } from './shipping-print.service';
import { PrintAgentWsGateway } from './print-agent-ws.gateway';

interface LoadedOrder {
  id: string;
  deliveryMethod: DeliveryMethod;
  buyerName: string | null;
  customerPhone: string | null;
  createdAt: Date;
  items: Array<{ name: string; sku: string | null; quantity: number }>;
}

/**
 * Consumidor de eventos do Print Center. Só lê pedidos — nunca altera
 * pagamento, frete, NF-e, checkout ou o próprio pedido. Reage a:
 *   order.paid      → gera etiqueta de retirada, ou observa a etiqueta de
 *                      envio do Melhor Envio ficar pronta
 *   order.cancelled → interrompe jobs de impressão ainda não impressos
 */
@Injectable()
export class PrintCenterService implements OnModuleInit {
  private readonly logger = new Logger(PrintCenterService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly events: EventBusService,
    private readonly notifications: NotificationsService,
    private readonly pickupLabel: PickupLabelService,
    private readonly shippingPrint: ShippingPrintService,
    private readonly printAgentWs: PrintAgentWsGateway,
  ) {}

  onModuleInit(): void {
    this.events.on(OmsEvents.OrderPaid, async (p) => {
      await this.handleOrderPaid(p.orderId, { manual: false });
    });
    this.events.on(OmsEvents.OrderCancelled, (p) => this.handleOrderCancelled(p.orderId));
  }

  /** Disparo manual pelo painel admin — ignora as feature flags (ação explícita). */
  async createManual(orderId: string): Promise<PrintJob> {
    const job = await this.handleOrderPaid(orderId, { manual: true });
    if (!job) {
      throw new NotFoundException(
        'Pedido não encontrado, ou já existe um job de impressão para ele (use reimprimir).',
      );
    }
    return job;
  }

  private async handleOrderPaid(
    orderId: string,
    opts: { manual: boolean },
  ): Promise<PrintJob | null> {
    if (!opts.manual && !this.isEnabled('PRINT_CENTER_ENABLED')) return null;

    const order = await this.loadOrder(orderId);
    if (!order) return null;

    if (order.deliveryMethod === DeliveryMethod.PICKUP) {
      return this.handlePickup(order, opts.manual);
    }
    return this.handleShipping(order.id, opts.manual);
  }

  private async handlePickup(order: LoadedOrder, manual: boolean): Promise<PrintJob | null> {
    if (!manual && !this.isEnabled('AUTO_PRINT_PICKUP')) return null;

    let documentUrl: string;
    try {
      documentUrl = await this.pickupLabel.generate(order);
    } catch (err) {
      this.logger.error(`Falha ao gerar etiqueta de retirada do pedido ${order.id}`, err as Error);
      return null;
    }

    const job = await this.createJob(order.id, PrintJobType.PICKUP, {
      status: PrintJobStatus.READY,
      documentUrl,
      printerProfile: 'pickup',
    });
    if (!job) return null;

    await this.notifyReady(order.id, 'Etiqueta de retirada pronta');
    this.printAgentWs.pushJobReady(job);
    return job;
  }

  private async handleShipping(orderId: string, manual: boolean): Promise<PrintJob | null> {
    if (!manual && !this.isEnabled('AUTO_PRINT_SHIPPING')) return null;

    const job = await this.createJob(orderId, PrintJobType.SHIPPING, {
      status: PrintJobStatus.PENDING,
      printerProfile: 'shipping',
    });
    if (!job) return null;

    await this.shippingPrint.enqueueWatch(orderId, job.id);
    return job;
  }

  private async handleOrderCancelled(orderId: string): Promise<void> {
    // Best-effort, roda sempre (independente das flags) — só limpa jobs que já
    // existirem; se não houver nenhum, é um updateMany sem efeito.
    await this.prisma.printJob.updateMany({
      where: { orderId, status: { notIn: [PrintJobStatus.PRINTED, PrintJobStatus.FAILED] } },
      data: { status: PrintJobStatus.FAILED, lastError: 'Pedido cancelado.' },
    });
  }

  /** Cria o PrintJob; retorna null se já existir para este pedido/tipo (idempotência). */
  private async createJob(
    orderId: string,
    type: PrintJobType,
    data: { status: PrintJobStatus; documentUrl?: string; printerProfile?: string },
  ): Promise<PrintJob | null> {
    try {
      return await this.prisma.printJob.create({ data: { orderId, type, ...data } });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        return null;
      }
      throw err;
    }
  }

  private async loadOrder(orderId: string): Promise<LoadedOrder | null> {
    return this.prisma.order.findUnique({
      where: { id: orderId },
      select: {
        id: true,
        deliveryMethod: true,
        buyerName: true,
        customerPhone: true,
        createdAt: true,
        items: { select: { name: true, sku: true, quantity: true } },
      },
    });
  }

  private async notifyReady(orderId: string, title: string): Promise<void> {
    await this.notifications.notify({
      role: Role.ADMIN,
      type: 'PRINT_JOB_READY',
      title,
      message: `Pedido #${orderId.slice(-8).toUpperCase()} pronto para impressão.`,
      orderId,
    });
  }

  private isEnabled(key: string): boolean {
    return (this.config.get<string>(key, 'false') || 'false').trim().toLowerCase() === 'true';
  }
}
