import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Marketplace, Prisma, PublicationStatus, SyncAction, SyncStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { QueueService } from '../queue/queue.service';
import { QueueNames } from '../queue/queue.types';
import { EventBusService } from '../events/event-bus.service';
import { OmsEvents } from '../events/oms-events';
import {
  MarketplaceProductInput,
  MarketplaceProvider,
  MarketplaceResult,
} from './providers/marketplace-provider.interface';
import { SiteProvider } from './providers/site.provider';
import { MercadoLivreProvider } from './providers/mercadolivre.provider';
import { ShopeeProvider } from './providers/shopee.provider';

interface PublishJob {
  productId: string;
  marketplace: Marketplace;
}

interface SyncJob {
  productId: string;
  marketplace: Marketplace;
  action: SyncAction;
  value?: number;
}

// Publicações consideradas "vivas" (alvo de sincronização e pausa/remoção).
const LIVE_STATUSES: PublicationStatus[] = [
  PublicationStatus.PUBLISHED,
  PublicationStatus.PAUSED,
  PublicationStatus.SYNC_PENDING,
];

/**
 * Camada única de publicação/sincronização em marketplaces.
 *
 * O Hub não conhece nenhuma API específica — apenas a interface
 * MarketplaceProvider. Ele gerencia o estado em `marketplace_publications`,
 * registra cada operação em `marketplace_sync_logs`, emite eventos no EventBus e
 * consome jobs das filas `marketplace.publish` e `marketplace.sync`.
 */
@Injectable()
export class MarketplaceHubService implements OnModuleInit {
  private readonly logger = new Logger(MarketplaceHubService.name);
  private readonly providers: Map<Marketplace, MarketplaceProvider>;

  constructor(
    private readonly prisma: PrismaService,
    private readonly queue: QueueService,
    private readonly events: EventBusService,
    site: SiteProvider,
    ml: MercadoLivreProvider,
    shopee: ShopeeProvider,
  ) {
    this.providers = new Map<Marketplace, MarketplaceProvider>([
      [Marketplace.SITE, site],
      [Marketplace.MERCADO_LIVRE, ml],
      [Marketplace.SHOPEE, shopee],
    ]);
  }

  onModuleInit(): void {
    this.queue.register<PublishJob>(QueueNames.MarketplacePublish, (job) =>
      this.processPublish(job),
    );
    this.queue.register<SyncJob>(QueueNames.MarketplaceSync, (job) => this.processSync(job));
  }

  getProvider(marketplace: Marketplace): MarketplaceProvider | undefined {
    return this.providers.get(marketplace);
  }

  // ── Enfileiramento (chamado por products.service / orchestrator) ───────────

  /** Cria/garante as publicações e enfileira jobs de publicação. */
  async enqueuePublish(productId: string, marketplaces: Marketplace[]): Promise<void> {
    const unique = [...new Set(marketplaces)];
    for (const marketplace of unique) {
      await this.prisma.marketplacePublication.upsert({
        where: { productId_marketplace: { productId, marketplace } },
        create: { productId, marketplace, status: PublicationStatus.PENDING },
        update: { status: PublicationStatus.PENDING, errorMessage: null },
      });
      await this.queue.enqueue<PublishJob>(QueueNames.MarketplacePublish, {
        productId,
        marketplace,
      });
    }
  }

  /** Enfileira sincronização apenas para os marketplaces onde o produto está vivo. */
  async enqueueSync(productId: string, action: SyncAction, value?: number): Promise<void> {
    const pubs = await this.prisma.marketplacePublication.findMany({
      where: { productId, status: { in: LIVE_STATUSES } },
      select: { marketplace: true },
    });
    if (pubs.length === 0) return;

    await this.prisma.marketplacePublication.updateMany({
      where: { productId, status: { in: LIVE_STATUSES } },
      data: { status: PublicationStatus.SYNC_PENDING },
    });

    for (const { marketplace } of pubs) {
      await this.queue.enqueue<SyncJob>(QueueNames.MarketplaceSync, {
        productId,
        marketplace,
        action,
        value,
      });
    }
  }

  /**
   * Propaga uma ação (PAUSE/REMOVE) para todos os canais onde o produto está
   * publicado, exceto (opcional) o canal onde a venda ocorreu. Usado pelo
   * Orchestrator na proteção contra venda duplicada de itens únicos.
   */
  async propagateToOtherChannels(
    productId: string,
    action: SyncAction,
    exceptMarketplace?: Marketplace,
  ): Promise<void> {
    const pubs = await this.prisma.marketplacePublication.findMany({
      where: { productId, status: { in: LIVE_STATUSES } },
      select: { marketplace: true },
    });
    for (const { marketplace } of pubs) {
      if (marketplace === exceptMarketplace) continue;
      await this.queue.enqueue<SyncJob>(QueueNames.MarketplaceSync, {
        productId,
        marketplace,
        action,
      });
    }
  }

