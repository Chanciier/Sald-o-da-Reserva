import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';

/** Uma mensagem de chat no formato aceito pelo Ollama (`/api/chat`). */
export interface OllamaChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
  /** Imagens em base64 (sem prefixo data:), anexadas à mensagem. */
  images?: string[];
}

export interface OllamaChatOptions {
  /** Sobrepõe o modelo padrão configurado por env (`OLLAMA_*_MODEL`). */
  model?: string;
  /** Força saída JSON no Ollama (ainda assim, parseie defensivamente). */
  json?: boolean;
  temperature?: number;
  timeoutMs?: number;
}

interface OllamaChatApiResponse {
  message?: { content?: string };
}

const DEFAULT_TIMEOUT_MS = 120_000;

/**
 * Cliente HTTP fino para o Ollama local (sem SDK — a API do Ollama é REST
 * simples). Único ponto de configuração (URL/timeout) e tratamento de erro
 * para todos os módulos do Funcionário Virtual que dependem de um modelo local
 * (Vision, Identification, e futuros).
 */
@Injectable()
export class OllamaService {
  private readonly logger = new Logger(OllamaService.name);
  private readonly baseUrl: string;
  private readonly defaultTimeoutMs: number;

  constructor() {
    this.baseUrl = (process.env.OLLAMA_BASE_URL ?? 'http://127.0.0.1:11434').replace(/\/+$/, '');
    const parsed = Number(process.env.OLLAMA_TIMEOUT_MS);
    this.defaultTimeoutMs = Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_TIMEOUT_MS;
  }

  /** Envia uma conversa de 1 turno ao Ollama e devolve o texto da resposta. */
  async chat(model: string, messages: OllamaChatMessage[], options: OllamaChatOptions = {}) {
    const timeoutMs = options.timeoutMs ?? this.defaultTimeoutMs;
    const body = {
      model: options.model ?? model,
      stream: false,
      ...(options.json ? { format: 'json' } : {}),
      options: { temperature: options.temperature ?? 0.2 },
      messages,
    };

    let resp: Response;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      resp = await fetch(`${this.baseUrl}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      this.logger.error(`ollama: falha ao conectar em ${this.baseUrl}: ${msg}`);
      throw new ServiceUnavailableException(
        'Modelo local indisponível. Verifique se o Ollama está em execução.',
      );
    } finally {
      clearTimeout(timer);
    }

    if (!resp.ok) {
      const errText = await resp.text().catch(() => '');
      this.logger.error(
        `ollama: HTTP ${resp.status} (modelo=${body.model}): ${errText.slice(0, 200)}`,
      );
      if (resp.status === 404) {
        throw new ServiceUnavailableException(
          `Modelo "${body.model}" não encontrado no Ollama. Rode: ollama pull ${body.model}`,
        );
      }
      throw new ServiceUnavailableException('Falha ao consultar o modelo local.');
    }

    const data = (await resp.json()) as OllamaChatApiResponse;
    return (data.message?.content ?? '').trim();
  }
}
