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
import { MlTokenService } from './ml-token.service';
import { MlAttribute, MlCatalogService } from './ml-catalog.service';
import { MlOrderImportService } from './ml-order-import.service';

type HttpMethod = 'GET' | 'POST' | 'PUT';

interface MlResponse<T> {
  ok: boolean;
  status: number;
  data?: T;
  error?: string;
}

interface MlItemResponse {
  id: string;
  permalink?: string;
}

/** Erro no formato da API do ML: { message, error, cause: [{ code, message }] }. */
interface MlError {
  message?: string;
  error?: string;
  cause?: Array<{ code?: string; message?: string }>;
}

@Injectable()
export class MercadoLivreProvider implements MarketplaceProvider {
  readonly marketplace = Marketplace.MERCADO_LIVRE;
  private readonly logger = new Logger(MercadoLivreProvider.name);

  private readonly sellerId: string;
  private readonly baseUrl: string;
  private readonly listingTypeId: string;
  private readonly shippingMode: string;
  private readonly freeShipping: boolean;
  private readonly currencyId: string;

  constructor(
    private readonly config: ConfigService,
    private readonly tokenService: MlTokenService,
    private readonly catalog: MlCatalogService,
    private readonly importer: MlOrderImportService,
  ) {
    this.sellerId = this.config.get<string>('ML_SELLER_ID', '');
    this.baseUrl = this.config.get<string>('ML_API_URL', 'https://api.mercadolibre.com');
    this.listingTypeId = this.config.get<string>('ML_LISTING_TYPE_ID', 'gold_special');
    this.shippingMode = this.config.get<string>('ML_SHIPPING_MODE', 'me2');
    this.freeShipping = this.config.get<string>('ML_FREE_SHIPPING', 'false') === 'true';
    this.currencyId = this.config.get<string>('ML_CURRENCY_ID', 'BRL');
  }

  isEnabled(): boolean {
    return this.tokenService.isConfigured() && Boolean(this.sellerId);
  }

  async publishProduct(input: MarketplaceProductInput): Promise<MarketplaceResult> {
    if (!this.isEnabled()) return this.notConfigured(input);

    const guard = this.validateForPublish(input);
    if (guard) return guard;

    const { categoryId, predicted } = await this.catalog.predict(input.name);
    if (!categoryId) {
      return {
        ok: false,
        payloadSent: { title: input.name },
        error:
          'ML: não foi possível determinar a categoria do anúncio (category predictor sem resultado). Revise o título do produto.',
      };
    }

    const attributes = await this.catalog.buildAttributes(categoryId, input, predicted);
    let body: Record<string, unknown> = this.buildItemBody(input, categoryId, attributes);

    let res = await this.ml<MlItemResponse>('POST', '/items', body);
    // Categorias de catálogo exigem `family_name` no lugar de `title`. Quando o ML
    // sinaliza isso, refazemos a publicação no formato família automaticamente.
    if (!res.ok && this.needsFamilyName(res.data)) {
      body = { ...body, family_name: input.name.slice(0, 60) };
      delete body.title;
      res = await this.ml<MlItemResponse>('POST', '/items', body);
    }
    if (!res.ok || !res.data?.id) {
      return { ok: false, payloadSent: body, responseReceived: res.data, error: res.error };
    }

    const externalId = res.data.id;
    await this.setDescription(externalId, input.description);
    this.logger.log(`ML: item ${externalId} publicado (sku=${input.sku})`);
    return { ok: true, externalId, payloadSent: body, responseReceived: res.data };
  }

  async updateProduct(input: MarketplaceProductInput): Promise<MarketplaceResult> {
    if (!this.isEnabled()) return this.notConfigured(input);
    const itemId = input.externalId;
    if (!itemId) return this.missingExternalId(input.sku);

    // Não atualizamos `title`: em categorias de catálogo o título é gerido pela
    // família e o ML rejeita a alteração. Preço/estoque/fotos valem para ambos.
    const body = {
      price: input.salePrice ?? input.price,
      available_quantity: this.quantity(input),
      pictures: input.images.map((source) => ({ source })),
    };
    const res = await this.ml<MlItemResponse>('PUT', `/items/${itemId}`, body);
    if (res.ok) await this.setDescription(itemId, input.description);
    return this.toResult(res, itemId, body);
  }

