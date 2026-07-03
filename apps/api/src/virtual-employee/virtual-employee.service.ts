import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { IdentificationService } from '../identification/identification.service';
import { LearningService } from '../learning/learning.service';
import { MarketResearchService } from '../market-research/market-research.service';
import { MarketResearchData } from '../market-research/market-research.types';
import { PricingService } from '../pricing/pricing.service';
import { PrismaService } from '../prisma/prisma.service';
import { CreateProductDto } from '../products/dto/create-product.dto';
import { ProductsService } from '../products/products.service';
import { RedisService } from '../redis/redis.service';
import { VisionCondition } from '../vision/vision.types';
import { VisionService } from '../vision/vision.service';
import {
  CompetitionLevel,
  VirtualEmployeeAnalyzeInput,
  VirtualEmployeeApproveInput,
  VirtualEmployeeReview,
} from './virtual-employee.types';

const REVIEW_CACHE_PREFIX = 'virtual-employee:review:';
/** Tempo que o operador tem para revisar/editar antes de precisar refazer a análise. */
const REVIEW_TTL_SECONDS = 60 * 60;

/**
 * Orçamento máximo da pesquisa de mercado DENTRO do analyze síncrono. O Hermes
 * (web search) pode levar vários minutos no pior caso, mas navegador e proxy
 * cortam a requisição em ~300s — então a análise inteira precisa caber nisso.
 * Se o orçamento estourar, seguimos sem dados de mercado (Pricing cai para o
 * catálogo próprio) e a pesquisa continua rodando por baixo: quando terminar,
 * o resultado fica cacheado (12h) e a PRÓXIMA análise do mesmo produto o usa.
 */
const RESEARCH_BUDGET_MS = Number(process.env.VIRTUAL_EMPLOYEE_RESEARCH_BUDGET_MS) || 90_000;

/** A partir de quantos anúncios concorrentes a concorrência já é "Alta"/"Média". */
const COMPETITION_THRESHOLDS = { medium: 4, high: 11 } as const;

/**
 * VirtualEmployeeModule — orquestrador de ponta a ponta do Funcionário
 * Virtual. O operador só fotografa e envia as fotos; este serviço encadeia:
 *
 *   Vision → Identification → Market Research (Hermes, síncrono) → Pricing
 *   (já com o viés aprendido da categoria) → um painel único.
 *
 * O operador só precisa Aprovar (cria o produto de verdade) ou Editar campos
 * antes de aprovar — nada é persistido em `analyze`, só em `approve`.
 */
@Injectable()
export class VirtualEmployeeService {
  private readonly logger = new Logger(VirtualEmployeeService.name);

