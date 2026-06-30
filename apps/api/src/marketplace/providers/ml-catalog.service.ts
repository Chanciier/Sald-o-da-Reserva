import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MarketplaceProductInput } from './marketplace-provider.interface';
import { MlTokenService } from './ml-token.service';

/** Atributo no formato aceito pelo POST /items do Mercado Livre. */
export interface MlAttribute {
  id: string;
  value_id?: string;
  value_name?: string;
}

interface CategoryAttribute {
  id: string;
  name?: string;
  value_type?: string;
  tags?: Record<string, boolean>;
  values?: Array<{ id: string; name: string }>;
}

interface DomainDiscoveryResult {
  category_id?: string;
  category_name?: string;
  attributes?: Array<{ id: string; value_id?: string; value_name?: string }>;
}

export interface CategoryPrediction {
  categoryId: string | null;
  /** Atributos inferidos do título pelo próprio ML (já validados). */
  predicted: MlAttribute[];
}

/**
 * Resolve os dados que o Mercado Livre exige além do snapshot neutro do produto:
 * a categoria-folha (via domain predictor) e os atributos obrigatórios (marca,
 * modelo, GTIN, booleanos…). Mantém o provider focado em HTTP/orquestração.
 */
@Injectable()
export class MlCatalogService {
  private readonly logger = new Logger(MlCatalogService.name);
  private readonly baseUrl: string;
  private readonly siteId: string;

  constructor(
    private readonly config: ConfigService,
    private readonly tokenService: MlTokenService,
  ) {
    this.baseUrl = this.config.get<string>('ML_API_URL', 'https://api.mercadolibre.com');
    this.siteId = this.config.get<string>('ML_SITE_ID', 'MLB');
  }

  /**
   * Descobre a categoria-folha do ML a partir do título e devolve também os
   * atributos que o ML conseguiu inferir do texto (já com value_id válido).
   */
  async predict(title: string): Promise<CategoryPrediction> {
    const q = encodeURIComponent(title.trim().slice(0, 120));
    const results = await this.get<DomainDiscoveryResult[]>(
      `/sites/${this.siteId}/domain_discovery/search?limit=1&q=${q}`,
    );
    const top = results?.[0];
    if (!top?.category_id) {
      this.logger.warn(`ML: domain_discovery sem categoria para "${title.slice(0, 60)}"`);
      return { categoryId: null, predicted: [] };
    }
    const predicted = (top.attributes ?? [])
      .filter((a) => a.id && (a.value_id || a.value_name))
      .map((a) => ({ id: a.id, value_id: a.value_id, value_name: a.value_name }));
    return { categoryId: top.category_id, predicted };
  }

  /**
   * Monta os atributos do anúncio combinando: (1) o que o ML inferiu do título,
   * (2) marca/modelo/GTIN derivados do produto e (3) defaults seguros para os
   * obrigatórios restantes — booleano → "Não", texto livre → "Não especificado".
   * Nunca forja GTIN (código de barras incorreto causaria penalidade no ML).
   */
  async buildAttributes(
    categoryId: string,
    input: MarketplaceProductInput,
    predicted: MlAttribute[],
  ): Promise<MlAttribute[]> {
    const meta = await this.getCategoryAttributes(categoryId);
    const byId = new Map(meta.map((a) => [a.id, a]));
    const out = new Map<string, MlAttribute>();

    // 1. Atributos inferidos do título (já validados pelo ML).
    for (const p of predicted) out.set(p.id, p);

    // 2. Marca.
    if (!out.has('BRAND')) {
      const brand = input.brand?.trim();
      if (brand) out.set('BRAND', { id: 'BRAND', value_name: brand });
      else if (byId.get('BRAND')?.tags?.required)
        out.set('BRAND', { id: 'BRAND', value_name: 'Genérica' });
    }

    // 3. Modelo (quando exigido e não inferido): usa o nome do produto.
    if (!out.has('MODEL') && byId.get('MODEL')?.tags?.required) {
      out.set('MODEL', { id: 'MODEL', value_name: input.name.slice(0, 100) });
    }

    // 4. GTIN apenas quando informado pelo admin.
    const gtin = input.gtin?.trim();
    if (gtin && !out.has('GTIN')) out.set('GTIN', { id: 'GTIN', value_name: gtin });

    // 5. Defaults seguros para os obrigatórios que sobraram.
    for (const a of meta) {
      if (!a.tags?.required || out.has(a.id) || a.id === 'GTIN') continue;
      if (a.value_type === 'boolean') {
        const negative = a.values?.find((v) => /^n[aã]o$/i.test(v.name)) ?? a.values?.[0];
        if (negative) out.set(a.id, { id: a.id, value_id: negative.id });
      } else if (a.value_type === 'string') {
        out.set(a.id, { id: a.id, value_name: 'Não especificado' });
      }
      // list/number obrigatórios sem valor: deixamos o ML reportar claramente.
    }

    return [...out.values()];
  }

  private async getCategoryAttributes(categoryId: string): Promise<CategoryAttribute[]> {
    return (await this.get<CategoryAttribute[]>(`/categories/${categoryId}/attributes`)) ?? [];
  }

  private async get<T>(path: string): Promise<T | null> {
    try {
      const token = await this.tokenService.getToken();
      const res = await fetch(`${this.baseUrl}${path}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) {
        this.logger.warn(`ML GET ${path.split('?')[0]}: HTTP ${res.status}`);
        return null;
      }
      return (await res.json()) as T;
    } catch (err) {
      this.logger.warn(`ML GET ${path.split('?')[0]} falhou: ${(err as Error).message}`);
      return null;
    }
  }
}