  // ── Reprocessamento manual (painel /admin/marketplaces) ────────────────────

  async retryPublication(productId: string, marketplace: Marketplace): Promise<void> {
    await this.enqueuePublish(productId, [marketplace]);
  }

  async syncNow(productId: string, marketplace: Marketplace): Promise<void> {
    await this.queue.enqueue<SyncJob>(QueueNames.MarketplaceSync, {
      productId,
      marketplace,
      action: SyncAction.UPDATE,
    });
  }

  /** Reenfileira todas as publicações com erro de um marketplace. Retorna o total. */
  async retryFailed(marketplace: Marketplace): Promise<number> {
    const failed = await this.prisma.marketplacePublication.findMany({
      where: { marketplace, status: PublicationStatus.FAILED },
      select: { productId: true },
    });
    for (const { productId } of failed) {
      await this.enqueuePublish(productId, [marketplace]);
    }
    return failed.length;
  }

  /** Dispara sincronização (UPDATE) de todos os produtos vivos de um marketplace. */
  async syncAll(marketplace: Marketplace): Promise<number> {
    const pubs = await this.prisma.marketplacePublication.findMany({
      where: { marketplace, status: { in: LIVE_STATUSES } },
      select: { productId: true },
    });
    for (const { productId } of pubs) {
      await this.queue.enqueue<SyncJob>(QueueNames.MarketplaceSync, {
        productId,
        marketplace,
        action: SyncAction.UPDATE,
      });
    }
    return pubs.length;
  }

  // ── Processamento (consumidores das filas) ─────────────────────────────────

  private async processPublish(job: PublishJob): Promise<void> {
    const provider = this.providers.get(job.marketplace);
    if (!provider) return;

    const input = await this.buildInput(job.productId);
    if (!input) return;

    await this.setPublicationStatus(job, PublicationStatus.PUBLISHING);
    const result = await provider.publishProduct(input);
    await this.finishPublish(job, result, input);
  }

  private async processSync(job: SyncJob): Promise<void> {
    const provider = this.providers.get(job.marketplace);
    if (!provider) return;

    const pub = await this.prisma.marketplacePublication.findUnique({
      where: {
        productId_marketplace: {
          productId: job.productId,
          marketplace: job.marketplace,
        },
      },
    });
    if (!pub) return;

    const log = await this.prisma.marketplaceSyncLog.create({
      data: {
        productId: job.productId,
        marketplace: job.marketplace,
        action: job.action,
        status: SyncStatus.RUNNING,
      },
    });

    const ref = { productId: job.productId, externalId: pub.externalId };
    let result: MarketplaceResult;
    let nextStatus: PublicationStatus = PublicationStatus.PUBLISHED;

    switch (job.action) {
      case SyncAction.UPDATE: {
        const input = await this.buildInput(job.productId);
        result = input
          ? await provider.updateProduct(input)
          : { ok: false, error: 'Produto não encontrado' };
        break;
      }
      case SyncAction.UPDATE_STOCK:
        result = await provider.updateStock(ref, job.value ?? 0);
        break;
      case SyncAction.UPDATE_PRICE:
        result = await provider.updatePrice(ref, job.value ?? 0);
        break;
      case SyncAction.PAUSE:
        result = await provider.pauseProduct(ref);
        nextStatus = PublicationStatus.PAUSED;
        break;
      case SyncAction.REMOVE:
        result = await provider.removeProduct(ref);
        nextStatus = PublicationStatus.REMOVED;
        break;
      default:
        result = { ok: false, error: `Ação desconhecida: ${job.action}` };
    }

    await this.prisma.marketplaceSyncLog.update({
      where: { id: log.id },
      data: {
        status: result.ok ? SyncStatus.SUCCESS : SyncStatus.FAILED,
        errorMessage: result.ok ? null : (result.error ?? 'Erro desconhecido'),
        finishedAt: new Date(),
      },
    });

    await this.prisma.marketplacePublication.update({
      where: { id: pub.id },
      data: {
        status: result.ok ? nextStatus : PublicationStatus.FAILED,
        errorMessage: result.ok ? null : (result.error ?? 'Erro desconhecido'),
        responseReceived: toJson(result.responseReceived),
      },
    });

    if (!result.ok) {
      this.events.emit(OmsEvents.MarketplacePublishFailed, {
        productId: job.productId,
        marketplace: job.marketplace,
        error: result.error ?? 'Erro desconhecido',
      });
      // Lança para que a fila aplique retry/dead-letter.
      throw new Error(`Sync ${job.action} falhou em ${job.marketplace}: ${result.error}`);
    }
  }

