import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface EnotasInvoicePayload {
  consumidor: {
    nome: string;
    email: string;
    cpfCnpj?: string;
    endereco?: {
      pais: string;
      cep: string;
      logradouro: string;
      numero: string;
      complemento?: string;
      bairro: string;
      cidade: string;
      estado: string;
    };
  };
  itens: Array<{
    nome: string;
    ncm?: string;
    cfop: string;
    quantidade: number;
    quantidadeUnidade: string;
    valorUnitario: number;
    totalItem: number;
  }>;
  formaPagamento: string;
  totalVenda: number;
  totalFrete?: number;
  totalDesconto?: number;
  informacoesAdicionais?: string;
  enviarEmailDestinatario?: boolean;
}

export interface EnotasInvoiceResponse {
  id: string;
  status: string;
  numero?: string;
  chaveAcesso?: string;
  dataEmissao?: string;
  xmlUrl?: string;
  pdfUrl?: string;
  motivoCancelamento?: string;
  mensagemErro?: string;
}

@Injectable()
export class EnotasService {
  private readonly logger = new Logger(EnotasService.name);
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly companyId: string;

  constructor(private readonly config: ConfigService) {
    const env = this.config.get<string>('ENOTAS_ENVIRONMENT', 'sandbox');
    this.baseUrl =
      env === 'production' ? 'https://app.enotas.com.br/api' : 'https://app.enotas.com.br/api';
    this.apiKey = this.config.get<string>('ENOTAS_API_KEY', '');
    this.companyId = this.config.get<string>('ENOTAS_COMPANY_ID', '');
  }

  private get headers() {
    return {
      'Content-Type': 'application/json',
      'X-API-KEY': this.apiKey,
    };
  }

  private async request<T>(method: string, path: string, body?: unknown, attempt = 1): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    try {
      const res = await fetch(url, {
        method,
        headers: this.headers,
        body: body ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(15000),
      });

      if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(`eNotas ${method} ${path} → ${res.status}: ${text}`);
      }

      const contentType = res.headers.get('content-type') ?? '';
      if (contentType.includes('application/json')) {
        return (await res.json()) as T;
      }
      return (await res.text()) as unknown as T;
    } catch (err) {
      if (attempt < 3) {
        const delay = attempt * 1500;
        this.logger.warn(`eNotas retry ${attempt}/3 for ${method} ${path} in ${delay}ms`);
        await new Promise((r) => setTimeout(r, delay));
        return this.request<T>(method, path, body, attempt + 1);
      }
      this.logger.error(`eNotas request failed: ${method} ${path}`, err);
      throw err;
    }
  }

  async emitInvoice(payload: EnotasInvoicePayload): Promise<EnotasInvoiceResponse> {
    if (!this.apiKey || !this.companyId) {
      throw new Error(
        'eNotas não configurado: ENOTAS_API_KEY e ENOTAS_COMPANY_ID são obrigatórios.',
      );
    }
    this.logger.log(`eNotas: emitting invoice for ${payload.consumidor.email}`);
    return this.request<EnotasInvoiceResponse>('POST', `/empresas/${this.companyId}/nfe`, payload);
  }

  async getInvoice(enotasId: string): Promise<EnotasInvoiceResponse> {
    return this.request<EnotasInvoiceResponse>('GET', `/nfe/${enotasId}`);
  }

  async cancelInvoice(enotasId: string, reason: string): Promise<void> {
    await this.request('DELETE', `/nfe/${enotasId}`, { motivo: reason });
  }

  async downloadXml(enotasId: string): Promise<string> {
    return this.request<string>('GET', `/nfe/${enotasId}/xml`);
  }

  async downloadPdf(enotasId: string): Promise<string> {
    return this.request<string>('GET', `/nfe/${enotasId}/pdf`);
  }

  // Returns true if eNotas is configured (non-empty key + companyId)
  isConfigured(): boolean {
    return !!this.apiKey && !!this.companyId;
  }

  // Map eNotas status string to our InvoiceStatus enum value
  mapStatus(
    enotasStatus: string,
  ): 'PENDING' | 'PROCESSING' | 'AUTHORIZED' | 'REJECTED' | 'CANCELLED' {
    const map: Record<string, 'PENDING' | 'PROCESSING' | 'AUTHORIZED' | 'REJECTED' | 'CANCELLED'> =
      {
        aguardandoEnvio: 'PENDING',
        processando: 'PROCESSING',
        autorizada: 'AUTHORIZED',
        emitida: 'AUTHORIZED',
        rejeitada: 'REJECTED',
        cancelada: 'CANCELLED',
        denegada: 'REJECTED',
      };
    return map[enotasStatus] ?? 'PROCESSING';
  }
}
