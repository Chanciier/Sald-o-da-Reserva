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
import { ShopeeTokenService } from './shopee-token.service';
import { ShopeeAttribute, ShopeeCatalogService } from './shopee-catalog.service';
import { ShopeeOrderImportService } from './shopee-order-import.service';

interface ShopeeItemResponse {
  item_id?: number;
  error?: string;
  message?: string;
}

/**
 * Provider real da Shopee (Open Platform API v2). Só fica habilitado depois
 * que uma loja é conectada via OAuth ("Conectar Shopee" em /admin/marketplaces
 * → shopee-oauth.controller.ts) — diferente do Mercado Livre, a Shopee não
 * aceita token fixo por variável de ambiente.
 */
@Injectable()
export class ShopeeProvider implements MarketplaceProvider {
  readonly marketplace = Marketplace.SHOPEE;
  private readonly logger = new Logger(ShopeeProvider.name);

  constructor(
    private readonly tokens: ShopeeTokenService,
    private readonly catalog: ShopeeCatalogService,
    private readonly importer: ShopeeOrderImportService,
  ) {}

  isEnabled(): boolean {
    return this.tokens.isEnabledSync();
  }

  async publishProduct(input: MarketplaceProductInput): Promise<MarketplaceResult> {
    if (!this.isEnabled()) return this.notConfigured(input);

    const guard = this.validateForPublish(input);
    if (guard) return guard;

    const { categoryId } = await this.catalog.predict(input.name);
    if (!categoryId) {
      return {
        ok: false,
        payloadSent: { item_name: input.name },
        error:
          'Shopee: não foi possível determinar a categoria do anúncio (category_recommend sem resultado). Revise o título do produto.',
      };
    }

    const logistics = await this.catalog.getEnabledLogistics();
    if (!logistics.length) {
      return {
        ok: false,
        payloadSent: { item_name: input.name },
        error: 'Shopee: nenhum canal de logística habilitado na loja (configure em Seller Center).',
      };
    }

    const imageIds = await this.catalog.uploadImages(input.images);
    if (!imageIds.length) {
      return {
        ok: false,
        payloadSent: { item_name: input.name },
        error: 'Shopee: falha ao enviar as imagens do produto (upload_image).',
      };
    }

    const attributes = await this.catalog.buildAttributes(categoryId, input);
    const body = this.buildItemBody(input, categoryId, attributes, logistics, imageIds);

    const res = await this.post<ShopeeItemResponse>('/api/v2/product/add_item', body);
    if (!res.ok || !res.data?.item_id) {
      return { ok: false, payloadSent: body, responseReceived: res.data, error: res.error };
    }

    const externalId = String(res.data.item_id);
    this.logger.log(`Shopee: item ${externalId} publicado (sku=${input.sku})`);
    return { ok: true, externalId, payloadSent: body, responseReceived: res.data };
  }

  async updateProduct(input: MarketplaceProductInput): Promise<MarketplaceResult> {
    if (!this.isEnabled()) return this.notConfigured(input);
    const itemId = input.externalId;
    if (!itemId) return this.missingExternalId(input.sku);

    const body = {
      item_id: Number(itemId),
      item_name: input.name.slice(0, 120),
      description: (input.description ?? input.name).slice(0, 3000),
      weight: input.weight ?? 0.3,
      dimension: this.dimension(input),
    };
    const res = await this.post<ShopeeItemResponse>('/api/v2/product/update_item', body);
    if (!res.ok) return this.toResult(res, itemId, body);

    const ref: ProductRef = { productId: input.id, externalId: itemId };
    await this.updatePrice(ref, input.salePrice ?? input.price);
    await this.updateStock(ref, this.quantity(input));
    return this.toResult(res, itemId, body);
  }

  async updateStock(ref: ProductRef, stock: number): Promise<MarketplaceResult> {
    if (!this.isEnabled()) return this.notConfigured(ref);
    if (!ref.externalId) return this.missingExternalId();
    const body = {
      item_id: Number(ref.externalId),
      stock_list: [{ model_id: 0, seller_stock: [{ stock: Math.max(0, stock) }] }],
    };
    const res = await this.post('/api/v2/product/update_stock', body);
    return this.toResult(res, ref.externalId, body);
  }

