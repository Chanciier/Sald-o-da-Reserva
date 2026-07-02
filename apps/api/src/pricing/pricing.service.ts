import { Injectable, Logger, UnprocessableEntityException } from '@nestjs/common';
import { Prisma, ProductStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  PRICING_TIER_LABELS,
  PricingAnchorSource,
  PricingFactorScores,
  PricingInput,
  PricingResult,
  PricingSuggestion,
  PricingTier,
} from './pricing.types';

/** Pesos da combinação dos 4 fatores — somam 1.0. Concorrência e tempo em
 * estoque pesam mais por serem os sinais mais acionáveis numa loja de saldão
 * (girar estoque parado, reagir à concorrência); popularidade e histórico
 * pesam menos por costumarem faltar em produtos recém-cadastrados. */
const WEIGHTS = {
  competition: 0.35,
  stockAge: 0.3,
  popularity: 0.2,
  history: 0.15,
} as const;

/** Após quantos dias em estoque o sinal de "tempo em estoque" satura em 0 (máxima urgência). */
const STOCK_AGE_SATURATION_DAYS = 60;
/** Unidades vendidas a partir das quais o sinal de "histórico" satura em 1 (forte). */
const HISTORY_SATURATION_UNITS = 15;
/** Concorrentes a partir dos quais a concorrência já é considerada "alta" (score ~0.33). */
const COMPETITION_HALF_SCORE_COUNT = 5;

const NEUTRAL = 0.5;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * PricingModule — motor de sugestão de preço do Funcionário Virtual.
 *
 * Propositalmente NÃO copia o menor preço da concorrência. Calcula um
 * preço-âncora (mistura da média de mercado pesquisada pelo Hermes com a
 * média do próprio catálogo na categoria) e desloca essa âncora com base em
 * 4 sinais — concorrência, popularidade, histórico de vendas e tempo em
 * estoque — produzindo 3 estratégias (Agressivo/Equilibrado/Premium), cada
 * uma com uma explicação em português do fator que mais pesou.
 */
@Injectable()
export class PricingService {
  private readonly logger = new Logger(PricingService.name);

  constructor(private readonly prisma: PrismaService) {}

  async suggest(input: PricingInput): Promise<PricingResult> {
    const { anchorPrice, anchorSource } = await this.resolveAnchor(input);
    const factors = await this.resolveFactors(input);
    const suggestions = this.buildSuggestions(anchorPrice, factors, input);

    this.logger.log(
      `pricing: âncora=R$${anchorPrice.toFixed(2)} (${anchorSource}) → ` +
        suggestions.map((s) => `${s.tier}=R$${s.price.toFixed(2)}`).join(', '),
    );

    return { anchorPrice, anchorSource, factors, suggestions };
  }

  // ── Âncora (preço médio + categoria) ────────────────────────────────────

  /**
   * O preço-âncora é a base a partir da qual as 3 sugestões são deslocadas.
   * Prioriza a pesquisa de mercado (reflete concorrência real, ao vivo); usa o
   * catálogo próprio como estabilizador (30%) quando ambos existem, e como
   * único dado quando não há pesquisa de mercado disponível.
   */
  private async resolveAnchor(
    input: PricingInput,
  ): Promise<{ anchorPrice: number; anchorSource: PricingAnchorSource }> {
    const market = this.positiveOrNull(input.marketAvgPrice);
    const catalog = input.categoryId ? await this.categoryAveragePrice(input.categoryId) : null;

    if (market !== null && catalog !== null) {
      return {
        anchorPrice: this.round(market * 0.7 + catalog * 0.3),
        anchorSource: 'MARKET_AND_CATALOG',
      };
    }
    if (market !== null) {
      return { anchorPrice: this.round(market), anchorSource: 'MARKET' };
    }
    if (catalog !== null) {
      return { anchorPrice: this.round(catalog), anchorSource: 'CATALOG' };
    }
    const manual = this.positiveOrNull(input.referencePrice);
    if (manual !== null) {
      return { anchorPrice: this.round(manual), anchorSource: 'MANUAL' };
    }
    throw new UnprocessableEntityException(
      'Sem dados suficientes para precificar: informe marketAvgPrice, categoryId (com produtos cadastrados) ou referencePrice.',
    );
  }

  private async categoryAveragePrice(categoryId: string): Promise<number | null> {
    const agg = await this.prisma.product.aggregate({
      where: { categoryId, status: ProductStatus.ACTIVE },
      _avg: { price: true },
    });
    return agg._avg.price ? (agg._avg.price as Prisma.Decimal).toNumber() : null;
  }

