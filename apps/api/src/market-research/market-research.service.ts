import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { createHash } from 'crypto';
import { AnthropicService } from '../anthropic/anthropic.service';
import { extractJsonObject } from '../common/json-extract';
import { toNumberOrNull, toStringOrNull } from '../common/normalize';
import { QueueService } from '../queue/queue.service';
import { RedisService } from '../redis/redis.service';
import {
  ListingCondition,
  MARKETPLACE_SOURCES,
  MarketListing,
  MarketResearchData,
  MarketResearchInput,
  MarketResearchJob,
  MarketResearchJobData,
  MarketplacePriceStats,
  MarketplaceSource,
} from './market-research.types';

/** Nome da fila de background da pesquisa de mercado. */
const QUEUE_NAME = 'market-research.run';
/** Prefixo das chaves de cache/estado no Redis. */
const CACHE_PREFIX = 'market-research:';
/** TTL do resultado pronto (12h) — preços mudam, mas não a cada minuto. */
const READY_TTL_SECONDS = 12 * 60 * 60;
/** TTL do estado PENDING (10min) — se travar, permite reprocessar depois. */
const PENDING_TTL_SECONDS = 10 * 60;
/** Domínios permitidos na busca (foco em ML + Shopee Brasil). */
const ALLOWED_DOMAINS = ['mercadolivre.com.br', 'shopee.com.br'];
/** Máximo de anúncios retornados/considerados. */
const MAX_LISTINGS = 40;
/**
 * Mínimo de anúncios com preço na MESMA condição (novo/usado) do produto para
 * que as estatísticas usem só eles. Abaixo disso, a amostra é pequena demais e
 * é melhor agregar tudo do que confiar em 1-2 preços.
 */
const MIN_CONDITION_MATCHES = 3;
/**
 * Poda de outliers: com 4+ preços, descarta os que fogem da faixa
 * [median×MIN_RATIO, median×MAX_RATIO]. Acessório barato ou lote caro que o
 * modelo deixou passar não pode puxar a média — a faixa é larga o bastante
 * para variação legítima do mesmo produto.
 */
const OUTLIER_MIN_SAMPLE = 4;
const OUTLIER_MIN_RATIO = 0.35;
const OUTLIER_MAX_RATIO = 3;

const HERMES_PROMPT = (query: string, input: MarketResearchInput) => {
  const facts = [
    input.brand ? `- Marca: ${input.brand}` : null,
    input.model ? `- Modelo: ${input.model}` : null,
    input.category ? `- Tipo de produto: ${input.category}` : null,
    input.condition
      ? `- Condição do nosso produto: ${input.condition === 'NOVO' ? 'novo' : 'usado'}`
      : null,
  ]
    .filter((f): f is string => f !== null)
    .join('\n');

  return `Você é o "Hermes", um agente de pesquisa de mercado para uma loja de liquidação no Brasil.
Pesquise na web anúncios ATIVOS do seguinte produto no Mercado Livre (mercadolivre.com.br) e na Shopee (shopee.com.br):

"${query}"
${facts ? `\nDados confirmados do produto (use para validar cada anúncio antes de incluí-lo):\n${facts}\n` : ''}
Use a ferramenta de busca para encontrar anúncios reais desse produto nesses dois marketplaces. Considere apenas anúncios com preço em reais (BRL) visível.

Retorne APENAS um objeto JSON válido, sem texto adicional, com EXATAMENTE estas chaves:

{
  "anuncios": [
    { "marketplace": "MERCADO_LIVRE" | "SHOPEE", "titulo": "título do anúncio", "preco": 199.90, "url": "https://...", "condicao": "NOVO" | "USADO" | null }
  ],
  "resumo": "2 a 4 frases resumindo o mercado: faixa de preço (separando novo de usado quando houver os dois), disponibilidade e observações úteis para precificar."
}

Regras de fidelidade (as mais importantes — um anúncio errado distorce o preço):
- Inclua APENAS anúncios do MESMO produto: mesma marca, mesmo modelo/versão e mesma capacidade/tamanho/voltagem quando aplicável.${input.model ? ` O modelo é "${input.model}" — anúncios de outros modelos da mesma linha NÃO servem.` : ''}
- DESCARTE anúncios de acessórios (capa, película, suporte, cabo, carregador, bateria avulsa), peças de reposição, consertos/serviços, itens "compatível com" e kits/lotes com várias unidades.
- Na dúvida se o anúncio é do mesmo produto, NÃO inclua.
- "condicao" reflete o item anunciado: "NOVO", "USADO", ou null se o anúncio não deixa claro.${input.condition ? `\n- Nosso produto é ${input.condition === 'NOVO' ? 'NOVO' : 'USADO'}: priorize anúncios dessa condição, mas pode incluir da outra desde que "condicao" esteja preenchida corretamente.` : ''}

Regras de formato:
- "marketplace" deve ser exatamente "MERCADO_LIVRE" ou "SHOPEE".
- "preco" é um número em reais (ponto decimal), sem "R$" nem separador de milhar. Use null se não houver preço.
- "url" deve ser o link real do anúncio (http/https).
- Inclua no máximo ${MAX_LISTINGS} anúncios, priorizando os mais relevantes.
- Se não encontrar nada em um marketplace, apenas não inclua anúncios dele.
- Responda em português do Brasil no "resumo".`;
};

