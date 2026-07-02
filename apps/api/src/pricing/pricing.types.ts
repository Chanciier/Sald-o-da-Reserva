/**
 * Contrato do PricingModule — sugestão de preço para o Funcionário Virtual.
 *
 * Deliberadamente NÃO é "pegar o menor preço da concorrência". O algoritmo
 * calcula um preço-âncora (média de mercado + catálogo próprio) e desloca essa
 * âncora para cima/baixo com base em 4 sinais (concorrência, popularidade,
 * histórico de vendas, tempo em estoque), gerando 3 estratégias explicadas.
 *
 * Ver `pricing.service.ts` para a fórmula completa.
 */

export type PricingTier = 'AGGRESSIVE' | 'BALANCED' | 'PREMIUM';

export const PRICING_TIER_LABELS: Record<PricingTier, string> = {
  AGGRESSIVE: 'Preço Agressivo',
  BALANCED: 'Preço Equilibrado',
  PREMIUM: 'Preço Premium',
};

/** De onde veio o preço-âncora usado como base para as 3 sugestões. */
export type PricingAnchorSource = 'MARKET_AND_CATALOG' | 'MARKET' | 'CATALOG' | 'MANUAL';

/**
 * Os 4 sinais que deslocam a âncora, todos normalizados em [0, 1], onde valores
 * maiores sempre significam "mais espaço para cobrar um preço premium":
 *  - competition: 1 = pouquíssima concorrência, 0 = mercado saturado
 *  - popularity: 1 = produto/categoria muito bem avaliado, 0 = sem sinais de demanda
 *  - history: 1 = histórico de vendas forte, 0 = historicamente não vende
 *  - stockAge: 1 = chegou agora no estoque, 0 = parado há muito tempo
 */
export interface PricingFactorScores {
  competition: number;
  popularity: number;
  history: number;
  stockAge: number;
}

/** Uma das 3 sugestões de preço, com o racional em português. */
export interface PricingSuggestion {
  tier: PricingTier;
  label: string;
  price: number;
  /** Variação percentual em relação ao preço-âncora (pode ser negativa). */
  deltaFromAnchorPct: number;
  /** Ex.: "Preço Premium porque há pouca concorrência." */
  reasoning: string;
}

/** Resultado completo devolvido por `PricingService.suggest`. */
export interface PricingResult {
  anchorPrice: number;
  anchorSource: PricingAnchorSource;
  factors: PricingFactorScores;
  suggestions: PricingSuggestion[];
}

/**
 * Entrada da sugestão de preço. Os dados de mercado normalmente vêm do
 * MarketResearchModule (Hermes); `productId`/`categoryId` são opcionais e
 * habilitam sinais reais (histórico, tempo em estoque, popularidade) via
 * catálogo próprio — sem eles, esses sinais caem para valores neutros/da
 * categoria.
 */
export interface PricingInput {
  /** Preço médio encontrado na pesquisa de mercado (Hermes). */
  marketAvgPrice?: number | null;
  marketMinPrice?: number | null;
  marketMaxPrice?: number | null;
  /** Quantidade de anúncios concorrentes encontrados (Hermes `listingCount`). */
  competitorCount?: number | null;
  /** Categoria do produto — usada para ancorar no catálogo próprio e como fallback de popularidade/histórico. */
  categoryId?: string | null;
  /** Produto já cadastrado (reprecificação) — habilita histórico/tempo em estoque reais. Ausente = produto novo. */
  productId?: string | null;
  /** Preço de referência manual — usado só quando não há dado de mercado nem de catálogo. */
  referencePrice?: number | null;
  /**
   * Viés aprendido pelo LearningModule para a categoria, em [-1, 1]: negativo
   * empurra as 3 sugestões para baixo (produtos da categoria ficam parados em
   * estoque), positivo empurra para cima (produtos vendem rápido / muito
   * acesso). Ausente/0 = sem efeito. Ver `LearningService.getBias`.
   */
  learningBias?: number | null;
}