  async updatePrice(ref: ProductRef, price: number): Promise<MarketplaceResult> {
    if (!this.isEnabled()) return this.notConfigured(ref);
    if (!ref.externalId) return this.missingExternalId();
    const body = {
      item_id: Number(ref.externalId),
      price_list: [{ model_id: 0, original_price: price }],
    };
    const res = await this.post('/api/v2/product/update_price', body);
    return this.toResult(res, ref.externalId, body);
  }

  async pauseProduct(ref: ProductRef): Promise<MarketplaceResult> {
    if (!this.isEnabled()) return this.notConfigured(ref);
    if (!ref.externalId) return this.missingExternalId();
    const body = { item_list: [{ item_id: Number(ref.externalId), unlist: true }] };
    const res = await this.post('/api/v2/product/unlist_item', body);
    return this.toResult(res, ref.externalId, body);
  }

  async removeProduct(ref: ProductRef): Promise<MarketplaceResult> {
    if (!this.isEnabled()) return this.notConfigured(ref);
    if (!ref.externalId) return this.missingExternalId();
    // A Shopee não tem um estado "fechado" reaproveitável como o ML — remover
    // de fato exclui o anúncio (delete_item), estado final igual ao REMOVED local.
    const body = { item_id: Number(ref.externalId) };
    const res = await this.post('/api/v2/product/delete_item', body);
    return this.toResult(res, ref.externalId, body);
  }

  async getOrders(): Promise<MarketplaceOrder[]> {
    if (!this.isEnabled()) return [];
    const now = Math.floor(Date.now() / 1000);
    const res = await this.get<{ order_list?: Array<{ order_sn: string; order_status?: string }> }>(
      '/api/v2/order/get_order_list',
      {
        time_range_field: 'create_time',
        time_from: String(now - 24 * 60 * 60),
        time_to: String(now),
        page_size: '25',
      },
    );
    if (!res.ok || !res.data?.order_list) return [];
    return res.data.order_list.map((o) => ({
      externalId: o.order_sn,
      status: o.order_status,
      raw: o,
    }));
  }

  /**
   * Webhook da Shopee: `{ code, shop_id, data }`. code=3 é push de status de
   * pedido — delega ao importer, que refaz a busca autenticada antes de criar
   * qualquer coisa (o payload do push nunca é usado como fonte de verdade).
   */
  async handleWebhook(payload: unknown): Promise<MarketplaceWebhookResult> {
    const { code, orderSn } = parsePush(payload);
    this.logger.log(`Webhook Shopee code=${code ?? '?'} order_sn=${orderSn ?? '?'}`);

    if (code === 3 && orderSn) {
      const result = await this.importer.importByOrderSn(orderSn);
      if (!result.imported && result.reason) {
        this.logger.log(`Webhook Shopee pedido ${orderSn}: ${result.reason}`);
      }
    }
    return { received: true, eventType: code !== undefined ? String(code) : undefined };
  }

  // ── Construção do payload ──────────────────────────────────────────────────

  private buildItemBody(
    input: MarketplaceProductInput,
    categoryId: number,
    attributes: ShopeeAttribute[],
    logistics: Array<{ logistic_id: number }>,
    imageIds: string[],
  ) {
    return {
      item_name: input.name.slice(0, 120),
      description: (input.description ?? input.name).slice(0, 3000),
      category_id: categoryId,
      original_price: input.salePrice ?? input.price,
      seller_stock: [{ stock: this.quantity(input) }],
      weight: input.weight ?? 0.3,
      dimension: this.dimension(input),
      logistic_info: logistics.map((l) => ({ logistic_id: l.logistic_id, enabled: true })),
      attribute_list: attributes,
      image: { image_id_list: imageIds },
      item_sku: input.sku,
      brand: { brand_id: 0, original_brand_name: (input.brand ?? 'No Brand').slice(0, 50) },
    };
  }