/** Estrutura crua esperada do modelo. */
interface RawResearch {
  anuncios?: unknown;
  resumo?: unknown;
}

/**
 * MarketResearchModule — pesquisa de preços do "Hermes Agent".
 *
 * Fluxo assíncrono, não-bloqueante:
 *  1. `request(input)` monta a query, checa o cache e — se necessário —
 *     enfileira um job de background, devolvendo o estado na hora (PENDING).
 *  2. Um worker (fila leve sobre Redis) executa a pesquisa via web search da
 *     Anthropic, agrega estatísticas e grava o resultado (READY) no cache.
 *  3. `get(key)` faz o poll do estado/resultado.
 *
 * Nada aqui bloqueia o cadastro do produto — o painel dispara a pesquisa e
 * segue a vida, consultando o resultado depois.
 */
@Injectable()
export class MarketResearchService implements OnModuleInit {
  private readonly logger = new Logger(MarketResearchService.name);

  constructor(
    private readonly anthropic: AnthropicService,
    private readonly redis: RedisService,
    private readonly queue: QueueService,
  ) {}

  onModuleInit(): void {
    // maxAttempts 1: erros são gravados como FAILED pelo próprio handler,
    // sem re-enfileirar (evita loops de custo em web search).
    this.queue.register<MarketResearchJobData>(QUEUE_NAME, (data) => this.runResearch(data), {
      maxAttempts: 1,
    });
  }

  /**
   * Dispara (ou reaproveita) uma pesquisa de mercado. Nunca bloqueia: se já há
   * resultado em cache, devolve-o; se já está em andamento, devolve PENDING; se
   * for novo, marca PENDING, enfileira o job e devolve PENDING na mesma hora.
   *
   * `forceRefresh: true` ignora o cache existente e força uma nova pesquisa —
   * usado pelo LearningModule quando um produto recebe muitos acessos e os
   * dados de mercado podem estar desatualizados.
   */
  async request(
    input: MarketResearchInput,
    options: { forceRefresh?: boolean } = {},
  ): Promise<MarketResearchJob> {
    const query = this.buildQuery(input);
    const key = this.cacheKey(query);

    if (!options.forceRefresh) {
      const existing = await this.redis.getJson<MarketResearchJob>(this.redisKey(key));
      if (existing && (existing.status === 'READY' || existing.status === 'PENDING')) {
        return existing;
      }
    }

    const job: MarketResearchJob = {
      key,
      query,
      status: 'PENDING',
      updatedAt: new Date().toISOString(),
    };
    await this.redis.setJson(this.redisKey(key), job, PENDING_TTL_SECONDS);
    await this.queue.enqueue<MarketResearchJobData>(QUEUE_NAME, { key, query, input });
    return job;
  }

  /** Poll do estado/resultado de um job pela chave devolvida em `request`. */
  async get(key: string): Promise<MarketResearchJob | null> {
    return this.redis.getJson<MarketResearchJob>(this.redisKey(key));
  }

  /**
   * Variante SÍNCRONA de `request`: usada por fluxos que já esperam uma
   * resposta lenta na mesma chamada (ex.: o orquestrador do Funcionário
   * Virtual, que já espera Vision/Identification responderem). Reaproveita o
   * cache quando existe (mesma chave que `request` usa) — só chama a Anthropic
   * de fato em caso de cache miss ou `forceRefresh`. Lança em caso de falha
   * (ao contrário de `request`, que nunca lança — aqui o chamador está
   * esperando ativamente e precisa decidir o que fazer).
   */
  async researchNow(
    input: MarketResearchInput,
    options: { forceRefresh?: boolean } = {},
  ): Promise<MarketResearchData> {
    const query = this.buildQuery(input);
    const key = this.cacheKey(query);

    if (!options.forceRefresh) {
      const existing = await this.redis.getJson<MarketResearchJob>(this.redisKey(key));
      if (existing?.status === 'READY' && existing.data) {
        return existing.data;
      }
    }

    const result = await this.performResearch(query, input);
    const job: MarketResearchJob = {
      key,
      query,
      status: 'READY',
      data: result,
      updatedAt: new Date().toISOString(),
    };
    await this.redis.setJson(this.redisKey(key), job, READY_TTL_SECONDS);
    return result;
  }

