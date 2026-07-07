import { Injectable, Logger } from '@nestjs/common';
import { MarketplaceProductInput } from './marketplace-provider.interface';
import { ShopeeTokenService } from './shopee-token.service';

/** Atributo no formato aceito pelo POST /api/v2/product/add_item da Shopee. */
export interface ShopeeAttribute {
  attribute_id: number;
  attribute_value_list: Array<{ value_id?: number; original_value_name?: string }>;
}

interface ShopeeAttributeValue {
  value_id?: number;
  original_value_name?: string;
}

interface ShopeeAttributeMeta {
  attribute_id: number;
  original_attribute_name?: string;
  is_mandatory?: boolean;
  input_type?: string;
  format_type?: string;
  attribute_value_list?: ShopeeAttributeValue[];
}

export interface CategoryPrediction {
  categoryId: number | null;
}

/**
 * Resolve categoria e atributos obrigatórios exigidos pela Shopee ao publicar
 * um item (POST /product/add_item). Mantém o provider focado em HTTP puro —
 * mesma divisão de responsabilidade do MlCatalogService.
 */
@Injectable()
export class ShopeeCatalogService {
  private readonly logger = new Logger(ShopeeCatalogService.name);

  constructor(private readonly tokens: ShopeeTokenService) {}

  /** Sugere a categoria-folha a partir do nome do produto. */
  async predict(title: string): Promise<CategoryPrediction> {
    const data = await this.post<{ category_id?: number[] }>('/api/v2/product/category_recommend', {
      item_name: title.trim().slice(0, 120),
    });
    const categoryId = data?.category_id?.[0] ?? null;
    if (!categoryId) {
      this.logger.warn(`Shopee: category_recommend sem resultado para "${title.slice(0, 60)}"`);
    }
    return { categoryId };
  }

  /**
   * Monta a lista de atributos obrigatórios com defaults seguros: usa a marca
   * do produto quando o atributo aceita texto livre, e o primeiro valor
   * disponível (ou um que pareça "genérico") quando é uma lista fechada. Nunca
   * bloqueia a chamada — atributos que a Shopee rejeitar aparecem no erro
   * retornado ao admin, igual ao fluxo do Mercado Livre.
   */
  async buildAttributes(
    categoryId: number,
    input: MarketplaceProductInput,
  ): Promise<ShopeeAttribute[]> {
    const meta = await this.getAttributes(categoryId);
    const out: ShopeeAttribute[] = [];

    for (const attr of meta) {
      if (!attr.is_mandatory) continue;

      const values = attr.attribute_value_list ?? [];
      if (values.length === 0) {
        // Texto livre (TEXT_FIELD): usa marca > nome do produto > "Não especificado".
        const text = input.brand?.trim() || input.name.trim().slice(0, 100) || 'Não especificado';
        out.push({
          attribute_id: attr.attribute_id,
          attribute_value_list: [{ original_value_name: text }],
        });
        continue;
      }

      // Lista fechada: tenta casar com a marca informada, senão usa uma opção
      // genérica ("Outro"/"Sem marca"), senão a primeira disponível.
      const brand = input.brand?.trim().toLowerCase();
      const match =
        (brand
          ? values.find((v) => v.original_value_name?.trim().toLowerCase() === brand)
          : undefined) ??
        values.find((v) =>
          /outr[ao]s?|gen[eé]ric|sem marca|no brand/i.test(v.original_value_name ?? ''),
        ) ??
        values[0];

      if (match?.value_id !== undefined) {
        out.push({
          attribute_id: attr.attribute_id,
          attribute_value_list: [{ value_id: match.value_id }],
        });
      }
    }

    return out;
  }

  private async getAttributes(categoryId: number): Promise<ShopeeAttributeMeta[]> {
    const data = await this.get<{ attribute_list?: ShopeeAttributeMeta[] }>(
      '/api/v2/product/get_attributes',
      { category_id: String(categoryId), language: 'pt-br' },
    );
    return data?.attribute_list ?? [];
  }

  /** Canais de logística habilitados na loja (obrigatório em todo item publicado). */
  async getEnabledLogistics(): Promise<Array<{ logistic_id: number }>> {
    const data = await this.get<{
      logistic_channel_list?: Array<{ logistic_id: number; enabled: boolean }>;
    }>('/api/v2/logistics/get_channel_list', {});
    return (data?.logistic_channel_list ?? [])
      .filter((c) => c.enabled)
      .map((c) => ({ logistic_id: c.logistic_id }));
  }

  /**
   * Faz o upload de uma imagem (por URL) para o Media Space da Shopee e
   * devolve o `image_id` — a Shopee não aceita URLs diretas no add_item como o
   * Mercado Livre aceita, exige o asset já hospedado na própria plataforma.
   */
  async uploadImage(imageUrl: string): Promise<string | null> {
    const built = await this.tokens.buildAuthenticatedUrl('/api/v2/media_space/upload_image');
    if (!built) return null;
    try {
      const imgRes = await fetch(imageUrl);
      if (!imgRes.ok) return null;
      const blob = await imgRes.blob();

      const form = new FormData();
      form.append('image', blob, 'image.jpg');

      const res = await fetch(built.url, { method: 'POST', body: form });
      const data = (await res.json().catch(() => null)) as {
        response?: { image_info?: { image_id?: string } };
      } | null;
      const imageId = data?.response?.image_info?.image_id;
      if (!res.ok || !imageId) {
        this.logger.warn(`Shopee: upload de imagem falhou (${imageUrl.slice(0, 60)})`);
        return null;
      }
      return imageId;
    } catch (err) {
      this.logger.warn(`Shopee: upload de imagem falhou: ${(err as Error).message}`);
      return null;
    }
  }

  async uploadImages(imageUrls: string[]): Promise<string[]> {
    const ids: string[] = [];
    for (const url of imageUrls.slice(0, 9)) {
      const id = await this.uploadImage(url);
      if (id) ids.push(id);
    }
    return ids;
  }

  // ── HTTP autenticado (shop-level) ──────────────────────────────────────────

  private async get<T>(path: string, params: Record<string, string>): Promise<T | null> {
    const built = await this.tokens.buildAuthenticatedUrl(path, params);
    if (!built) return null;
    try {
      const res = await fetch(built.url);
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        this.logger.warn(`Shopee GET ${path}: HTTP ${res.status}`);
        return null;
      }
      return unwrap<T>(data);
    } catch (err) {
      this.logger.warn(`Shopee GET ${path} falhou: ${(err as Error).message}`);
      return null;
    }
  }

  private async post<T>(path: string, body: unknown): Promise<T | null> {
    const built = await this.tokens.buildAuthenticatedUrl(path);
    if (!built) return null;
    try {
      const res = await fetch(built.url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        this.logger.warn(`Shopee POST ${path}: HTTP ${res.status}`);
        return null;
      }
      return unwrap<T>(data);
    } catch (err) {
      this.logger.warn(`Shopee POST ${path} falhou: ${(err as Error).message}`);
      return null;
    }
  }
}

/** A API v2 da Shopee aninha o payload de sucesso em `response`. */
function unwrap<T>(data: unknown): T | null {
  if (data && typeof data === 'object' && 'response' in data) {
    return (data as { response: T }).response;
  }
  return data as T | null;
}
