import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
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
 * Provider do Mercado Livre — ESTRUTURA PREPARADA.
 *
 * As chamadas reais à API do ML exigem credenciais OAuth (app id/secret + token
 * por vendedor) que ainda não estão configuradas. Enquanto `isEnabled()` for
 * false, toda operação retorna um resultado de falha controlada (sem lançar),
 * de modo que o Hub registre o erro na publicação e o site continue funcionando.
 *
 * Pontos de integração reais estão marcados com TODO e centralizados em
 * `request()`, que já trata token/baseUrl/headers.
 */
@Injectable()
export class MercadoLivreProvider implements MarketplaceProvider {
  readonly marketplace = Marketplace.MERCADO_LIVRE;
  private readonly logger = new Logger(MercadoLivreProvider.name);

  private readonly accessToken: string;
  private readonly sellerId: string;
  private readonly baseUrl: string;

  constructor(private readonly config: ConfigService) {
    this.accessToken = this.config.get<string>('ML_ACCESS_TOKEN', '');
    this.sellerId = this.config.get<string>('ML_SELLER_ID', '');
    this.baseUrl = this.config.get<string>('ML_API_URL', 'https://api.mercadolibre.com');
  }

  isEnabled(): boolean {
    return Boolean(this.accessToken && this.sellerId);
  }

  async publishProduct(product: MarketplaceProductInput): Promise<MarketplaceResult> {
    if (!this.isEnabled()) return this.notConfigured(product);
    // TODO: POST {baseUrl}/items com o payload de item do ML (title, price,
    // available_quantity, pictures, attributes, category_id...).
    return this.request('publishProduct', { sku: product.sku });
  }

  async updateProduct(product: MarketplaceProductInput): Promise<MarketplaceResult> {
    if (!this.isEnabled()) return this.notConfigured(product);
    // TODO: PUT {baseUrl}/items/{externalId}
    return this.request('updateProduct', { sku: product.sku });
  }

  async updateStock(ref: ProductRef, stock: number): Promise<MarketplaceResult> {
    if (!this.isEnabled()) return this.notConfigured(ref);
    // TODO: PUT {baseUrl}/items/{externalId} { available_quantity: stock }
    return this.request('updateStock', { externalId: ref.externalId, stock });
  }

  async updatePrice(ref: ProductRef, price: number): Promise<MarketplaceResult> {
    if (!this.isEnabled()) return this.notConfigured(ref);
    // TODO: PUT {baseUrl}/items/{externalId} { price }
    return this.request('updatePrice', { externalId: ref.externalId, price });
  }

  async pauseProduct(ref: ProductRef): Promise<MarketplaceResult> {
    if (!this.isEnabled()) return this.notConfigured(ref);
    // TODO: PUT {baseUrl}/items/{externalId} { status: 'paused' }
    return this.request('pauseProduct', { externalId: ref.externalId });
  }

  async removeProduct(ref: ProductRef): Promise<MarketplaceResult> {
    if (!this.isEnabled()) return this.notConfigured(ref);
    // TODO: PUT {baseUrl}/items/{externalId} { status: 'closed' } e deletar
    return this.request('removeProduct', { externalId: ref.externalId });
  }

  async getOrders(): Promise<MarketplaceOrder[]> {
    if (!this.isEnabled()) return [];
    // TODO: GET {baseUrl}/orders/search?seller={sellerId}&order.status=paid
    return [];
  }

  async handleWebhook(payload: unknown): Promise<MarketplaceWebhookResult> {
    // ML envia notificações com { topic, resource }. O processamento real
    // (buscar o recurso pela API e converter em pedido) será feito na fila.
    const topic =
      typeof payload === 'object' && payload !== null && 'topic' in payload
        ? String((payload as { topic: unknown }).topic)
        : undefined;
    this.logger.log(`Webhook ML recebido topic=${topic ?? 'desconhecido'}`);
    return { received: true, eventType: topic };
  }

  /**
   * Ponto único de chamada à API do ML. Hoje devolve sucesso simulado para não
   * bloquear o fluxo; quando as credenciais existirem, basta implementar o fetch
   * autenticado aqui (Authorization: Bearer {accessToken}).
   */
  private async request(operation: string, meta: unknown): Promise<MarketplaceResult> {
    this.logger.warn(`ML.${operation}: chamada real ainda não implementada — retornando stub`);
    return {
      ok: false,
      payloadSent: meta,
      error: `ML.${operation} não implementado (integração pendente)`,
    };
  }

  private notConfigured(meta: unknown): MarketplaceResult {
    return {
      ok: false,
      payloadSent: meta,
      error: 'Mercado Livre não configurado (ML_ACCESS_TOKEN/ML_SELLER_ID ausentes)',
    };
  }
}