  /** Handler de background: executa a pesquisa e grava READY/FAILED no cache. */
  private async runResearch(data: MarketResearchJobData): Promise<void> {
    const { key, query, input } = data;
    try {
      const result = await this.performResearch(query, input);
      const job: MarketResearchJob = {
        key,
        query,
        status: 'READY',
        data: result,
        updatedAt: new Date().toISOString(),
      };
      await this.redis.setJson(this.redisKey(key), job, READY_TTL_SECONDS);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.warn(`market-research: falha em "${query}": ${message}`);
      const job: MarketResearchJob = {
        key,
        query,
        status: 'FAILED',
        error: message,
        updatedAt: new Date().toISOString(),
      };
      await this.redis.setJson(this.redisKey(key), job, PENDING_TTL_SECONDS);
    }
  }

  /** Chama a Anthropic (Hermes) e agrega o resultado. Usado por `runResearch` e `researchNow`. */
  private async performResearch(
    query: string,
    input: MarketResearchInput,
  ): Promise<MarketResearchData> {
    const raw = await this.anthropic.research(HERMES_PROMPT(query, input), {
      allowedDomains: ALLOWED_DOMAINS,
      maxSearches: 6,
    });
    const result = this.parseResult(raw, query, input);
    this.logger.log(`market-research: ${query} → ${result.listingCount} anúncios`);
    return result;
  }

  /**
   * Monta a consulta de busca a partir dos atributos disponíveis. Marca+modelo
   * (+tipo) identificam o produto com mais precisão que o título SEO, que
   * carrega adjetivos comerciais ("Oferta", "Original", ...) e polui a busca —
   * o título só é usado quando não há atributos estruturados.
   */
  private buildQuery(input: MarketResearchInput): string {
    const brand = toStringOrNull(input.brand ?? null);
    const model = toStringOrNull(input.model ?? null);
    const category = toStringOrNull(input.category ?? null);
    const title = toStringOrNull(input.title ?? null);

    let parts: string[];
    if (brand && model) {
      parts = [brand, model, ...(category ? [category] : [])];
    } else if (title) {
      parts = [title];
    } else {
      parts = [brand, model, category].filter((v): v is string => v !== null);
      if (parts.length === 0 && input.keywords?.length) {
        parts.push(...input.keywords.slice(0, 4));
      }
    }

    // Buscar "usado" muda completamente o conjunto de anúncios relevante (e o
    // cache key) — um produto usado não pode ser precificado só contra novos.
    if (input.condition === 'USADO') parts.push('usado');

    const joined = this.dedupeWords(parts.join(' ').trim());
    return this.normalizeQuery(joined || 'produto');
  }

