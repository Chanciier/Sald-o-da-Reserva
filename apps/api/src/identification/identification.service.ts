import { Injectable, Logger, UnprocessableEntityException } from '@nestjs/common';
import { AnthropicService } from '../anthropic/anthropic.service';
import { extractJsonObject } from '../common/json-extract';
import { toStringArray, toStringOrNull } from '../common/normalize';
import { PrismaService } from '../prisma/prisma.service';
import { slugify } from '../utils/slugify';
import {
  IdentificationInput,
  IdentificationResult,
  ProductSpecification,
} from './identification.types';

const MAX_TITLE_LENGTH = 200; // Product.name
const MAX_META_DESCRIPTION_LENGTH = 160; // Product.metaDescription (@db.VarChar(500), mas 160 é o limite prático de SEO)
const MAX_SHORT_DESCRIPTION_LENGTH = 300; // Product.shortDescription (@db.Text; 300 é o corte prático de vitrine)
const MAX_TAGS = 15;

const PROMPT_HEADER = `Você é um redator especialista em e-commerce de produtos de liquidação/outlet no Brasil (loja "Saldão da Reserva").
Com base nos atributos abaixo — já extraídos por um modelo de visão computacional a partir de fotos reais do produto — gere o conteúdo comercial completo do anúncio.

Atributos identificados na imagem:
`;

const PROMPT_FOOTER = `
Retorne APENAS um objeto JSON válido, sem texto adicional, com EXATAMENTE estas chaves:

{
  "titulo_seo": "título comercial curto e otimizado para busca (até 70 caracteres), incluindo marca e tipo de produto quando conhecidos",
  "descricao": "descrição completa em português, 2 a 4 parágrafos, mencionando o estado de conservação e o que está incluso",
  "descricao_curta": "resumo comercial de 1 a 2 frases (até 300 caracteres) para vitrines e listagens",
  "especificacoes": [{"label": "Nome do atributo", "value": "valor"}],
  "categoria": "categoria do produto em português (ex.: 'Eletroportáteis')",
  "tags": ["palavras-chave adicionais de busca, sem repetir as já fornecidas nos atributos"],
  "meta_description": "resumo de até 155 caracteres para SEO (meta description)"
}

Regras:
- NUNCA invente marca, modelo ou característica que não estejam nos atributos fornecidos ou seja uma inferência razoável do tipo de produto.
- Se o estado de conservação não for NOVO, mencione isso claramente na descrição, sem exagerar os defeitos.
- "especificacoes" deve conter só pares atributo/valor objetivos (evite frases longas).
- Responda em português do Brasil.`;

/** Estrutura crua esperada do modelo (chaves em PT-BR). */
interface RawIdentification {
  titulo_seo?: unknown;
  descricao?: unknown;
  descricao_curta?: unknown;
  especificacoes?: unknown;
  categoria?: unknown;
  tags?: unknown;
  meta_description?: unknown;
}

/**
 * IdentificationModule — segunda etapa do Funcionário Virtual. Recebe o JSON
 * do VisionModule e gera o conteúdo comercial do anúncio (título SEO,
 * descrição, especificações, categoria, tags, slug, meta description) via
 * Claude (API da Anthropic).
 *
 * Não persiste nada — devolve um rascunho para o painel de revisão, onde todo
 * campo é editável antes de virar um Product de verdade.
 */
@Injectable()
export class IdentificationService {
  private readonly logger = new Logger(IdentificationService.name);
  private readonly model: string;
  private readonly timeoutMs: number;

  constructor(
    private readonly anthropic: AnthropicService,
    private readonly prisma: PrismaService,
  ) {
    // Reaproveita o modelo de visão por padrão; permite apontar um modelo de
    // texto dedicado (ex.: mais barato) via env.
    this.model =
      process.env.ANTHROPIC_TEXT_MODEL || process.env.ANTHROPIC_VISION_MODEL || 'claude-haiku-4-5';
    const parsed = Number(process.env.ANTHROPIC_TIMEOUT_MS);
    this.timeoutMs = Number.isFinite(parsed) && parsed > 0 ? parsed : 120_000;
  }

