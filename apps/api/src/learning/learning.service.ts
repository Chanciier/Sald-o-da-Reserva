import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ProductStatus } from '@prisma/client';
import { EventBusService } from '../events/event-bus.service';
import { OmsEventPayloads, OmsEvents } from '../events/oms-events';
import { MarketResearchService } from '../market-research/market-research.service';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import {
  CategoryBias,
  LearningDashboard,
  LearningEvent,
  LearningEventType,
  TrackViewResult,
} from './learning.types';

// ── Limiares (documentados e ajustáveis num só lugar) ─────────────────────
/** Vendeu em até 24h → sinal forte de que o preço estava baixo demais. */
const FAST_SALE_HOURS = 24;
/** Vendeu, mas levou mais de 14 dias → sinal de que o preço estava no limite/alto. */
const SLOW_SALE_HOURS = 14 * 24;
/** Ativo e sem vender há mais de 30 dias → estoque parado. */
const STAGNANT_DAYS = 30;
/** Não re-marca o mesmo produto como parado antes de passar esse tempo. */
const STAGNANT_REFLAG_DAYS = 7;
/** Visitas no dia a partir das quais o produto é considerado "muito acesso". */
const HIGH_TRAFFIC_VIEWS_PER_DAY = 50;
/** Não dispara recálculo de preço mais de uma vez por dia para o mesmo produto. */
const HIGH_TRAFFIC_REFLAG_HOURS = 24;

/** Quanto cada tipo de evento move o viés da categoria (antes do clamp em [-1,1]). */
const BIAS_STEP: Record<LearningEventType, number> = {
  FAST_SALE: 0.15,
  SLOW_SALE: -0.08,
  STAGNANT: -0.12,
  HIGH_TRAFFIC: 0.05,
};

const MAX_EVENTS_LOG = 200;
const VIEW_COUNTER_TTL_SECONDS = 2 * 24 * 60 * 60; // sobrevive à virada do dia por segurança
const MS_PER_HOUR = 60 * 60 * 1000;
const MS_PER_DAY = 24 * MS_PER_HOUR;

/**
 * LearningModule — fecha o ciclo do Funcionário Virtual observando o que
 * acontece depois que um produto é publicado:
 *
 *  - Vendeu rápido (`product.sold` + `createdAt` recente) → viés positivo.
 *  - Vendeu devagar → viés levemente negativo.
 *  - Ficou parado sem vender (varredura diária) → viés negativo.
 *  - Recebeu muitos acessos (endpoint público de tracking) → viés levemente
 *    positivo E força um recálculo dos dados de mercado (Hermes) para esse
 *    produto, já que o interesse pode ter mudado.
 *
 * O viés é por CATEGORIA (não por produto — a maioria dos produtos daqui é
 * única e não repete, então o aprendizado só é útil para o "próximo" produto
 * parecido). Consumido por `PricingService` via `PricingInput.learningBias`.
 */
@Injectable()
export class LearningService implements OnModuleInit {
  private readonly logger = new Logger(LearningService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly events: EventBusService,
    private readonly marketResearch: MarketResearchService,
  ) {}

  onModuleInit(): void {
    this.events.on(OmsEvents.ProductSold, (p) => this.onProductSold(p));
  }

  // ── Sinal 1: venda rápida/lenta ──────────────────────────────────────────

  private async onProductSold({ productId }: OmsEventPayloads['product.sold']): Promise<void> {
    const product = await this.prisma.product.findUnique({
      where: { id: productId },
      select: { createdAt: true, categoryId: true },
    });
    if (!product) return;

    const hoursToSell = (Date.now() - product.createdAt.getTime()) / MS_PER_HOUR;

    if (hoursToSell <= FAST_SALE_HOURS) {
      await this.record({
        type: 'FAST_SALE',
        productId,
        categoryId: product.categoryId,
        detail: `Vendeu em ${hoursToSell.toFixed(1)}h — sugerir preço maior da próxima vez.`,
      });
    } else if (hoursToSell >= SLOW_SALE_HOURS) {
      await this.record({
        type: 'SLOW_SALE',
        productId,
        categoryId: product.categoryId,
        detail: `Vendeu, mas levou ${(hoursToSell / 24).toFixed(0)} dias — preço pode ter ficado alto.`,
      });
    }
    // Entre os dois limiares: venda no ritmo esperado, não é um sinal — não registra.
  }

  // ── Sinal 2: estoque parado (varredura diária) ──────────────────────────

  @Cron(CronExpression.EVERY_DAY_AT_6AM)
  async scanStagnantProducts(): Promise<number> {
    const cutoff = new Date(Date.now() - STAGNANT_DAYS * MS_PER_DAY);
    const stagnant = await this.prisma.product.findMany({
      where: { status: ProductStatus.ACTIVE, createdAt: { lte: cutoff } },
      select: { id: true, categoryId: true, createdAt: true },
    });

    let flagged = 0;
    for (const product of stagnant) {
      const flagKey = `learning:flagged:stagnant:${product.id}`;
      if (await this.redis.exists(flagKey)) continue;

      const days = Math.round((Date.now() - product.createdAt.getTime()) / MS_PER_DAY);
      await this.record({
        type: 'STAGNANT',
        productId: product.id,
        categoryId: product.categoryId,
        detail: `Parado há ${days} dias sem vender — sugerir preço menor.`,
      });
      await this.redis.set(flagKey, '1', STAGNANT_REFLAG_DAYS * 24 * 60 * 60);
      flagged++;
    }

    if (flagged > 0) this.logger.log(`learning: ${flagged} produto(s) marcado(s) como parado(s)`);
    return flagged;
  }