  private async finishPublish(
    job: PublishJob,
    result: MarketplaceResult,
    input: MarketplaceProductInput,
  ): Promise<void> {
    await this.prisma.marketplacePublication.update({
      where: {
        productId_marketplace: {
          productId: job.productId,
          marketplace: job.marketplace,
        },
      },
      data: {
        status: result.ok ? PublicationStatus.PUBLISHED : PublicationStatus.FAILED,
        externalId: result.externalId ?? undefined,
        errorMessage: result.ok ? null : (result.error ?? 'Erro desconhecido'),
        payloadSent: toJson(result.payloadSent ?? input),
        responseReceived: toJson(result.responseReceived),
        publishedAt: result.ok ? new Date() : undefined,
      },
    });

    await this.prisma.marketplaceSyncLog.create({
      data: {
        productId: job.productId,
        marketplace: job.marketplace,
        action: SyncAction.PUBLISH,
        status: result.ok ? SyncStatus.SUCCESS : SyncStatus.FAILED,
        errorMessage: result.ok ? null : (result.error ?? 'Erro desconhecido'),
        finishedAt: new Date(),
      },
    });

    if (result.ok) {
      this.events.emit(OmsEvents.MarketplaceProductPublished, {
        productId: job.productId,
        marketplace: job.marketplace,
        externalId: result.externalId,
      });
    } else {
      this.events.emit(OmsEvents.MarketplacePublishFailed, {
        productId: job.productId,
        marketplace: job.marketplace,
        error: result.error ?? 'Erro desconhecido',
      });
      // Lança para acionar retry/dead-letter da fila.
      throw new Error(`Publicação falhou em ${job.marketplace}: ${result.error}`);
    }
  }

  private async setPublicationStatus(job: PublishJob, status: PublicationStatus): Promise<void> {
    await this.prisma.marketplacePublication.update({
      where: {
        productId_marketplace: {
          productId: job.productId,
          marketplace: job.marketplace,
        },
      },
      data: { status },
    });
  }

  /** Monta o snapshot neutro do produto a partir do banco. */
  private async buildInput(productId: string): Promise<MarketplaceProductInput | null> {
    const product = await this.prisma.product.findUnique({
      where: { id: productId },
      include: {
        images: { orderBy: { position: 'asc' }, select: { url: true } },
        category: { select: { name: true } },
      },
    });
    if (!product) return null;

    return {
      id: product.id,
      name: product.name,
      sku: product.sku,
      description: product.description,
      shortDescription: product.shortDescription,
      brand: product.brand,
      price: product.price.toNumber(),
      salePrice: product.salePrice?.toNumber() ?? null,
      stock: product.stock,
      weight: product.weight?.toNumber() ?? null,
      dimensions: product.dimensions,
      images: product.images.map((i) => i.url),
      categoryName: product.category?.name ?? null,
      ncm: product.ncm,
    };
  }

  // ── Saúde dos marketplaces (painel /admin/marketplaces) ────────────────────

  async health() {
    const marketplaces = [Marketplace.SITE, Marketplace.MERCADO_LIVRE, Marketplace.SHOPEE];

    return Promise.all(
      marketplaces.map(async (marketplace) => {
        const provider = this.providers.get(marketplace);
        const [published, failed, lastSync, queued, dead] = await Promise.all([
          this.prisma.marketplacePublication.count({
            where: { marketplace, status: PublicationStatus.PUBLISHED },
          }),
          this.prisma.marketplacePublication.count({
            where: { marketplace, status: PublicationStatus.FAILED },
          }),
          this.prisma.marketplaceSyncLog.findFirst({
            where: { marketplace, status: SyncStatus.SUCCESS },
            orderBy: { finishedAt: 'desc' },
            select: { finishedAt: true },
          }),
          this.queue.count(QueueNames.MarketplacePublish),
          this.queue.countDead(QueueNames.MarketplaceSync),
        ]);

        return {
          marketplace,
          connected: provider?.isEnabled() ?? false,
          publishedCount: published,
          errorCount: failed,
          lastSyncAt: lastSync?.finishedAt ?? null,
          queuedJobs: queued,
          deadLetterJobs: dead,
          importedOrders: 0, // importação de pedidos externos: fase futura
        };
      }),
    );
  }
}

function toJson(value: unknown): Prisma.InputJsonValue | undefined {
  if (value === undefined || value === null) return undefined;
  return value as Prisma.InputJsonValue;
}
