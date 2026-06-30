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
 * Provider da Shopee — ESTRUTURA PREPARADA.
 *
 * A API da Shopee (Open Platform) exige partner_id, partner_key e shop_id com
 * assinatura HMAC por requisição. Sem essas credenciais, `isEnabled()` é false e
 * as operações retornam falha controlada — o Hub registra o erro e o site segue
 * funcionando. Pontos de integração reais marcados com TODO em `request()`.
 */
@Injectable()
export class ShopeeProvider implements MarketplaceProvider {
  readonly marketplace = Marketplace.SHOPEE;
  private readonly logger = new Logger(ShopeeProvider.name);

  private readonly partnerId: string;
  private readonly partnerKey: string;
  private readonly shopId: string;
  private readonly baseUrl: string;

  constructor(private readonly config: ConfigService) {
    this.partnerId = this.config.get<string>('SHOPEE_PARTNER_ID', '');
    this.partnerKey = this.config.get<string>('SHOPEE_PARTNER_KEY', '');
    this.shopId = this.config.get<string>('SHOPEE_SHOP_ID', '');
    this.baseUrl = this.config.get<string>('SHOPEE_API_URL', 'https://partner.shopeemobile.com');
  }

  isEnabled(): boolean {
    return Boolean(this.partnerId && this.partnerKey && this.shopId);
  }

  async publishProduct(product: MarketplaceProductInput): Promise<MarketplaceResult> {
    if (!this.isEnabled()) return this.notConfigured(product);
    // TODO: POST {baseUrl}/api/v2/product/add_item
    return this.request('publishProduct', { sku: product.sku });
  }

  async updateProduct(product: MarketplaceProductInput): Promise<MarketplaceResult> {
    if (!this.isEnabled()) return this.notConfigured(product);
    // TODO: POST {baseUrl}/api/v2/product/update_item
    return this.request('updateProduct', { sku: product.sku });
  }

  async updateStock(ref: ProductRef, stock: number): Promise<MarketplaceResult> {
    if (!this.isEnabled()) return this.notConfigured(ref);
    // TODO: POST {baseUrl}/api/v2/product/update_stock
    return this.request('updateStock', { externalId: ref.externalId, stock });
  }

  async updatePrice(ref: ProductRef, price: number): Promise<MarketplaceResult> {
    if (!this.isEnabled()) return this.notConfigured(ref);
    // TODO: POST {baseUrl}/api/v2/product/update_price
    return this.request('updatePrice', { externalId: ref.externalId, price });
  }

  async pauseProduct(ref: ProductRef): Promise<MarketplaceResult> {
    if (!this.isEnabled()) return this.notConfigured(ref);
    // TODO: POST {baseUrl}/api/v2/product/unlist_item { unlist: true }
    return this.request('pauseProduct', { externalId: ref.externalId });
  }

  async removeProduct(ref: ProductRef): Promise<MarketplaceResult> {
    if (!this.isEnabled()) return this.notConfigured(ref);
    // TODO: POST {baseUrl}/api/v2/product/delete_item
    return this.request('removeProduct', { externalId: ref.externalId });
  }

  async getOrders(): Promise<MarketplaceOrder[]> {
    if (!this.isEnabled()) return [];
    // TODO: GET {baseUrl}/api/v2/order/get_order_list
    return [];
  }

  async handleWebhook(payload: unknown): Promise<MarketplaceWebhookResult> {
    // Shopee envia { code, shop_id, data }. O `code` identifica o tipo de evento.
    const code =
      typeof payload === 'object' && payload !== null && 'code' in payload
        ? String((payload as { code: unknown }).code)
        : undefined;
    this.logger.log(`Webhook Shopee recebido code=${code ?? 'desconhecido'}`);
    return { received: true, eventType: code };
  }

  /**
   * Ponto único de chamada à API da Shopee. Quando as credenciais existirem,
   * implementar aqui a assinatura HMAC-SHA256 (partner_id + path + timestamp +
   * access_token + shop_id) exigida pela Open Platform.
   */
  private async request(operation: string, meta: unknown): Promise<MarketplaceResult> {
    this.logger.warn(`Shopee.${operation}: chamada real ainda não implementada — retornando stub`);
    return {
      ok: false,
      payloadSent: meta,
      error: `Shopee.${operation} não implementado (integração pendente)`,
    };
  }

  private notConfigured(meta: unknown): MarketplaceResult {
    return {
      ok: false,
      payloadSent: meta,
      error: 'Shopee não configurada (SHOPEE_PARTNER_ID/PARTNER_KEY/SHOP_ID ausentes)',
    };
  }
}
