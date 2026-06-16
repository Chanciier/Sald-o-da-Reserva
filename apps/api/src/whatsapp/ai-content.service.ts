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

    return `Você é um especialista em marketing e copywriting para e-commerce.

Com base apenas no nome e no preço do produto fornecidos, crie uma mensagem promocional para WhatsApp com o seguinte formato:

* Emoji chamativo no início
* Título de oferta em destaque
* Nome do produto
* Breve descrição destacando os principais benefícios e utilidades do produto
* Lista com 3 a 5 vantagens usando emojis
* Preço em destaque
* Chamada para ação incentivando a compra
* Link do produto ao final

Regras:

* Identifique automaticamente os benefícios do produto pelo nome informado.
* Utilize linguagem simples, persuasiva e voltada para vendas.
* Não invente especificações técnicas que não sejam evidentes pelo nome do produto.
* Mantenha o texto curto e fácil de ler no WhatsApp.
* Use emojis de forma moderada.
* Formate a mensagem para ficar visualmente organizada.
* Use *negrito* para destaques (formato WhatsApp).
* NÃO use hashtags.

Dados de entrada:
Nome do produto: ${p.name}
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
