import { Injectable, Logger } from '@nestjs/common';
import { GoogleGenerativeAI, HarmBlockThreshold, HarmCategory } from '@google/generative-ai';

interface GeminiResult {
  nome: string;
  descricao_busca: string;
  condicao: 'NOVO' | 'USADO_BOM' | 'USADO_REGULAR' | 'DANIFICADO';
  confianca: number;
}

interface MlPrice {
  min: number;
  median: number;
  max: number;
  total: number;
}

export interface AnalyzeResult {
  name: string;
  shortDescription: string;
  brand: string | null;
  condition: string;
  confidence: number;
  suggestedPrice: number | null;
  priceRange: MlPrice | null;
  searchTerm: string;
}

const GEMINI_PROMPT = `Você é um especialista em identificação de produtos para revenda no Brasil.
Analise a imagem e retorne APENAS um JSON válido, sem texto adicional.

{
  "nome": "nome comercial completo do produto",
  "descricao_busca": "termo de busca DETALHADO com marca, modelo, tamanho e especificações visíveis",
  "condicao": "NOVO | USADO_BOM | USADO_REGULAR | DANIFICADO",
  "confianca": 0.0_a_1.0
}

Regras para descricao_busca:
- Seja ESPECÍFICO: inclua marca, modelo, tamanho, capacidade, voltagem visíveis na foto/embalagem.
- Exemplos: 'air fryer mondial 5l digital inox', 'fone JBL Tune 510BT bluetooth'

Regras para condicao:
- NOVO: embalagem fechada ou produto visivelmente novo sem uso
- USADO_BOM: sinais mínimos de uso, funcional
- USADO_REGULAR: desgaste visível mas funcional
- DANIFICADO: defeito, quebra ou dano visível`;

const VALID_CONDITIONS = new Set(['NOVO', 'USADO_BOM', 'USADO_REGULAR', 'DANIFICADO']);
const MODELS = ['gemini-2.0-flash', 'gemini-1.5-flash'];

@Injectable()
export class AnalyzeImageService {
  private readonly logger = new Logger(AnalyzeImageService.name);
  private readonly genai: GoogleGenerativeAI | null;

  constructor() {
    const key = process.env.GEMINI_API_KEY;
    this.genai = key ? new GoogleGenerativeAI(key) : null;
  }

  async analyze(imageUrl: string): Promise<AnalyzeResult> {
    const geminiResult = await this.callGemini(imageUrl).catch(() => null);

    let mlPrices: MlPrice | null = null;
    if (geminiResult?.descricao_busca) {
      mlPrices = await this.fetchMlPrices(geminiResult.descricao_busca).catch(() => null);
    }

    const suggestedPrice = mlPrices ? this.suggestPrice(mlPrices, geminiResult?.condicao) : null;

    // Extract brand as first word of descricao_busca if it looks like a proper noun
    const brand = geminiResult ? this.extractBrand(geminiResult.descricao_busca) : null;

    return {
      name: geminiResult?.nome ?? 'Produto não identificado',
      shortDescription: geminiResult?.descricao_busca ?? '',
      brand,
      condition: geminiResult?.condicao ?? 'NOVO',
      confidence: geminiResult?.confianca ?? 0,
      suggestedPrice,
      priceRange: mlPrices,
      searchTerm: geminiResult?.descricao_busca ?? '',
    };
  }

  private async callGemini(imageUrl: string): Promise<GeminiResult | null> {
    if (!this.genai) {
      this.logger.warn('GEMINI_API_KEY não configurada.');
      return null;
    }

    // Fetch image and convert to base64
    const res = await fetch(imageUrl);
    if (!res.ok) throw new Error(`Falha ao buscar imagem: ${res.status}`);
    const buf = await res.arrayBuffer();
    const b64 = Buffer.from(buf).toString('base64');
    const mimeType = (res.headers.get('content-type') ?? 'image/jpeg') as string;

    for (const modelName of MODELS) {
      try {
        const model = this.genai.getGenerativeModel({
          model: modelName,
          safetySettings: [
            {
              category: HarmCategory.HARM_CATEGORY_HARASSMENT,
              threshold: HarmBlockThreshold.BLOCK_NONE,
            },
          ],
        });
        const result = await model.generateContent([
          { inlineData: { data: b64, mimeType } },
          GEMINI_PROMPT,
        ]);
        const text = result.response.text().trim();
        return this.parseGeminiJson(text);
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        this.logger.warn(`Gemini ${modelName} falhou: ${msg.slice(0, 120)}`);
        // rate limit → stop; overload → try next model
        if (msg.includes('429') || msg.includes('RESOURCE_EXHAUSTED')) break;
      }
    }
    return null;
  }

  private parseGeminiJson(text: string): GeminiResult | null {
    const attempts = [
      text,
      text.match(/```(?:json)?\s*(\{.*?\})\s*```/s)?.[1],
      text.match(/\{.*\}/s)?.[0],
    ].filter(Boolean) as string[];

    for (const attempt of attempts) {
      try {
        const data = JSON.parse(attempt);
        const condicao = String(data.condicao ?? '').toUpperCase();
        return {
          nome: String(data.nome ?? 'Produto não identificado').trim(),
          descricao_busca: String(data.descricao_busca ?? '').trim(),
          condicao: VALID_CONDITIONS.has(condicao)
            ? (condicao as GeminiResult['condicao'])
            : 'NOVO',
          confianca: Math.max(0, Math.min(1, Number(data.confianca ?? 0.5))),
        };
      } catch {
        continue;
      }
    }
    return null;
  }

  private async fetchMlPrices(query: string): Promise<MlPrice | null> {
    const url = `https://api.mercadolibre.com/sites/MLB/search?q=${encodeURIComponent(query)}&limit=20&condition=new`;
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return null;

    const data = (await res.json()) as {
      results?: { price: number }[];
      paging?: { total: number };
    };
    const prices = (data.results ?? [])
      .map((r) => r.price)
      .filter((p) => p > 0)
      .sort((a, b) => a - b);
    if (prices.length === 0) return null;

    const mid = Math.floor(prices.length / 2);
    const median = prices.length % 2 === 0 ? (prices[mid - 1] + prices[mid]) / 2 : prices[mid];

    return {
      min: prices[0],
      median: Math.round(median * 100) / 100,
      max: prices[prices.length - 1],
      total: data.paging?.total ?? prices.length,
    };
  }

  private suggestPrice(ml: MlPrice, condition?: string): number {
    // Use median as base; apply condition discount
    let base = ml.median;
    if (condition === 'USADO_BOM') base *= 0.7;
    else if (condition === 'USADO_REGULAR') base *= 0.5;
    else if (condition === 'DANIFICADO') base *= 0.3;
    // Round to nearest R$ 0.99
    return Math.ceil(base) - 0.01;
  }

  private extractBrand(descricao: string): string | null {
    if (!descricao) return null;
    const first = descricao.split(' ')[0];
    // Looks like a brand if it's 2-20 chars, not a common Portuguese word
    const COMMON = new Set(['kit', 'par', 'caixa', 'conjunto', 'trio', 'jogo', 'pacote']);
    if (first.length >= 2 && first.length <= 20 && !COMMON.has(first.toLowerCase())) {
      return first.charAt(0).toUpperCase() + first.slice(1);
    }
    return null;
  }
}
