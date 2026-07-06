import { Injectable, Logger, UnprocessableEntityException } from '@nestjs/common';
import { AnthropicService, ClaudeImage } from '../anthropic/anthropic.service';
import { extractJsonObject } from '../common/json-extract';
import { toConfidence, toStringArray, toStringOrNull } from '../common/normalize';
import { fetchImageAsBase64, normalizeMediaType, parseInlineImage } from './image-source';
import {
  VISION_CONDITIONS,
  VisionAnalyzeInput,
  VisionAttributes,
  VisionCondition,
  VisionResult,
} from './vision.types';

/** Máximo de fotos por análise (limite do fluxo do Funcionário Virtual). */
const MAX_IMAGES = 5;

const VISION_PROMPT = `Você é um especialista em identificação de produtos para revenda no Brasil.
Analise a(s) imagem(ns) do MESMO produto e retorne APENAS um objeto JSON válido, sem texto adicional, com EXATAMENTE estas chaves:

{
  "marca": "marca/fabricante, ou null se não visível",
  "modelo": "modelo ou linha do produto, ou null",
  "categoria": "categoria em português (ex.: 'Fritadeira elétrica'), ou null",
  "cor": "cor predominante, ou null",
  "material": "material predominante, ou null",
  "dimensoes": "dimensões ou capacidade visíveis/estimadas como texto (ex.: '30 x 20 x 15 cm', '5 litros'), ou null",
  "dimensoes_estimadas_cm": { "largura": 30, "altura": 20, "profundidade": 15 },
  "peso_estimado_kg": 1.2,
  "gtin": "código de barras EAN/GTIN se estiver legível em alguma foto, ou null",
  "estado": "NOVO | USADO_BOM | USADO_REGULAR | DANIFICADO",
  "caracteristicas": ["lista de características observáveis"],
  "palavras_chave": ["termos de busca relevantes, incluindo marca e tipo"],
  "confianca": 0.0
}

Regras:
- Responda em português do Brasil.
- Use null (não invente) quando um atributo não for determinável pela imagem.
- "dimensoes_estimadas_cm" e "peso_estimado_kg": estimativa realista do produto EMBALADO para envio, baseada no tipo de produto e no que é visível (referências de escala na foto, capacidade, categoria). Se você reconhece o tipo de produto, estime — só use null se não fizer ideia do que é. Números em cm e kg.
- "gtin": apenas dígitos, e apenas se um código de barras/etiqueta estiver realmente legível — NUNCA invente.
- "estado": NOVO = lacrado/sem uso; USADO_BOM = sinais mínimos; USADO_REGULAR = desgaste visível; DANIFICADO = defeito/quebra visível.
- "confianca": número entre 0.0 e 1.0 refletindo sua certeza geral na identificação.
- "caracteristicas" e "palavras_chave" devem ser arrays de strings (podem ser vazios).`;

/** Estrutura crua esperada do modelo (chaves em PT-BR). */
interface RawVision {
  marca?: unknown;
  modelo?: unknown;
  categoria?: unknown;
  cor?: unknown;
  material?: unknown;
  dimensoes?: unknown;
  dimensoes_estimadas_cm?: unknown;
  peso_estimado_kg?: unknown;
  gtin?: unknown;
  estado?: unknown;
  caracteristicas?: unknown;
  palavras_chave?: unknown;
  confianca?: unknown;
}

/**
 * VisionModule — extração de atributos visuais de produtos via Claude Vision
 * (API da Anthropic). Recebe imagens (URL pública ou base64), envia todas numa
 * única chamada multimodal e devolve JSON estruturado.
 *
 * Não faz pesquisa de mercado nem sugestão de preço — isso é responsabilidade
 * de módulos posteriores do Funcionário Virtual.
 */
@Injectable()
export class VisionService {
  private readonly logger = new Logger(VisionService.name);
  private readonly model: string;
  private readonly timeoutMs: number;

  constructor(private readonly anthropic: AnthropicService) {
    this.model = process.env.ANTHROPIC_VISION_MODEL || 'claude-sonnet-5';
    const parsed = Number(process.env.ANTHROPIC_TIMEOUT_MS);
    this.timeoutMs = Number.isFinite(parsed) && parsed > 0 ? parsed : 120_000;
  }