  private dimension(input: MarketplaceProductInput) {
    const d = (input.dimensions as Record<string, number> | null) ?? {};
    return {
      package_length: Math.max(1, Math.round(d.length ?? 20)),
      package_width: Math.max(1, Math.round(d.width ?? 15)),
      package_height: Math.max(1, Math.round(d.height ?? 10)),
    };
  }

  private quantity(input: MarketplaceProductInput): number {
    return input.isUnique ? 1 : input.stock;
  }

  private validateForPublish(input: MarketplaceProductInput): MarketplaceResult | null {
    if (!input.images.length) {
      return {
        ok: false,
        payloadSent: { sku: input.sku },
        error: 'Shopee: produto sem imagens — a Shopee exige ao menos 1 foto.',
      };
    }
    if (this.quantity(input) < 1) {
      return {
        ok: false,
        payloadSent: { sku: input.sku },
        error: 'Shopee: estoque zero — a quantidade disponível deve ser ≥ 1 para publicar.',
      };
    }
    return null;
  }

  // ── Camada HTTP autenticada ────────────────────────────────────────────────

  private async post<T = unknown>(
    path: string,
    body: unknown,
  ): Promise<{ ok: boolean; data?: T; error?: string }> {
    const built = await this.tokens.buildAuthenticatedUrl(path);
    if (!built) return { ok: false, error: 'Shopee: token de acesso indisponível' };

    const res = await fetch(built.url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const raw = (await res.json().catch(() => undefined)) as
      | { response?: T; error?: string; message?: string }
      | undefined;
    const data = raw?.response ?? (raw as T | undefined);
    if (!res.ok || raw?.error) {
      return {
        ok: false,
        data,
        error: `Shopee.${path}: ${raw?.message ?? raw?.error ?? `HTTP ${res.status}`}`,
      };
    }
    return { ok: true, data };
  }

  private async get<T = unknown>(
    path: string,
    params: Record<string, string>,
  ): Promise<{ ok: boolean; data?: T; error?: string }> {
    const built = await this.tokens.buildAuthenticatedUrl(path, params);
    if (!built) return { ok: false, error: 'Shopee: token de acesso indisponível' };

    const res = await fetch(built.url);
    const raw = (await res.json().catch(() => undefined)) as
      | { response?: T; error?: string; message?: string }
      | undefined;
    const data = raw?.response ?? (raw as T | undefined);
    if (!res.ok || raw?.error) {
      return {
        ok: false,
        data,
        error: `Shopee.${path}: ${raw?.message ?? raw?.error ?? `HTTP ${res.status}`}`,
      };
    }
    return { ok: true, data };
  }

  // ── Helpers de resultado ───────────────────────────────────────────────────

  private toResult(
    res: { ok: boolean; data?: unknown; error?: string },
    externalId: string,
    body: unknown,
  ): MarketplaceResult {
    return res.ok
      ? { ok: true, externalId, payloadSent: body, responseReceived: res.data }
      : { ok: false, externalId, payloadSent: body, responseReceived: res.data, error: res.error };
  }

  private missingExternalId(sku?: string): MarketplaceResult {
    return {
      ok: false,
      payloadSent: sku ? { sku } : undefined,
      error: 'Shopee: anúncio sem externalId — publique o produto antes de sincronizar.',
    };
  }

  private notConfigured(meta: unknown): MarketplaceResult {
    return {
      ok: false,
      payloadSent: meta,
      error:
        'Shopee não conectada (configure SHOPEE_PARTNER_ID/SHOPEE_PARTNER_KEY e clique em "Conectar Shopee" em /admin/marketplaces)',
    };
  }
}

/** Extrai code/order_sn de uma notificação push da Shopee (formato pode variar por evento). */
function parsePush(payload: unknown): { code?: number; orderSn?: string } {
  if (typeof payload !== 'object' || payload === null) return {};
  const p = payload as Record<string, unknown>;
  const code = typeof p.code === 'number' ? p.code : undefined;
  const data = (p.data ?? {}) as Record<string, unknown>;
  const orderSn =
    (typeof data.ordersn === 'string' && data.ordersn) ||
    (typeof data.order_sn === 'string' && data.order_sn) ||
    undefined;
  return { code, orderSn: orderSn || undefined };
}