  async updateStock(ref: ProductRef, stock: number): Promise<MarketplaceResult> {
    if (!this.isEnabled()) return this.notConfigured(ref);
    if (!ref.externalId) return this.missingExternalId();
    const body = { available_quantity: Math.max(0, stock) };
    const res = await this.ml<MlItemResponse>('PUT', `/items/${ref.externalId}`, body);
    return this.toResult(res, ref.externalId, body);
  }

  async updatePrice(ref: ProductRef, price: number): Promise<MarketplaceResult> {
    if (!this.isEnabled()) return this.notConfigured(ref);
    if (!ref.externalId) return this.missingExternalId();
    const body = { price };
    const res = await this.ml<MlItemResponse>('PUT', `/items/${ref.externalId}`, body);
    return this.toResult(res, ref.externalId, body);
  }

  async pauseProduct(ref: ProductRef): Promise<MarketplaceResult> {
    if (!this.isEnabled()) return this.notConfigured(ref);
    if (!ref.externalId) return this.missingExternalId();
    const body = { status: 'paused' };
    const res = await this.ml<MlItemResponse>('PUT', `/items/${ref.externalId}`, body);
    return this.toResult(res, ref.externalId, body);
  }

  async removeProduct(ref: ProductRef): Promise<MarketplaceResult> {
    if (!this.isEnabled()) return this.notConfigured(ref);
    if (!ref.externalId) return this.missingExternalId();
    // ML não permite DELETE: pausa e em seguida fecha o anúncio (estado final).
    await this.ml<MlItemResponse>('PUT', `/items/${ref.externalId}`, { status: 'paused' });
    const body = { status: 'closed' };
    const res = await this.ml<MlItemResponse>('PUT', `/items/${ref.externalId}`, body);
    return this.toResult(res, ref.externalId, body);
  }

  async getOrders(): Promise<MarketplaceOrder[]> {
    if (!this.isEnabled()) return [];
    const res = await this.ml<{ results?: Array<Record<string, unknown>> }>(
      'GET',
      `/orders/search?seller=${this.sellerId}&order.status=paid&sort=date_desc&limit=25`,
    );
    if (!res.ok || !res.data?.results) return [];
    return res.data.results.map((o) => ({
      externalId: String(o.id),
      status: typeof o.status === 'string' ? o.status : undefined,
      total: typeof o.total_amount === 'number' ? o.total_amount : undefined,
      buyerName:
        typeof o.buyer === 'object' && o.buyer
          ? String((o.buyer as { nickname?: string }).nickname ?? '')
          : undefined,
      raw: o,
    }));
  }

  /**
   * Webhook do ML: roteia por tópico. Pedidos pagos viram pedidos internos
   * (importer); envios atualizam rastreio/estado. Erros transitórios propagam
   * para a fila reprocessar; nada além de orders/shipments é tratado aqui.
   */
  async handleWebhook(payload: unknown): Promise<MarketplaceWebhookResult> {
    const { topic, resource } = parseNotification(payload);
    this.logger.log(`Webhook ML topic=${topic ?? '?'} resource=${resource ?? '?'}`);

    const externalId = lastPathSegment(resource);
    if (externalId && isOrderTopic(topic, resource)) {
      const result = await this.importer.importByOrderId(externalId);
      if (!result.imported && result.reason) {
        this.logger.log(`Webhook ML order ${externalId}: ${result.reason}`);
      }
    } else if (externalId && isShipmentTopic(topic, resource)) {
      await this.importer.syncShipmentById(externalId);
    }
    return { received: true, eventType: topic };
  }

  // ── Construção do payload ──────────────────────────────────────────────────

  private buildItemBody(
    input: MarketplaceProductInput,
    categoryId: string,
    attributes: MlAttribute[],
  ) {
    return {
      title: input.name.slice(0, 60),
      category_id: categoryId,
      price: input.salePrice ?? input.price,
      currency_id: this.currencyId,
      available_quantity: this.quantity(input),
      buying_mode: 'buy_it_now',
      condition: input.condition === 'used' ? 'used' : 'new',
      listing_type_id: this.listingTypeId,
      status: 'active',
      pictures: input.images.map((source) => ({ source })),
      attributes,
      shipping: {
        mode: this.shippingMode,
        local_pick_up: false,
        free_shipping: this.freeShipping,
      },
    };
  }

