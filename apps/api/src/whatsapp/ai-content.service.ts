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

    const displayPrice = p.salePrice && p.salePrice < p.price ? fmt(p.salePrice) : fmt(p.price);

    return `Crie uma copy de venda para divulgar no grupo de vendas do meu ecommerce. Use bastante emoji. Seja direto, sem textos longos. Use quebras de linha para separar as partes da mensagem e deixar o texto organizado e fácil de ler no WhatsApp.

Produto: ${p.name}
Preço: ${displayPrice}
Link: ${p.productUrl}

Retorne apenas a mensagem pronta para envio.`;
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