  async analyze(input: VisionAnalyzeInput): Promise<VisionResult> {
    const images = await this.collectImages(input);

    const raw = await this.anthropic.chat(VISION_PROMPT, {
      model: this.model,
      images,
      timeoutMs: this.timeoutMs,
    });
    const parsed = extractJsonObject<RawVision>(raw);
    if (!parsed) {
      this.logger.warn(`vision: resposta não-parseável do modelo. Trecho: ${raw.slice(0, 200)}`);
      throw new UnprocessableEntityException(
        'Não foi possível interpretar a resposta do modelo de visão.',
      );
    }

    return {
      ...this.normalize(parsed),
      modelUsed: this.model,
      imagesAnalyzed: images.length,
    };
  }

  /** Resolve a entrada (URLs e/ou base64) numa lista de imagens prontas p/ Claude. */
  private async collectImages(input: VisionAnalyzeInput): Promise<ClaudeImage[]> {
    const urls = input.imageUrls ?? [];
    const inline = input.imagesBase64 ?? [];

    const total = urls.length + inline.length;
    if (total === 0) {
      throw new UnprocessableEntityException('Envie ao menos uma imagem (URL ou base64).');
    }
    if (total > MAX_IMAGES) {
      throw new UnprocessableEntityException(`Máximo de ${MAX_IMAGES} imagens por análise.`);
    }

    // URLs passam pela guarda anti-SSRF e viram base64.
    const fetched = await Promise.all(urls.map((u) => fetchImageAsBase64(u, this.timeoutMs)));
    const fromUrls: ClaudeImage[] = fetched.map((f) => ({
      base64: f.base64,
      mediaType: normalizeMediaType(f.mimeType),
    }));
    const fromInline: ClaudeImage[] = inline
      .map(parseInlineImage)
      .filter((img) => img.base64.length > 0);

    return [...fromUrls, ...fromInline];
  }

  private normalize(raw: RawVision): VisionAttributes {
    return {
      brand: toStringOrNull(raw.marca),
      model: toStringOrNull(raw.modelo),
      category: toStringOrNull(raw.categoria),
      color: toStringOrNull(raw.cor),
      material: toStringOrNull(raw.material),
      dimensions: toStringOrNull(raw.dimensoes),
      estimatedDimensionsCm: this.toEstimatedDimensions(raw.dimensoes_estimadas_cm),
      estimatedWeightKg: this.toPositiveNumber(raw.peso_estimado_kg),
      gtin: this.toGtin(raw.gtin),
      condition: this.toCondition(raw.estado),
      features: toStringArray(raw.caracteristicas),
      keywords: toStringArray(raw.palavras_chave),
      confidence: toConfidence(raw.confianca),
    };
  }

  /** Aceita chaves em PT ("largura") ou EN ("width"); exige os 3 eixos > 0. */
  private toEstimatedDimensions(
    raw: unknown,
  ): { width: number; height: number; depth: number } | null {
    if (!raw || typeof raw !== 'object') return null;
    const rec = raw as Record<string, unknown>;
    const width = this.toPositiveNumber(rec.largura ?? rec.width);
    const height = this.toPositiveNumber(rec.altura ?? rec.height);
    const depth = this.toPositiveNumber(rec.profundidade ?? rec.comprimento ?? rec.depth);
    if (width === null || height === null || depth === null) return null;
    return { width, height, depth };
  }

  private toPositiveNumber(v: unknown): number | null {
    const n = typeof v === 'string' ? Number(v.replace(',', '.')) : typeof v === 'number' ? v : NaN;
    return Number.isFinite(n) && n > 0 ? Math.round(n * 1000) / 1000 : null;
  }

  /** GTIN só vale se for 8–14 dígitos (EAN-8/12/13/14) — o resto é ruído/invenção. */
  private toGtin(v: unknown): string | null {
    if (typeof v !== 'string') return null;
    const digits = v.replace(/\D/g, '');
    return digits.length >= 8 && digits.length <= 14 ? digits : null;
  }

  private toCondition(v: unknown): VisionCondition | null {
    if (typeof v !== 'string') return null;
    const up = v.trim().toUpperCase();
    return (VISION_CONDITIONS as readonly string[]).includes(up) ? (up as VisionCondition) : null;
  }
}