  /** Remove palavras repetidas (ex.: modelo "Air Fryer AF-31" + categoria "Air Fryer"). */
  private dedupeWords(text: string): string {
    const seen = new Set<string>();
    return text
      .split(/\s+/)
      .filter((w) => {
        const key = w.toLowerCase();
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .join(' ');
  }

  /** Normaliza a query (colapsa espaços, corta tamanho) — base do cache key. */
  private normalizeQuery(q: string): string {
    return q.replace(/\s+/g, ' ').trim().slice(0, 120);
  }

  /** Converte a resposta do Hermes em dados agregados e determinísticos. */
  private parseResult(raw: string, query: string, input: MarketResearchInput): MarketResearchData {
    const parsed = extractJsonObject<RawResearch>(raw);
    const listings = this.normalizeListings(parsed?.anuncios);
    const summary = toStringOrNull(parsed?.resumo) ?? 'Sem resumo disponível.';

    // Estatísticas fiéis ao produto: prioriza anúncios da mesma condição
    // (novo/usado) e poda preços discrepantes que o modelo deixou passar.
    // `listings`/`links` continuam completos — só a agregação é filtrada.
    const statsListings = this.trimOutliers(this.selectByCondition(listings, input.condition));

    const byMarketplace = MARKETPLACE_SOURCES.map((mp) => this.statsFor(mp, statsListings)).filter(
      (s) => s.listingCount > 0,
    );

    const prices = statsListings.map((l) => l.price).filter((p): p is number => p !== null);

    return {
      query,
      currency: 'BRL',
      minPrice: prices.length ? Math.min(...prices) : null,
      avgPrice: prices.length
        ? this.round(prices.reduce((a, b) => a + b, 0) / prices.length)
        : null,
      maxPrice: prices.length ? Math.max(...prices) : null,
      listingCount: prices.length,
      byMarketplace,
      listings,
      links: this.uniqueLinks(listings),
      summary,
      researchedAt: new Date().toISOString(),
      modelUsed: process.env.ANTHROPIC_RESEARCH_MODEL || 'claude-haiku-4-5',
    };
  }

  /**
   * Quando a condição do produto é conhecida e há amostra suficiente
   * (MIN_CONDITION_MATCHES anúncios com preço na mesma condição), agrega só
   * esses anúncios — precificar um usado contra anúncios de novos infla o
   * preço. Com amostra pequena, mantém todos.
   */
  private selectByCondition(
    listings: MarketListing[],
    condition: ListingCondition | null | undefined,
  ): MarketListing[] {
    if (!condition) return listings;
    const matching = listings.filter((l) => l.condition === condition && l.price !== null);
    if (matching.length < MIN_CONDITION_MATCHES) return listings;
    return matching;
  }

  /**
   * Poda preços fora da faixa [mediana×0.35, mediana×3] quando há 4+ preços.
   * Protege a média de um acessório barato ou lote caro que tenha escapado das
   * regras de fidelidade do prompt.
   */
  private trimOutliers(listings: MarketListing[]): MarketListing[] {
    const prices = listings
      .map((l) => l.price)
      .filter((p): p is number => p !== null)
      .sort((a, b) => a - b);
    if (prices.length < OUTLIER_MIN_SAMPLE) return listings;

    const median =
      prices.length % 2 === 1
        ? prices[(prices.length - 1) / 2]
        : (prices[prices.length / 2 - 1] + prices[prices.length / 2]) / 2;
    const min = median * OUTLIER_MIN_RATIO;
    const max = median * OUTLIER_MAX_RATIO;

    const kept = listings.filter((l) => l.price === null || (l.price >= min && l.price <= max));
    const dropped = listings.length - kept.length;
    if (dropped > 0) {
      this.logger.log(
        `market-research: ${dropped} anúncio(s) com preço discrepante descartado(s) da agregação (mediana R$${median.toFixed(2)})`,
      );
    }
    return kept;
  }

  /** Filtra/normaliza anúncios crus: marketplace válido, url http, dedup por url. */
  private normalizeListings(raw: unknown): MarketListing[] {
    if (!Array.isArray(raw)) return [];
    const out: MarketListing[] = [];
    const seenUrls = new Set<string>();

    for (const item of raw) {
      if (!item || typeof item !== 'object') continue;
      const rec = item as Record<string, unknown>;

      const marketplace = this.toMarketplace(rec.marketplace);
      if (!marketplace) continue;

      const url = toStringOrNull(rec.url);
      if (!url || !/^https?:\/\//i.test(url)) continue;
      const urlKey = url.toLowerCase();
      if (seenUrls.has(urlKey)) continue;
      seenUrls.add(urlKey);

      out.push({
        marketplace,
        title: toStringOrNull(rec.titulo ?? rec.title) ?? 'Anúncio',
        price: toNumberOrNull(rec.preco ?? rec.price),
        url,
        condition: this.toListingCondition(rec.condicao ?? rec.condition),
      });

      if (out.length >= MAX_LISTINGS) break;
    }
    return out;
  }

  private toListingCondition(v: unknown): ListingCondition | null {
    if (typeof v !== 'string') return null;
    const up = v.trim().toUpperCase();
    return up === 'NOVO' || up === 'USADO' ? up : null;
  }

  private toMarketplace(v: unknown): MarketplaceSource | null {
    if (typeof v !== 'string') return null;
    const up = v.trim().toUpperCase();
    return (MARKETPLACE_SOURCES as readonly string[]).includes(up)
      ? (up as MarketplaceSource)
      : null;
  }

  private statsFor(
    marketplace: MarketplaceSource,
    listings: MarketListing[],
  ): MarketplacePriceStats {
    const own = listings.filter((l) => l.marketplace === marketplace);
    const prices = own.map((l) => l.price).filter((p): p is number => p !== null);
    return {
      marketplace,
      minPrice: prices.length ? Math.min(...prices) : null,
      avgPrice: prices.length
        ? this.round(prices.reduce((a, b) => a + b, 0) / prices.length)
        : null,
      maxPrice: prices.length ? Math.max(...prices) : null,
      listingCount: prices.length,
      links: own.map((l) => l.url),
    };
  }

  private uniqueLinks(listings: MarketListing[]): string[] {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const l of listings) {
      const key = l.url.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(l.url);
    }
    return out;
  }

  private round(n: number): number {
    return Math.round(n * 100) / 100;
  }

  private cacheKey(query: string): string {
    return createHash('sha1').update(query.toLowerCase()).digest('hex').slice(0, 16);
  }

  private redisKey(key: string): string {
    return `${CACHE_PREFIX}${key}`;
  }
}