  // ── Fatores (0..1, 1 = mais espaço para premium) ────────────────────────

  private async resolveFactors(input: PricingInput): Promise<PricingFactorScores> {
    const [popularity, history, stockAge] = await Promise.all([
      this.popularityScore(input),
      this.historyScore(input),
      this.stockAgeScore(input),
    ]);

    return {
      competition: this.competitionScore(input.competitorCount),
      popularity,
      history,
      stockAge,
    };
  }

  /** Menos concorrentes ativos → mais espaço para premium. Sem dado = neutro. */
  private competitionScore(competitorCount: number | null | undefined): number {
    if (competitorCount === null || competitorCount === undefined || competitorCount < 0) {
      return NEUTRAL;
    }
    return 1 / (1 + competitorCount / COMPETITION_HALF_SCORE_COUNT);
  }

  /**
   * Avaliações (rating médio) do produto; sem avaliações próprias, cai para a
   * média de avaliações da categoria; sem nenhum dado, neutro.
   */
  private async popularityScore(input: PricingInput): Promise<number> {
    if (input.productId) {
      const own = await this.prisma.review.aggregate({
        where: { productId: input.productId },
        _avg: { rating: true },
        _count: { rating: true },
      });
      if (own._count.rating > 0 && own._avg.rating !== null) {
        return this.clamp01(own._avg.rating / 5);
      }
    }
    if (input.categoryId) {
      const category = await this.prisma.review.aggregate({
        where: { product: { categoryId: input.categoryId } },
        _avg: { rating: true },
        _count: { rating: true },
      });
      if (category._count.rating > 0 && category._avg.rating !== null) {
        return this.clamp01(category._avg.rating / 5);
      }
    }
    return NEUTRAL;
  }

  /**
   * Unidades vendidas historicamente do próprio produto. Produto novo (sem
   * `productId`) não tem como ter histórico — neutro, não penaliza. Produto já
   * cadastrado sem nenhuma venda É um sinal real de baixa saída.
   */
  private async historyScore(input: PricingInput): Promise<number> {
    if (!input.productId) return NEUTRAL;

    const sold = await this.prisma.orderItem.aggregate({
      where: { productId: input.productId },
      _sum: { quantity: true },
    });
    const totalSold = sold._sum.quantity ?? 0;
    return this.clamp01(totalSold / HISTORY_SATURATION_UNITS);
  }

  /**
   * Dias desde o cadastro do produto (proxy de tempo em estoque, não há data
   * de entrada separada no schema). Produto novo (sem `productId`, acabou de
   * ser identificado pelo Vision) = acabou de chegar → score máximo.
   */
  private async stockAgeScore(input: PricingInput): Promise<number> {
    if (!input.productId) return 1;

    const product = await this.prisma.product.findUnique({
      where: { id: input.productId },
      select: { createdAt: true },
    });
    if (!product) return 1;

    const daysInStock = Math.max(0, (Date.now() - product.createdAt.getTime()) / MS_PER_DAY);
    return this.clamp01(1 - daysInStock / STOCK_AGE_SATURATION_DAYS);
  }

  // ── Sugestões (3 níveis a partir da âncora + fatores) ───────────────────

  private buildSuggestions(
    anchor: number,
    factors: PricingFactorScores,
    input: PricingInput,
  ): PricingSuggestion[] {
    const baseComposite = this.clamp01(
      factors.competition * WEIGHTS.competition +
        factors.popularity * WEIGHTS.popularity +
        factors.history * WEIGHTS.history +
        factors.stockAge * WEIGHTS.stockAge,
    );

    // Viés aprendido (LearningModule) nudja o composite em até 15% — só entra
    // na conta quando fornecido, pra não mudar o comportamento de quem ainda
    // não tem histórico de aprendizado nenhum.
    const composite =
      typeof input.learningBias === 'number'
        ? this.clamp01(baseComposite * 0.85 + this.clamp01((input.learningBias + 1) / 2) * 0.15)
        : baseComposite;

    // O "equilibrado" já reage ao composite (±10% em torno da âncora) — não é
    // simplesmente o preço médio de mercado repetido.
    const balanced = anchor * (0.9 + 0.2 * composite);
    const aggressiveMargin = 0.08 + 0.12 * (1 - composite); // 8%..20% abaixo
    const premiumMargin = 0.08 + 0.17 * composite; // 8%..25% acima

    let aggressive = balanced * (1 - aggressiveMargin);
    let premium = balanced * (1 + premiumMargin);

    // Guarda-corpo com os extremos reais do mercado (quando pesquisados pelo
    // Hermes): o Agressivo pode chegar perto do menor preço encontrado, mas
    // não abaixo disso — e o Premium não passa muito do maior preço
    // encontrado. Isto é o oposto de "usar o menor preço": é um limite, não o
    // valor em si.
    const marketMin = this.positiveOrNull(input.marketMinPrice);
    const marketMax = this.positiveOrNull(input.marketMaxPrice);
    if (marketMin !== null) aggressive = Math.max(aggressive, marketMin * 0.85);
    if (marketMax !== null) premium = Math.min(premium, marketMax * 1.15);

    return [
      this.toSuggestion('AGGRESSIVE', aggressive, anchor, factors),
      this.toSuggestion('BALANCED', balanced, anchor, factors),
      this.toSuggestion('PREMIUM', premium, anchor, factors),
    ];
  }