  private quantity(input: MarketplaceProductInput): number {
    return input.isUnique ? 1 : input.stock;
  }

  private async setDescription(itemId: string, description?: string | null): Promise<void> {
    const plain = description?.trim();
    if (!plain) return;
    const res = await this.ml('POST', `/items/${itemId}/description`, { plain_text: plain });
    if (!res.ok) {
      this.logger.warn(`ML: falha ao definir descrição do item ${itemId}: ${res.error}`);
    }
  }

  private validateForPublish(input: MarketplaceProductInput): MarketplaceResult | null {
    if (!input.images.length) {
      return {
        ok: false,
        payloadSent: { sku: input.sku },
        error: 'ML: produto sem imagens — o Mercado Livre exige ao menos 1 foto.',
      };
    }
    if (this.quantity(input) < 1) {
      return {
        ok: false,
        payloadSent: { sku: input.sku },
        error: 'ML: estoque zero — a quantidade disponível deve ser ≥ 1 para publicar.',
      };
    }
    return null;
  }

  // ── Camada HTTP autenticada ────────────────────────────────────────────────

  private async ml<T>(method: HttpMethod, path: string, body?: unknown): Promise<MlResponse<T>> {
    const token = await this.tokenService.getToken();
    if (!token) return { ok: false, status: 0, error: 'ML: token de acesso indisponível' };

    let res = await this.fetchMl(method, path, token, body);
    // 401 → o token pode ter sido revogado antes do vencimento; tenta renovar 1x.
    if (res.status === 401) {
      const refreshed = await this.tokenService.refreshToken().catch(() => null);
      if (refreshed) res = await this.fetchMl(method, path, refreshed, body);
    }

    const data = (await res.json().catch(() => undefined)) as T | MlError | undefined;
    if (!res.ok) {
      const msg = this.extractError(data as MlError) ?? `HTTP ${res.status}`;
      return {
        ok: false,
        status: res.status,
        data: data as T,
        error: `ML.${method} ${path}: ${msg}`,
      };
    }
    return { ok: true, status: res.status, data: data as T };
  }

  private fetchMl(method: HttpMethod, path: string, token: string, body?: unknown) {
    return fetch(`${this.baseUrl}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  }

  private extractError(data?: MlError): string | undefined {
    if (!data) return undefined;
    const causes = data.cause?.map((c) => c.message).filter(Boolean);
    if (causes?.length) return causes.join('; ');
    return data.message ?? data.error;
  }

  /** Detecta o erro do ML que pede `family_name` (categorias de catálogo). */
  private needsFamilyName(data: unknown): boolean {
    try {
      return JSON.stringify(data ?? '').includes('family_name');
    } catch {
      return false;
    }
  }

  // ── Helpers de resultado ───────────────────────────────────────────────────

  private toResult(
    res: MlResponse<MlItemResponse>,
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
      error: 'ML: anúncio sem externalId — publique o produto antes de sincronizar.',
    };
  }

  private notConfigured(meta: unknown): MarketplaceResult {
    return {
      ok: false,
      payloadSent: meta,
      error: 'Mercado Livre não configurado (ML_CLIENT_ID/SECRET/TOKEN/ML_SELLER_ID ausentes)',
    };
  }
}

/** Extrai topic/resource de uma notificação do ML (formato pode variar). */
function parseNotification(payload: unknown): { topic?: string; resource?: string } {
  if (typeof payload !== 'object' || payload === null) return {};
  const p = payload as Record<string, unknown>;
  const topic = typeof p.topic === 'string' ? p.topic : undefined;
  const resource = typeof p.resource === 'string' ? p.resource : undefined;
  return { topic, resource };
}

function lastPathSegment(resource?: string): string | null {
  if (!resource) return null;
  const parts = resource.split('/').filter(Boolean);
  const last = parts[parts.length - 1];
  return last && /^\d+$/.test(last) ? last : (last ?? null);
}

function isOrderTopic(topic?: string, resource?: string): boolean {
  return Boolean(topic?.includes('order') || resource?.includes('/orders/'));
}

function isShipmentTopic(topic?: string, resource?: string): boolean {
  return Boolean(topic?.includes('shipment') || resource?.includes('/shipments/'));
}