  // ── Sinal 3: muitos acessos ──────────────────────────────────────────────

  /** Chamado pelo storefront a cada visita à página do produto (rota pública). */
  async trackView(productId: string): Promise<TrackViewResult> {
    const dayKey = `learning:views:${productId}:${this.todayKey()}`;
    const viewsToday = await this.redis.increment(dayKey, VIEW_COUNTER_TTL_SECONDS);

    if (viewsToday < HIGH_TRAFFIC_VIEWS_PER_DAY) {
      return { productId, viewsToday, highTrafficTriggered: false };
    }

    const flagKey = `learning:flagged:hightraffic:${productId}`;
    if (await this.redis.exists(flagKey)) {
      return { productId, viewsToday, highTrafficTriggered: false };
    }
    await this.redis.set(flagKey, '1', HIGH_TRAFFIC_REFLAG_HOURS * 60 * 60);

    const product = await this.prisma.product.findUnique({
      where: { id: productId },
      select: { name: true, brand: true, categoryId: true },
    });
    if (!product) return { productId, viewsToday, highTrafficTriggered: false };

    await this.record({
      type: 'HIGH_TRAFFIC',
      productId,
      categoryId: product.categoryId,
      detail: `${viewsToday} acessos hoje — recalculando preço com dados de mercado atualizados.`,
    });

    // Recalcula os dados de mercado (não bloqueia o tracking de view).
    this.marketResearch
      .request({ title: product.name, brand: product.brand }, { forceRefresh: true })
      .catch((err) =>
        this.logger.warn(
          `learning: falha ao forçar recálculo de mercado: ${(err as Error).message}`,
        ),
      );

    return { productId, viewsToday, highTrafficTriggered: true };
  }

  // ── Viés aprendido (consumido pelo PricingModule) ───────────────────────

  async getBias(categoryId: string): Promise<CategoryBias> {
    const stored = await this.redis.getJson<CategoryBias>(this.biasKey(categoryId));
    if (stored) return stored;

    const category = await this.prisma.category.findUnique({
      where: { id: categoryId },
      select: { name: true },
    });
    return {
      categoryId,
      categoryName: category?.name ?? null,
      bias: 0,
      eventCount: 0,
      updatedAt: new Date().toISOString(),
    };
  }

  // ── Dashboard ─────────────────────────────────────────────────────────

  async getDashboard(): Promise<LearningDashboard> {
    const [recentRaw, categories] = await Promise.all([
      this.redis.lrange(this.eventsKey(), 0, 19),
      this.prisma.category.findMany({ select: { id: true } }),
    ]);

    const recentEvents = recentRaw
      .map((raw) => this.safeParse<LearningEvent>(raw))
      .filter((e): e is LearningEvent => e !== null);

    const totals: Record<LearningEventType, number> = {
      FAST_SALE: 0,
      SLOW_SALE: 0,
      STAGNANT: 0,
      HIGH_TRAFFIC: 0,
    };
    // Totais vêm de contadores persistentes (não só dos últimos 20 no feed).
    for (const type of Object.keys(totals) as LearningEventType[]) {
      totals[type] = Number((await this.redis.get(this.totalKey(type))) ?? '0');
    }

    const categoryBias = (await Promise.all(categories.map((c) => this.getBias(c.id)))).filter(
      (b) => b.eventCount > 0,
    );

    return { totals, categoryBias, recentEvents };
  }

  // ── Internals ─────────────────────────────────────────────────────────

  private async record(input: {
    type: LearningEventType;
    productId: string;
    categoryId: string | null;
    detail: string;
  }): Promise<void> {
    const event: LearningEvent = {
      ...input,
      biasDelta: input.categoryId ? BIAS_STEP[input.type] : 0,
      createdAt: new Date().toISOString(),
    };

    this.logger.log(`learning: [${event.type}] produto=${event.productId} — ${event.detail}`);

    await this.redis.rpush(this.eventsKey(), JSON.stringify(event));
    await this.redis.ltrim(this.eventsKey(), -MAX_EVENTS_LOG, -1);
    await this.redis.increment(this.totalKey(event.type));

    if (input.categoryId) {
      await this.applyBias(input.categoryId, BIAS_STEP[input.type]);
    }
  }

  private async applyBias(categoryId: string, delta: number): Promise<void> {
    const current = await this.getBias(categoryId);
    const updated: CategoryBias = {
      ...current,
      bias: Math.max(-1, Math.min(1, current.bias + delta)),
      eventCount: current.eventCount + 1,
      updatedAt: new Date().toISOString(),
    };
    await this.redis.setJson(this.biasKey(categoryId), updated);
  }

  private safeParse<T>(raw: string): T | null {
    try {
      return JSON.parse(raw) as T;
    } catch {
      return null;
    }
  }

  private todayKey(): string {
    return new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  }

  private biasKey(categoryId: string): string {
    return `learning:bias:${categoryId}`;
  }

  private eventsKey(): string {
    return 'learning:events';
  }

  private totalKey(type: LearningEventType): string {
    return `learning:total:${type}`;
  }
}