  constructor(
    private readonly vision: VisionService,
    private readonly identification: IdentificationService,
    private readonly marketResearch: MarketResearchService,
    private readonly pricing: PricingService,
    private readonly learning: LearningService,
    private readonly products: ProductsService,
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  async analyze(input: VirtualEmployeeAnalyzeInput): Promise<VirtualEmployeeReview> {
    const vision = await this.vision.analyze(input);
    const identification = await this.identification.generate(vision);

    const market = await this.safeResearch({
      title: identification.seoTitle,
      brand: vision.brand,
      category: identification.category,
      keywords: vision.keywords,
    });

    const learningBias = identification.categoryId
      ? (await this.learning.getBias(identification.categoryId)).bias
      : null;

    const pricingResult = await this.pricing.suggest({
      marketAvgPrice: market?.avgPrice,
      marketMinPrice: market?.minPrice,
      marketMaxPrice: market?.maxPrice,
      competitorCount: market?.listingCount,
      categoryId: identification.categoryId,
      referencePrice: market ? undefined : this.fallbackReferencePrice(),
      learningBias,
    });
    const balanced = pricingResult.suggestions.find((s) => s.tier === 'BALANCED')!;

    const ncm = identification.categoryId
      ? await this.categoryNcm(identification.categoryId)
      : null;

    const review: VirtualEmployeeReview = {
      reviewId: randomUUID(),
      product: {
        title: identification.seoTitle,
        description: identification.description,
        category: identification.category,
        categoryId: identification.categoryId,
        ncm,
        brand: vision.brand,
        tags: identification.tags,
        specifications: identification.specifications,
        slug: identification.slug,
        metaDescription: identification.metaDescription,
      },
      confidence: vision.confidence,
      pricing: { suggestedPrice: balanced.price, suggestions: pricingResult.suggestions },
      market: {
        byMarketplace: (market?.byMarketplace ?? []).map((m) => ({
          marketplace: m.marketplace,
          avgPrice: m.avgPrice,
          listingCount: m.listingCount,
        })),
        competition: this.competitionLevel(market?.listingCount ?? 0),
        summary:
          market?.summary ??
          'Pesquisa de mercado indisponível no momento — preço baseado no catálogo próprio.',
      },
      vision,
      createdAt: new Date().toISOString(),
    };

    await this.redis.setJson(this.reviewKey(review.reviewId), review, REVIEW_TTL_SECONDS);
    this.logger.log(
      `virtual-employee: análise pronta — "${review.product.title}" (confiança=${(vision.confidence * 100).toFixed(0)}%, preço sugerido=R$${review.pricing.suggestedPrice.toFixed(2)})`,
    );
    return review;
  }

  /**
   * Operador aprova (com ou sem edições) → cria o produto de verdade via
   * ProductsService, exatamente como o cadastro manual faria.
   */
  async approve(input: VirtualEmployeeApproveInput, userId?: string) {
    const review = await this.redis.getJson<VirtualEmployeeReview>(this.reviewKey(input.reviewId));
    if (!review) {
      throw new NotFoundException(
        'Análise não encontrada ou expirada (1h). Refaça o envio das fotos.',
      );
    }

    const dto: CreateProductDto = {
      name: input.name ?? review.product.title,
      description: input.description ?? review.product.description,
      price: input.price ?? review.pricing.suggestedPrice,
      metaDescription: input.metaDescription ?? review.product.metaDescription,
      slug: review.product.slug,
      brand: this.resolveNullable(input.brand, review.product.brand),
      categoryId: this.resolveNullable(input.categoryId, review.product.categoryId),
      ncm: this.resolveNullable(input.ncm, review.product.ncm),
      stock: input.stock ?? 1,
      isUnique: input.isUnique ?? true,
      condition: this.mapCondition(review.vision.condition),
      imageIds: input.imageIds,
    };

    const product = await this.products.create(dto, userId);
    await this.redis.del(this.reviewKey(input.reviewId));
    this.logger.log(`virtual-employee: produto criado — ${product.id} ("${product.name}")`);
    return product;
  }

  /**
   * Pesquisa de mercado nunca derruba a análise — sem ela, o Pricing cai para
   * o catálogo próprio. Além de capturar erros, impõe RESEARCH_BUDGET_MS: sem
   * esse teto, o Hermes pode passar dos ~300s que navegador/proxy toleram e a
   * requisição inteira morre com 499 (visto em produção em 03/07/2026).
   */
  private async safeResearch(query: {
    title: string;
    brand: string | null;
    category: string | null;
    keywords: string[];
  }): Promise<MarketResearchData | null> {
    try {
      return await this.withBudget(this.marketResearch.researchNow(query), RESEARCH_BUDGET_MS);
    } catch (err) {
      this.logger.warn(
        `virtual-employee: pesquisa de mercado falhou/estourou o orçamento, seguindo sem ela: ${(err as Error).message}`,
      );
      return null;
    }
  }

  /**
   * Corrida entre a promise e o orçamento. Ao estourar, a pesquisa perdedora
   * NÃO é cancelada de propósito: `researchNow` grava o resultado no cache ao
   * terminar, então a próxima análise do mesmo produto o encontra pronto.
   */
  private withBudget<T>(promise: Promise<T>, ms: number): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error(`orçamento de ${Math.round(ms / 1000)}s esgotado`)),
        ms,
      );
      promise.then(
        (value) => {
          clearTimeout(timer);
          resolve(value);
        },
        (err) => {
          clearTimeout(timer);
          reject(err);
        },
      );
    });
  }

  /**
   * Sem pesquisa de mercado E sem catálogo na categoria, o PricingService não
   * tem nenhuma âncora — usa um valor mínimo simbólico para não travar a
   * análise; o operador SEMPRE revisa o preço antes de aprovar.
   */
  private fallbackReferencePrice(): number {
    return 49.9;
  }

  private competitionLevel(listingCount: number): CompetitionLevel {
    if (listingCount >= COMPETITION_THRESHOLDS.high) return 'ALTA';
    if (listingCount >= COMPETITION_THRESHOLDS.medium) return 'MEDIA';
    return 'BAIXA';
  }

  private async categoryNcm(categoryId: string): Promise<string | null> {
    const category = await this.prisma.category.findUnique({
      where: { id: categoryId },
      select: { ncm: true },
    });
    return category?.ncm ?? null;
  }

  /** NOVO → 'new' (mapeia para o `condition` do anúncio); qualquer outro grau vira 'used'. */
  private mapCondition(condition: VisionCondition | null): 'new' | 'used' {
    return condition === 'NOVO' ? 'new' : 'used';
  }

  /** `undefined` = usa o valor sugerido; `null` explícito = limpa o campo; string = override. */
  private resolveNullable(
    override: string | null | undefined,
    fallback: string | null,
  ): string | undefined {
    if (override === undefined) return fallback ?? undefined;
    return override ?? undefined;
  }

  private reviewKey(reviewId: string): string {
    return `${REVIEW_CACHE_PREFIX}${reviewId}`;
  }
}
