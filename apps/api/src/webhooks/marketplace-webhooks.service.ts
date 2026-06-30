import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Marketplace, Prisma, WebhookSource, WebhookStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { QueueService } from '../queue/queue.service';
import { QueueNames } from '../queue/queue.types';
import { MarketplaceHubService } from '../marketplace/marketplace-hub.service';

interface WebhookProcessJob {
  webhookLogId: string;
}

/**
 * Ingestão de webhooks de marketplaces (Mercado Livre, Shopee).
 *
 * Princípio: NUNCA travar o sistema principal. A rota apenas grava o payload
 * bruto em `webhook_logs` e enfileira o processamento — retornando 200
 * imediatamente. O processamento assíncrono delega ao provider correspondente
 * (via Hub) e atualiza o status do log, com retry/dead-letter pela fila.
 *
 * O webhook do Mercado Pago continua sendo tratado pelo WebhooksService
 * existente (com validação HMAC e fluxo de pagamento) — não é tocado aqui.
 */
@Injectable()
export class MarketplaceWebhooksService implements OnModuleInit {
  private readonly logger = new Logger(MarketplaceWebhooksService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly queue: QueueService,
    private readonly hub: MarketplaceHubService,
  ) {}

  onModuleInit(): void {
    this.queue.register<WebhookProcessJob>(QueueNames.WebhookProcess, (job) => this.process(job));
  }

  /** Grava o log bruto e enfileira o processamento. Nunca lança. */
  async ingest(source: WebhookSource, payload: unknown): Promise<{ received: true }> {
    try {
      const log = await this.prisma.webhookLog.create({
        data: {
          source,
          payload: (payload ?? {}) as Prisma.InputJsonValue,
          status: WebhookStatus.RECEIVED,
        },
      });
      await this.queue.enqueue<WebhookProcessJob>(QueueNames.WebhookProcess, {
        webhookLogId: log.id,
      });
    } catch (err) {
      this.logger.error(`Falha ao registrar webhook ${source}`, err as Error);
    }
    return { received: true };
  }

  private async process({ webhookLogId }: WebhookProcessJob): Promise<void> {
    const log = await this.prisma.webhookLog.findUnique({
      where: { id: webhookLogId },
    });
    if (!log) return;

    const marketplace = sourceToMarketplace(log.source);
    if (!marketplace) {
      await this.prisma.webhookLog.update({
        where: { id: log.id },
        data: { status: WebhookStatus.IGNORED, processedAt: new Date() },
      });
      return;
    }

    const provider = this.hub.getProvider(marketplace);
    if (!provider) return;

    await this.prisma.webhookLog.update({
      where: { id: log.id },
      data: { status: WebhookStatus.PROCESSING },
    });

    try {
      const result = await provider.handleWebhook(log.payload);
      await this.prisma.webhookLog.update({
        where: { id: log.id },
        data: {
          status: WebhookStatus.PROCESSED,
          eventType: result.eventType ?? null,
          processedAt: new Date(),
        },
      });
    } catch (err) {
      await this.prisma.webhookLog.update({
        where: { id: log.id },
        data: {
          status: WebhookStatus.FAILED,
          errorMessage: (err as Error).message,
          processedAt: new Date(),
        },
      });
      throw err; // aciona retry/dead-letter da fila
    }
  }
}

function sourceToMarketplace(source: WebhookSource): Marketplace | null {
  switch (source) {
    case WebhookSource.MERCADO_LIVRE:
      return Marketplace.MERCADO_LIVRE;
    case WebhookSource.SHOPEE:
      return Marketplace.SHOPEE;
    default:
      return null;
  }
}
