import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface ProductInput {
  name: string;
  category?: string;
  brand?: string;
  price: number;
  salePrice?: number;
  stock: number;
  description?: string;
  productUrl: string;
}

@Injectable()
export class AIContentService {
  private readonly logger = new Logger(AIContentService.name);

  constructor(private readonly config: ConfigService) {}

  async generateAdCopy(product: ProductInput): Promise<string> {
    const apiKey = this.config.get<string>('GROQ_API_KEY');
    if (!apiKey) {
      this.logger.warn('GROQ_API_KEY não configurada — usando template padrão');
      return this.fallbackTemplate(product);
    }

    const prompt = this.buildPrompt(product);

    try {
      const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: 'llama-3.3-70b-versatile',
          max_tokens: 512,
          temperature: 0.9,
          messages: [{ role: 'user', content: prompt }],
        }),
      });

      if (!res.ok) {
        const body = await res.text().catch(() => '');
        throw new Error(`Groq API ${res.status}: ${body}`);
      }

      const data = (await res.json()) as { choices: { message: { content: string } }[] };
      return data.choices[0]?.message?.content?.trim() ?? this.fallbackTemplate(product);
    } catch (e) {
      this.logger.error(`Erro ao gerar conteúdo: ${(e as Error).message}`);
      return this.fallbackTemplate(product);
    }
  }

  private buildPrompt(p: ProductInput): string {
    const fmt = (n: number) =>
      new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(n);

    const precoInfo =
      p.salePrice && p.salePrice < p.price
        ? `Preço original: ${fmt(p.price)}, preço promocional: ${fmt(p.salePrice)}`
        : `Preço: ${fmt(p.price)}`;

    const estoqueInfo =
      p.stock <= 5 ? `Apenas ${p.stock} unidades restantes` : `${p.stock} unidades em estoque`;

    return `Você é um especialista em marketing digital para WhatsApp. Crie um anúncio atrativo para o produto abaixo.

PRODUTO:
- Nome: ${p.name}
${p.brand ? `- Marca: ${p.brand}` : ''}
${p.category ? `- Categoria: ${p.category}` : ''}
- ${precoInfo}
- Estoque: ${estoqueInfo}
${p.description ? `- Descrição: ${p.description}` : ''}
- Link: ${p.productUrl}

REGRAS OBRIGATÓRIAS:
1. Use emojis relevantes (varie: 🔥⚡✨💥🎯🛍️🏷️🎁💎🌟)
2. Máximo 200 palavras
3. Estrutura variada — escolha UMA das opções abaixo e adapte:
   A) Título impactante → benefícios em tópicos → preço → CTA
   B) Gancho de urgência → descrição → benefícios → preço → CTA
   C) Pergunta inicial → solução → preço → benefícios → CTA
4. CTA variado: use apenas UM dos seguintes: "Garanta o seu 👉", "Peça agora:", "Aproveite:", "Compre já 🛒", "Não perca:", "Corre que é por tempo limitado 🏃"
5. Formato para WhatsApp: use *negrito* para destaques
6. Inclua o link no final
7. NÃO use hashtags
8. Se houver promoção, destaque o desconto

Responda APENAS com o texto do anúncio, sem explicações.`;
  }

  private fallbackTemplate(p: ProductInput): string {
    const fmt = (n: number) =>
      new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(n);

    const displayPrice = p.salePrice && p.salePrice < p.price ? p.salePrice : p.price;
    const lines = [`🔥 *${p.name}*`, ''];

    if (p.salePrice && p.salePrice < p.price) {
      const pct = Math.round(((p.price - p.salePrice) / p.price) * 100);
      lines.push(`De ~${fmt(p.price)}~ por *${fmt(p.salePrice)}* (-${pct}%)`, '');
    } else {
      lines.push(`*${fmt(displayPrice)}*`, '');
    }

    if (p.stock <= 5) lines.push(`⚡ Últimas ${p.stock} unidades!`, '');

    lines.push(`🛒 Garanta o seu:`, p.productUrl);
    return lines.join('\n');
  }
}
