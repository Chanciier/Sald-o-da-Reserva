/**
 * Contrato do MarketResearchModule (pesquisa de mercado do "Hermes Agent").
 *
 * Depois que o produto é identificado (Vision + Identification), o Hermes
 * pesquisa Mercado Livre e Shopee e devolve estatísticas de preço, quantidade
 * de anúncios, links e um resumo. Tudo roda em background e é cacheado — nunca
 * bloqueia o cadastro.
 */

/** Marketplaces pesquisados. */
export type MarketplaceSource = 'MERCADO_LIVRE' | 'SHOPEE';

export const MARKETPLACE_SOURCES: readonly MarketplaceSource[] = ['MERCADO_LIVRE', 'SHOPEE'];

/** Estado de um job de pesquisa (para o fluxo assíncrono/poll). */
export type MarketResearchStatus = 'PENDING' | 'READY' | 'FAILED';

/** Um anúncio encontrado na pesquisa. */
export interface MarketListing {
  marketplace: MarketplaceSource;
  title: string;
  /** Preço em BRL. `null` quando não foi possível determinar. */
  price: number | null;
  url: string;
}

/** Estatísticas de preço agregadas para um marketplace. */
export interface MarketplacePriceStats {
  marketplace: MarketplaceSource;
  minPrice: number | null;
  avgPrice: number | null;
  maxPrice: number | null;
  /** Quantidade de anúncios considerados (com preço válido). */
  listingCount: number;
  /** Links dos anúncios encontrados nesse marketplace. */
  links: string[];
}

/** Resultado consolidado da pesquisa de mercado. */
export interface MarketResearchData {
  /** Consulta normalizada usada na busca. */
  query: string;
  /** Moeda das estatísticas (sempre BRL nesta versão). */
  currency: 'BRL';
  minPrice: number | null;
  avgPrice: number | null;
  maxPrice: number | null;
  /** Total de anúncios com preço válido (soma dos marketplaces). */
  listingCount: number;
  /** Quebra por marketplace (Mercado Livre e Shopee). */
  byMarketplace: MarketplacePriceStats[];
  /** Todos os anúncios encontrados. */
  listings: MarketListing[];
  /** Links únicos encontrados (todos os marketplaces). */
  links: string[];
  /** Resumo textual do mercado, gerado pelo modelo. */
  summary: string;
  /** Momento em que a pesquisa foi concluída (ISO 8601). */
  researchedAt: string;
  /** Modelo da Anthropic efetivamente usado. */
  modelUsed: string;
}

/** Estado completo de um job, persistido no Redis e devolvido no poll. */
export interface MarketResearchJob {
  key: string;
  query: string;
  status: MarketResearchStatus;
  data?: MarketResearchData;
  error?: string;
  updatedAt: string;
}

/**
 * Entrada da pesquisa — normalmente o que Vision/Identification produziram.
 * Todos opcionais; a query é montada com o que estiver disponível.
 */
export interface MarketResearchInput {
  /** Título comercial (ex.: `IdentificationResult.seoTitle`). */
  title?: string | null;
  brand?: string | null;
  model?: string | null;
  category?: string | null;
  keywords?: string[];
}

/** Payload do job de background enfileirado. */
export interface MarketResearchJobData {
  key: string;
  query: string;
  input: MarketResearchInput;
}
