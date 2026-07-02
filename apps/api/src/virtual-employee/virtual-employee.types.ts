import { ProductSpecification } from '../identification/identification.types';
import { MarketplaceSource } from '../market-research/market-research.types';
import { PricingSuggestion } from '../pricing/pricing.types';
import { VisionAttributes } from '../vision/vision.types';

/**
 * Contrato do VirtualEmployeeModule — o orquestrador de ponta a ponta do
 * Funcionário Virtual. O operador só fotografa e envia; este módulo encadeia
 * Vision → Identification → Market Research (Hermes) → Pricing → Learning e
 * devolve UM painel único para o operador aprovar ou editar.
 */

/** Classificação de concorrência para exibição simples no painel ("Alta"/"Média"/"Baixa"). */
export type CompetitionLevel = 'BAIXA' | 'MEDIA' | 'ALTA';

/** Preço médio encontrado num marketplace específico, para o painel (ex.: "Shopee: R$ 194"). */
export interface MarketplacePriceSummary {
  marketplace: MarketplaceSource;
  avgPrice: number | null;
  listingCount: number;
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

/** O painel único devolvido por `POST /virtual-employee/analyze`. */
export interface VirtualEmployeeReview {
  /** Token opaco para reidentificar essa análise em `approve` — nada é persistido ainda. */
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
  /** Atributos brutos do Vision — preservados para reconstruir o produto no approve. */
  vision: VisionAttributes;
  createdAt: string;
}

export interface VirtualEmployeeAnalyzeInput {
  imageUrls?: string[];
  imagesBase64?: string[];
}

/**
 * Entrada de `POST /virtual-employee/approve`. Só `reviewId` é obrigatório —
 * todo o resto é um override opcional do que o operador editou no painel; os
 * campos omitidos usam o valor sugerido em `VirtualEmployeeReview`.
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
