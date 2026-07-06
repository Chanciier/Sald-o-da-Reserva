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

/** Dimensões estimadas da embalagem, em cm (mesmo shape do `Product.dimensions`). */
export interface DraftDimensions {
  width: number;
  height: number;
  depth: number;
  unit: 'cm';
}

/** Os campos do produto sugeridos pela IA — tudo editável pelo operador antes de aprovar. */
export interface VirtualEmployeeProductDraft {
  title: string;
  description: string;
  shortDescription: string;
  category: string | null;
  categoryId: string | null;
  ncm: string | null;
  brand: string | null;
  tags: string[];
  specifications: ProductSpecification[];
  slug: string;
  metaDescription: string;
  /** Peso estimado pela IA (kg) para frete — sempre revisável. */
  weight: number | null;
  /** Dimensões estimadas pela IA (cm) para frete — sempre revisáveis. */
  dimensions: DraftDimensions | null;
  /** GTIN/EAN lido de código de barras visível na foto. */
  gtin: string | null;
  /** Condição do anúncio derivada do estado visual (NOVO → 'new'; resto → 'used'). */
  condition: 'new' | 'used';
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
  shortDescription?: string;
  categoryId?: string | null;
  ncm?: string | null;
  brand?: string | null;
  price?: number;
  metaDescription?: string;
  stock?: number;
  isUnique?: boolean;
  imageIds?: string[];
  weight?: number | null;
  dimensions?: DraftDimensions | null;
  gtin?: string | null;
  condition?: 'new' | 'used';
  pickupAvailable?: boolean;
  /** Dispara o anúncio nos grupos de WhatsApp já na criação (com a 1ª imagem). */
  autoPublishWhatsapp?: boolean;
  whatsappGroupIds?: string[];
  /** Marketplaces além do SITE onde publicar ao aprovar (ML/Shopee). */
  publishTo?: ('MERCADO_LIVRE' | 'SHOPEE')[];
}
