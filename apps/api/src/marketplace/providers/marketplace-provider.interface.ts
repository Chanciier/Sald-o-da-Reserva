import type { Marketplace } from '@prisma/client';

/** Snapshot do produto no formato neutro consumido por todos os providers. */
export interface MarketplaceProductInput {
  id: string;
  name: string;
  sku: string;
  description?: string | null;
  shortDescription?: string | null;
  brand?: string | null;
  price: number;
  salePrice?: number | null;
  stock: number;
  weight?: number | null;
  dimensions?: unknown;
  images: string[];
  categoryName?: string | null;
  ncm?: string | null;
}

/** Referência de um produto já publicado em um marketplace. */
export interface ProductRef {
  productId: string;
  externalId?: string | null;
}

/** Resultado padronizado de qualquer operação de marketplace. */
export interface MarketplaceResult {
  ok: boolean;
  externalId?: string | null;
  payloadSent?: unknown;
  responseReceived?: unknown;
  error?: string;
}

/** Pedido importado de um marketplace externo (normalizado). */
export interface MarketplaceOrder {
  externalId: string;
  status?: string;
  total?: number;
  buyerName?: string;
  raw: unknown;
}

export interface MarketplaceWebhookResult {
  received: true;
  eventType?: string;
}

/**
 * Contrato único implementado por todo marketplace (SITE, Mercado Livre, Shopee).
 * O Hub conhece apenas esta interface — nunca os detalhes de cada API.
 */
export interface MarketplaceProvider {
  readonly marketplace: Marketplace;

  /** True quando há credenciais suficientes para chamadas reais. */
  isEnabled(): boolean;

  publishProduct(product: MarketplaceProductInput): Promise<MarketplaceResult>;
  updateProduct(product: MarketplaceProductInput): Promise<MarketplaceResult>;
  updateStock(ref: ProductRef, stock: number): Promise<MarketplaceResult>;
  updatePrice(ref: ProductRef, price: number): Promise<MarketplaceResult>;
  pauseProduct(ref: ProductRef): Promise<MarketplaceResult>;
  removeProduct(ref: ProductRef): Promise<MarketplaceResult>;
  getOrders(): Promise<MarketplaceOrder[]>;
  handleWebhook(payload: unknown): Promise<MarketplaceWebhookResult>;
}

/** Token de injeção para o conjunto de providers registrados. */
export const MARKETPLACE_PROVIDERS = Symbol('MARKETPLACE_PROVIDERS');