  async generate(input: IdentificationInput): Promise<IdentificationResult> {
    const prompt = this.buildPrompt(input);

    const raw = await this.anthropic.chat(prompt, {
      model: this.model,
      timeoutMs: this.timeoutMs,
    });

    const parsed = extractJsonObject<RawIdentification>(raw);
    if (!parsed) {
      this.logger.warn(
        `identification: resposta não-parseável do modelo. Trecho: ${raw.slice(0, 200)}`,
      );
      throw new UnprocessableEntityException(
        'Não foi possível interpretar a resposta do modelo de identificação.',
      );
    }

    const seoTitle = this.truncate(
      toStringOrNull(parsed.titulo_seo) ?? this.fallbackTitle(input),
      MAX_TITLE_LENGTH,
    );
    const description = toStringOrNull(parsed.descricao) ?? '';
    const shortDescription = this.truncate(
      toStringOrNull(parsed.descricao_curta) ?? toStringOrNull(parsed.meta_description) ?? '',
      MAX_SHORT_DESCRIPTION_LENGTH,
    );
    const specifications = this.normalizeSpecifications(parsed.especificacoes, input);
    const category = toStringOrNull(parsed.categoria) ?? toStringOrNull(input.category ?? null);
    const tags = this.normalizeTags(parsed.tags, input);
    const metaDescription = this.truncate(
      toStringOrNull(parsed.meta_description) ?? description,
      MAX_META_DESCRIPTION_LENGTH,
    );
    const categoryId = category ? await this.matchCategory(category) : null;

    return {
      seoTitle,
      description,
      shortDescription,
      specifications,
      category,
      categoryId,
      tags,
      slug: slugify(seoTitle).slice(0, 200),
      metaDescription,
      modelUsed: this.model,
    };
  }

  private buildPrompt(input: IdentificationInput): string {
    const attrs = {
      marca: input.brand ?? null,
      modelo: input.model ?? null,
      categoria_sugerida: input.category ?? null,
      cor: input.color ?? null,
      material: input.material ?? null,
      dimensoes: input.dimensions ?? null,
      estado: input.condition ?? null,
      caracteristicas: input.features ?? [],
      palavras_chave: input.keywords ?? [],
    };
    return `${PROMPT_HEADER}${JSON.stringify(attrs, null, 2)}\n${PROMPT_FOOTER}`;
  }

  /** Título mínimo viável quando o modelo não devolve `titulo_seo` (não deve ficar em branco). */
  private fallbackTitle(input: IdentificationInput): string {
    const parts = [input.brand, input.model ?? input.category].filter(
      (v): v is string => typeof v === 'string' && v.length > 0,
    );
    return parts.length > 0 ? parts.join(' ') : 'Produto sem identificação';
  }

  /**
   * Combina as especificações que o modelo devolveu (array de {label,value}
   * ou objeto chave/valor) com os atributos já conhecidos do Vision — que
   * SEMPRE entram, mesmo se o modelo de texto não os repetir.
   */
  private normalizeSpecifications(
    raw: unknown,
    input: IdentificationInput,
  ): ProductSpecification[] {
    const out: ProductSpecification[] = [];
    const seen = new Set<string>();

    const push = (labelRaw: unknown, valueRaw: unknown) => {
      const label = toStringOrNull(labelRaw);
      const value = toStringOrNull(valueRaw);
      if (!label || !value) return;
      const key = label.toLowerCase();
      if (seen.has(key)) return;
      seen.add(key);
      out.push({ label, value });
    };

    if (Array.isArray(raw)) {
      for (const item of raw) {
        if (item && typeof item === 'object') {
          const rec = item as Record<string, unknown>;
          push(rec.label ?? rec.chave ?? rec.nome, rec.value ?? rec.valor);
        }
      }
    } else if (raw && typeof raw === 'object') {
      for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
        push(key, value);
      }
    }

    // Garante que os atributos do Vision apareçam na ficha técnica mesmo que
    // o modelo de texto não os tenha repetido.
    push('Marca', input.brand);
    push('Modelo', input.model);
    push('Cor', input.color);
    push('Material', input.material);
    push('Dimensões', input.dimensions);

    return out;
  }

  /** Junta as tags geradas pelo modelo com as palavras-chave do Vision, sem duplicar. */
  private normalizeTags(raw: unknown, input: IdentificationInput): string[] {
    const fromModel = toStringArray(raw);
    const fromVision = toStringArray(input.keywords);

    const seen = new Set<string>();
    const out: string[] = [];
    for (const tag of [...fromVision, ...fromModel]) {
      const key = tag.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(tag);
      if (out.length >= MAX_TAGS) break;
    }
    return out;
  }

  /** Categoria já cadastrada cujo nome bate (exato, depois parcial) com o texto sugerido pela IA. */
  private async matchCategory(categoryText: string): Promise<string | null> {
    const categories = await this.prisma.category.findMany({ select: { id: true, name: true } });
    if (categories.length === 0) return null;

    const norm = (s: string) => s.toLowerCase().trim();
    const target = norm(categoryText);

    const exact = categories.find((c) => norm(c.name) === target);
    if (exact) return exact.id;

    const partial = categories.find(
      (c) => norm(c.name).includes(target) || target.includes(norm(c.name)),
    );
    return partial?.id ?? null;
  }

  private truncate(text: string, max: number): string {
    if (text.length <= max) return text;
    return `${text.slice(0, max - 1).trimEnd()}…`;
  }
}
