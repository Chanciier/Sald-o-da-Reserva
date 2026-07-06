import type { ProductSpecification, VirtualEmployeeReview } from '@/types/virtual-employee';

/** Estado editável do painel do Funcionário Virtual — tudo livre para o operador alterar antes de aprovar. */
export interface ReviewPanelState {
  title: string;
  description: string;
  shortDescription: string;
  specifications: ProductSpecification[];
  categoryId: string; // '' = nenhuma selecionada
  tags: string[];
  metaDescription: string;
  ncm: string;
  brand: string;
  price: number;
  stock: number;
  isUnique: boolean;
  /** Campos numéricos como texto ('' = vazio) para edição livre nos inputs. */
  weight: string;
  dimWidth: string;
  dimHeight: string;
  dimDepth: string;
  gtin: string;
  condition: 'new' | 'used';
  pickupAvailable: boolean;
  /** Disparo de WhatsApp já no primeiro salvamento (com a 1ª imagem). */
  autoPublishWhatsapp: boolean;
  whatsappGroupIds: string[];
  /** Marketplaces além do site onde publicar ao aprovar. */
  publishTo: ('MERCADO_LIVRE' | 'SHOPEE')[];
}

export function toReviewPanelState(
  review: VirtualEmployeeReview,
  defaults: { whatsappGroupIds?: string[] } = {},
): ReviewPanelState {
  const groupIds = defaults.whatsappGroupIds ?? [];
  return {
    title: review.product.title,
    description: review.product.description,
    shortDescription: review.product.shortDescription ?? '',
    specifications: review.product.specifications,
    categoryId: review.product.categoryId ?? '',
    tags: review.product.tags,
    metaDescription: review.product.metaDescription,
    ncm: review.product.ncm ?? '',
    brand: review.product.brand ?? '',
    price: review.pricing.suggestedPrice,
    stock: 1,
    isUnique: true,
    weight: review.product.weight != null ? String(review.product.weight) : '',
    dimWidth: review.product.dimensions ? String(review.product.dimensions.width) : '',
    dimHeight: review.product.dimensions ? String(review.product.dimensions.height) : '',
    dimDepth: review.product.dimensions ? String(review.product.dimensions.depth) : '',
    gtin: review.product.gtin ?? '',
    condition: review.product.condition ?? (review.vision.condition === 'NOVO' ? 'new' : 'used'),
    pickupAvailable: false,
    // Disparo no primeiro salvamento: se há grupos ativos, já nasce ligado.
    autoPublishWhatsapp: groupIds.length > 0,
    whatsappGroupIds: groupIds,
    publishTo: [],
  };
}
