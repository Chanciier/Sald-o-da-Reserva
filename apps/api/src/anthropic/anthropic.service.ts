import Anthropic from '@anthropic-ai/sdk';
import { Inject, Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ANTHROPIC_CLIENT } from './anthropic.constants';

/** Uma imagem a anexar à mensagem, já em base64 (sem prefixo data:). */
export interface ClaudeImage {
  base64: string;
  mediaType: 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp';
}

export interface ClaudeChatOptions {
  /** Sobrepõe o modelo padrão configurado por env (`ANTHROPIC_*_MODEL`). */
  model?: string;
  images?: ClaudeImage[];
  timeoutMs?: number;
  maxTokens?: number;
}

const DEFAULT_TIMEOUT_MS = 120_000;
const DEFAULT_MAX_TOKENS = 4096;

/**
 * Cliente fino para a API da Anthropic (Claude), via SDK oficial. Único ponto
 * de configuração (modelo/timeout) e tratamento de erro para todos os módulos
 * do Funcionário Virtual que dependem de um modelo de IA (Vision, Identification).
 *
 * Substitui o antigo cliente Ollama local — mesmo papel, agora falando com a
 * API da Anthropic em vez de um modelo self-hosted.
 */
@Injectable()
export class AnthropicService {
  private readonly logger = new Logger(AnthropicService.name);

  constructor(@Inject(ANTHROPIC_CLIENT) private readonly client: Anthropic) {}

  /** Envia um prompt de 1 turno (com imagens opcionais) e devolve o texto da resposta. */
  async chat(prompt: string, options: ClaudeChatOptions = {}): Promise<string> {
    const model = options.model ?? this.defaultModel();
    const content: Anthropic.ContentBlockParam[] = [
      ...(options.images ?? []).map(
        (img): Anthropic.ContentBlockParam => ({
          type: 'image',
          source: { type: 'base64', media_type: img.mediaType, data: img.base64 },
        }),
      ),
      { type: 'text', text: prompt },
    ];

    try {
      const response = await this.client.messages.create(
        {
          model,
          max_tokens: options.maxTokens ?? DEFAULT_MAX_TOKENS,
          messages: [{ role: 'user', content }],
        },
        { timeout: options.timeoutMs ?? DEFAULT_TIMEOUT_MS },
      );

      const textBlock = response.content.find((b): b is Anthropic.TextBlock => b.type === 'text');
      return (textBlock?.text ?? '').trim();
    } catch (e: unknown) {
      if (
        e instanceof Anthropic.AuthenticationError ||
        e instanceof Anthropic.PermissionDeniedError
      ) {
        this.logger.error(`anthropic: credencial inválida/sem permissão (modelo=${model})`);
        throw new ServiceUnavailableException(
          'Falha de autenticação com a API de IA. Verifique ANTHROPIC_API_KEY.',
        );
      }
      if (e instanceof Anthropic.RateLimitError) {
        this.logger.warn(`anthropic: rate limit (modelo=${model})`);
        throw new ServiceUnavailableException(
          'Limite de uso da API de IA atingido. Tente novamente em instantes.',
        );
      }
      if (e instanceof Anthropic.APIError) {
        this.logger.error(`anthropic: erro da API (modelo=${model}): ${e.status} ${e.message}`);
        throw new ServiceUnavailableException('Falha ao consultar o modelo de IA.');
      }
      const msg = e instanceof Error ? e.message : String(e);
      this.logger.error(`anthropic: falha de conexão: ${msg}`);
      throw new ServiceUnavailableException('Modelo de IA indisponível no momento.');
    }
  }

  private defaultModel(): string {
    return process.env.ANTHROPIC_VISION_MODEL || 'claude-sonnet-5';
  }
}
