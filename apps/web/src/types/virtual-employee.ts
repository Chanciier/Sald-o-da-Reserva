// Espelha apps/api/src/vision/vision.types.ts, apps/api/src/pricing/pricing.types.ts,
// apps/api/src/market-research/market-research.types.ts e
// apps/api/src/virtual-employee/virtual-employee.types.ts
// (os apps não compartilham pacote de tipos — mesma convenção já usada em products.ts/product.ts)

export type VisionCondition = 'NOVO' | 'USADO_BOM' | 'USADO_REGULAR' | 'DANIFICADO';

export interface VisionResult {
  brand: string | null;
  model: string | null;
  category: string | null;
  color: string | null;
  material: string | null;
  dimensions: string | null;
  condition: VisionCondition | null;
  features: string[];
  keywords: string[];
  confidence: number;
  modelUsed: string;
  imagesAnalyzed: number;
}

export interface ProductSpecification {
  label: string;
  value: string;
}

export type MarketplaceSource = 'MERCADO_LIVRE' | 'SHOPEE';

export const MARKETPLACE_LABELS: Record<MarketplaceSource, string> = {
  MERCADO_LIVRE: 'Mercado Livre',
  SHOPEE: 'Shopee',
};

/** Preço médio encontrado num marketplace específico (ex.: "Shopee: R$ 194"). */
export interface MarketplacePriceSummary {
  marketplace: MarketplaceSource;
  avgPrice: number | null;
  listingCount: number;
}

export type CompetitionLevel = 'BAIXA' | 'MEDIA' | 'ALTA';

export const COMPETITION_LABELS: Record<CompetitionLevel, string> = {
  BAIXA: 'Baixa',
  MEDIA: 'Média',
  ALTA: 'Alta',
};

export type PricingTier = 'AGGRESSIVE' | 'BALANCED' | 'PREMIUM';

export const PRICING_TIER_LABELS: Record<PricingTier, string> = {
  AGGRESSIVE: 'Agressivo',
  BALANCED: 'Equilibrado',
  PREMIUM: 'Premium',
};

/** Uma das 3 sugestões de preço, com o racional em português. */
export interface PricingSuggestion {
  tier: PricingTier;
  label: string;
  price: number;
  /** Variação percentual em relação ao preço-âncora (pode ser negativa). */
  deltaFromAnchorPct: number;
  reasoning: string;
}

/** Os campos do produto sugeridos pela IA — tudo editável pelo operador antes de aprovar. */
export interface VirtualEmployeeProductDraft {
  title: string;
  description: string;
  category: string | null;
  categoryId: string | null;
  ncm: string | null;
  brand: string | null;
  tags: string[];
  specifications: ProductSpecification[];
  slug: string;
  metaDescription: string;
}

/** O painel único devolvido por `POST /virtual-employee/analyze`. Nada é persistido ainda. */
export interface VirtualEmployeeReview {
  /** Token opaco para reidentificar essa análise em `approve` (expira em 1h). */
  reviewId: string;
  product: VirtualEmployeeProductDraft;
  /** Confiança da identificação visual, 0..1 (ex.: 0.98 = "98%"). */
  confidence: number;
  pricing: {
    /** Preço sugerido = a estratégia "Equilibrado". */
    suggestedPrice: number;
    /** As 3 estratégias completas (Agressivo/Equilibrado/Premium), com explicação. */
    suggestions: PricingSuggestion[];
  };
  market: {
    byMarketplace: MarketplacePriceSummary[];
    competition: CompetitionLevel;
    summary: string;
  };
  vision: VisionResult;
  createdAt: string;
}

/**
 * Entrada de `POST /virtual-employee/approve`. Só `reviewId` é obrigatório —
 * o resto são overrides do que o operador editou no painel; campos omitidos
 * usam o valor sugerido em `VirtualEmployeeReview`.
 */
export interface VirtualEmployeeApproveInput {
  reviewId: string;
  name?: string;
  description?: string;
  categoryId?: string | null;
  ncm?: string | null;
  brand?: string | null;
  price?: number;
  metaDescription?: string;
  stock?: number;
  isUnique?: boolean;
  imageIds?: string[];
}
