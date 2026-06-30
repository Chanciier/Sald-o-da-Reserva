import { Injectable, Logger } from '@nestjs/common';
import { Marketplace } from '@prisma/client';
import {
  MarketplaceOrder,
  MarketplaceProductInput,
  MarketplaceProvider,
  MarketplaceResult,
  MarketplaceWebhookResult,
  ProductRef,
} from './marketplace-provider.interface';

/**
 * Provider do canal próprio (SITE).
 *
 * O site é a fonte de verdade: o produto JÁ vive na tabela `products`, então
 * publicar/atualizar é essencialmente confirmar que o anúncio existe — não há
 * API externa. Por isso este provider está sempre habilitado e nunca falha por
 * falta de credenciais, garantindo que o site continue funcionando mesmo se os
 * marketplaces externos caírem.
 */
@Injectable()
export class SiteProvider implements MarketplaceProvider {
  readonly marketplace = Marketplace.SITE;
  private readonly logger = new Logger(SiteProvider.name);

  isEnabled(): boolean {
    return true;
  }

  async publishProduct(product: MarketplaceProductInput): Promise<MarketplaceResult> {
    this.logger.log(`SITE: produto ${product.sku} publicado (canal próprio)`);
    // O externalId do canal próprio é o próprio id do produto.
    return { ok: true, externalId: product.id };
  }

  async updateProduct(product: MarketplaceProductInput): Promise<MarketplaceResult> {
    return { ok: true, externalId: product.id };
  }

  async updateStock(ref: ProductRef): Promise<MarketplaceResult> {
    // O site lê o estoque diretamente da tabela products — nada a sincronizar.
    return { ok: true, externalId: ref.externalId ?? ref.productId };
  }

  async updatePrice(ref: ProductRef): Promise<MarketplaceResult> {
    return { ok: true, externalId: ref.externalId ?? ref.productId };
  }

  async pauseProduct(ref: ProductRef): Promise<MarketplaceResult> {
    // A pausa/remoção no site é controlada pelo status do produto (StockService/
    // Orchestrator). Aqui apenas confirmamos a operação.
    return { ok: true, externalId: ref.externalId ?? ref.productId };
  }

  async removeProduct(ref: ProductRef): Promise<MarketplaceResult> {
    return { ok: true, externalId: ref.externalId ?? ref.productId };
  }

  async getOrders(): Promise<MarketplaceOrder[]> {
    // Pedidos do site já nascem no banco via checkout — não há importação.
    return [];
  }

  async handleWebhook(): Promise<MarketplaceWebhookResult> {
    return { received: true };
  }
}