  private toSuggestion(
    tier: PricingTier,
    price: number,
    anchor: number,
    factors: PricingFactorScores,
  ): PricingSuggestion {
    const rounded = this.round(price);
    return {
      tier,
      label: PRICING_TIER_LABELS[tier],
      price: rounded,
      deltaFromAnchorPct: this.round(((rounded - anchor) / anchor) * 100),
      reasoning: this.explain(tier, factors, anchor),
    };
  }

  // ── Explicações em português ─────────────────────────────────────────────

  /** Motivos possíveis por fator, na direção que justifica PREMIUM vs AGRESSIVO. */
  private static readonly REASONS = {
    competition: {
      high: 'há pouca concorrência',
      low: 'há muita concorrência no mercado',
    },
    popularity: {
      high: 'o produto tem boa aceitação (avaliações)',
      low: 'ainda não há avaliações que sustentem um preço maior',
    },
    history: {
      high: 'o histórico de vendas desse produto é forte',
      low: 'o histórico de vendas é fraco ou inexistente',
    },
    stockAge: {
      high: 'o estoque é recém-chegado, sem pressão para girar rápido',
      low: 'o produto está parado há muito tempo em estoque',
    },
  } as const;

  /**
   * Monta a frase "Preço {Tier} porque {motivo(s)}." escolhendo, na direção
   * certa (PREMIUM olha o que está alto; AGRESSIVO olha o que está baixo), os
   * até 2 fatores mais extremos — os que realmente explicam a sugestão.
   */
  private explain(tier: PricingTier, factors: PricingFactorScores, anchor: number): string {
    const label = PRICING_TIER_LABELS[tier];

    if (tier === 'BALANCED') {
      return `${label} porque acompanha a referência de mercado (R$ ${anchor.toFixed(2)}) sem grandes desvios.`;
    }

    const direction: 'high' | 'low' = tier === 'PREMIUM' ? 'high' : 'low';
    const threshold = tier === 'PREMIUM' ? 0.6 : 0.4;
    const passes = (score: number) =>
      direction === 'high' ? score >= threshold : score <= threshold;
    const distanceFromNeutral = (score: number) => Math.abs(score - NEUTRAL);

    const entries = (Object.keys(factors) as Array<keyof PricingFactorScores>)
      .filter((key) => passes(factors[key]))
      .sort((a, b) => distanceFromNeutral(factors[b]) - distanceFromNeutral(factors[a]))
      .slice(0, 2)
      .map((key) => PricingService.REASONS[key][direction]);

    if (entries.length === 0) {
      // Nenhum fator suficientemente extremo — ainda assim precisa de uma frase.
      const fallback =
        tier === 'PREMIUM'
          ? 'o conjunto de sinais (concorrência, popularidade, histórico e estoque) sustenta um valor um pouco acima da média'
          : 'o conjunto de sinais (concorrência, popularidade, histórico e estoque) recomenda um valor um pouco abaixo da média para girar mais rápido';
      return `${label} porque ${fallback}.`;
    }

    return `${label} porque ${entries.join(' e ')}.`;
  }

  // ── Helpers numéricos ────────────────────────────────────────────────────

  private positiveOrNull(v: number | null | undefined): number | null {
    return typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : null;
  }

  private clamp01(v: number): number {
    if (Number.isNaN(v)) return NEUTRAL;
    return Math.max(0, Math.min(1, v));
  }

  private round(v: number): number {
    return Math.round(v * 100) / 100;
  }
}
