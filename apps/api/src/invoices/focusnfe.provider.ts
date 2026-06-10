import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  InvoiceProvider,
  InvoicePayload,
  IssuedInvoice,
  InvoiceProviderStatus,
} from './invoice.provider';

interface FocusNfeResponse {
  ref?: string;
  status?: string;
  status_sefaz?: string;
  mensagem_sefaz?: string;
  numero?: string;
  serie?: string;
  chave_nfe?: string;
  protocolo?: string;
  url?: string;
  danfe_url?: string;
  data_emissao?: string;
  data_cancelamento?: string;
  erros?: Array<{ codigo: string; mensagem: string; campo?: string }>;
  mensagem?: string;
}

@Injectable()
export class FocusNfeProvider implements InvoiceProvider {
  private readonly logger = new Logger(FocusNfeProvider.name);
  private readonly baseUrl: string;
  private readonly token: string;

  // Emitter company data (configured per environment)
  private readonly simulate: boolean;
  private readonly cnpj: string;
  private readonly ie: string;
  private readonly razaoSocial: string;
  private readonly nomeFantasia: string;
  private readonly logradouro: string;
  private readonly numero: string;
  private readonly bairro: string;
  private readonly municipio: string;
  private readonly uf: string;
  private readonly cep: string;
  private readonly crt: string;
  private readonly defaultNcm: string;

  constructor(private readonly config: ConfigService) {
    const env = this.config.get<string>('FOCUS_NFE_ENVIRONMENT', 'sandbox');
    this.baseUrl =
      env === 'production'
        ? 'https://api.focusnfe.com.br/v2'
        : 'https://homologacao.focusnfe.com.br/v2';

    this.simulate = this.config.get<string>('FOCUS_NFE_SIMULATE', '') === 'true';
    this.token = this.config.get<string>('FOCUS_NFE_TOKEN', '');
    this.cnpj = this.config.get<string>('FOCUS_NFE_CNPJ', '');
    this.ie = this.config.get<string>('FOCUS_NFE_IE', '');
    this.razaoSocial = this.config.get<string>('FOCUS_NFE_RAZAO_SOCIAL', '');
    this.nomeFantasia = this.config.get<string>('FOCUS_NFE_NOME_FANTASIA', this.razaoSocial);
    this.logradouro = this.config.get<string>('FOCUS_NFE_LOGRADOURO', '');
    this.numero = this.config.get<string>('FOCUS_NFE_NUMERO', 'S/N');
    this.bairro = this.config.get<string>('FOCUS_NFE_BAIRRO', '');
    this.municipio = this.config.get<string>('FOCUS_NFE_MUNICIPIO', '');
    this.uf = this.config.get<string>('FOCUS_NFE_UF', 'SP');
    this.cep = this.config.get<string>('FOCUS_NFE_CEP', '');
    this.crt = this.config.get<string>('FOCUS_NFE_CRT', '1'); // 1=Simples Nacional
    this.defaultNcm = this.config.get<string>('FOCUS_NFE_DEFAULT_NCM', '87141000'); // 8714.10.00 — partes p/ motocicletas
  }

  private get authHeader(): string {
    return 'Basic ' + Buffer.from(`${this.token}:`).toString('base64');
  }

  private async request<T>(method: string, path: string, body?: unknown, attempt = 1): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    try {
      const res = await fetch(url, {
        method,
        headers: {
          Authorization: this.authHeader,
          'Content-Type': 'application/json',
        },
        body: body ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(20000),
      });

      // 422 = validation errors from Focus NFe — parse as JSON
      if (!res.ok && res.status !== 422) {
        const text = await res.text().catch(() => '');
        throw new Error(`FocusNFe ${method} ${path} → HTTP ${res.status}: ${text}`);
      }

      const ct = res.headers.get('content-type') ?? '';
      if (ct.includes('application/json') || !res.ok) {
        const json = (await res.json()) as FocusNfeResponse;
        if (!res.ok) {
          const msg =
            json.erros?.map((e) => e.mensagem).join('; ') ?? json.mensagem ?? `HTTP ${res.status}`;
          throw new Error(`FocusNFe: ${msg}`);
        }
        return json as unknown as T;
      }

      // Binary / text response (e.g., XML, PDF)
      return (await res.text()) as unknown as T;
    } catch (err) {
      if (attempt < 3) {
        const delay = attempt * 2000;
        this.logger.warn(`FocusNFe retry ${attempt}/3 for ${method} ${path} in ${delay}ms`);
        await new Promise((r) => setTimeout(r, delay));
        return this.request<T>(method, path, body, attempt + 1);
      }
      this.logger.error(`FocusNFe request failed: ${method} ${path}`, err);
      throw err;
    }
  }

  // ── InvoiceProvider impl ──────────────────────────────────────────────────

  async issueInvoice(payload: InvoicePayload): Promise<IssuedInvoice> {
    if (!this.isConfigured()) {
      throw new Error(
        'Focus NFe não configurado: FOCUS_NFE_TOKEN e dados do emitente são obrigatórios.',
      );
    }

    if (this.simulate) {
      this.logger.warn(`FocusNFe SIMULATE: fake AUTHORIZED for ref=${payload.reference}`);
      return {
        reference: payload.reference,
        status: 'AUTHORIZED',
        invoiceNumber: String(Math.floor(Math.random() * 900000) + 100000),
        accessKey: Array.from({ length: 44 }, () => Math.floor(Math.random() * 10)).join(''),
        protocol: String(Math.floor(Math.random() * 9e14) + 1e14),
        issueDate: new Date(),
      };
    }

    const now = new Date().toISOString();
    const body = this.buildNfePayload(payload, now);

    this.logger.log(`FocusNFe: payload=${JSON.stringify(body)}`);
    const res = await this.request<FocusNfeResponse>(
      'POST',
      `/nfe?ref=${encodeURIComponent(payload.reference)}`,
      body,
    );

    return this.mapResponse(payload.reference, res);
  }

  async getInvoice(reference: string): Promise<IssuedInvoice> {
    const res = await this.request<FocusNfeResponse>(
      'GET',
      `/nfe/${encodeURIComponent(reference)}?completo=1`,
    );
    return this.mapResponse(reference, res);
  }

  async cancelInvoice(reference: string, reason: string): Promise<void> {
    if (reason.length < 15) {
      reason = reason.padEnd(15, ' ');
    }
    await this.request('DELETE', `/nfe/${encodeURIComponent(reference)}`, {
      justificativa: reason.slice(0, 255),
    });
    this.logger.log(`FocusNFe: cancelled NF-e ref=${reference}`);
  }

  async downloadXml(reference: string): Promise<string> {
    return this.request<string>('GET', `/nfe/${encodeURIComponent(reference)}/xml`);
  }

  async downloadDanfe(reference: string): Promise<string> {
    return this.request<string>('GET', `/nfe/${encodeURIComponent(reference)}/danfe`);
  }

  async syncStatus(reference: string): Promise<IssuedInvoice> {
    return this.getInvoice(reference);
  }

  isConfigured(): boolean {
    return !!(this.token && this.cnpj && this.razaoSocial);
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  mapStatus(focusStatus: string): InvoiceProviderStatus {
    const map: Record<string, InvoiceProviderStatus> = {
      processando_autorizacao: 'PROCESSING',
      autorizado: 'AUTHORIZED',
      erro_autorizacao: 'REJECTED',
      cancelado: 'CANCELLED',
      denegado: 'REJECTED',
      em_digitacao: 'PENDING',
    };
    return map[focusStatus] ?? 'PROCESSING';
  }

  private mapResponse(reference: string, res: FocusNfeResponse): IssuedInvoice {
    return {
      reference,
      status: this.mapStatus(res.status ?? ''),
      invoiceNumber: res.numero,
      accessKey: res.chave_nfe,
      protocol: res.protocolo,
      xmlUrl: res.url,
      danfeUrl: res.danfe_url,
      issueDate: res.data_emissao ? new Date(res.data_emissao) : undefined,
      cancellationDate: res.data_cancelamento ? new Date(res.data_cancelamento) : undefined,
      errorMessage:
        res.status === 'erro_autorizacao' || res.status === 'denegado'
          ? (res.mensagem_sefaz ?? res.mensagem)
          : undefined,
    };
  }

  private mapPaymentMethod(method: string): string {
    const map: Record<string, string> = {
      PIX: '17',
      CREDIT_CARD: '03',
      DEBIT_CARD: '04',
      BOLETO: '15',
    };
    return map[method] ?? '99'; // 99 = outros
  }

  private buildNfePayload(payload: InvoicePayload, isoDt: string): Record<string, unknown> {
    const { customer, items, total, freight = 0, discount = 0, additionalInfo } = payload;

    const valorProdutos = items.reduce((s, i) => s + i.total, 0);

    // Distribute freight proportionally across items; last item absorbs rounding
    const freightPerItem = items.map((item, idx) => {
      if (freight === 0) return 0;
      if (idx === items.length - 1) {
        const allocated = items
          .slice(0, -1)
          .reduce((s, i) => s + Math.round((i.total / valorProdutos) * freight * 100) / 100, 0);
        return Math.round((freight - allocated) * 100) / 100;
      }
      return Math.round((item.total / valorProdutos) * freight * 100) / 100;
    });

    return {
      natureza_operacao: 'Venda de mercadoria',
      data_emissao: isoDt,
      data_entrada_saida: isoDt,
      tipo_documento: 1,
      finalidade_emissao: 1,
      regime_tributario: Number(this.crt),

      // Emitter
      cnpj_emitente: this.cnpj.replace(/\D/g, ''),
      ie_emitente: this.ie,
      nome_emitente: this.razaoSocial,
      nome_fantasia_emitente: this.nomeFantasia,
      logradouro_emitente: this.logradouro,
      numero_emitente: this.numero,
      bairro_emitente: this.bairro,
      municipio_emitente: this.municipio,
      uf_emitente: this.uf,
      cep_emitente: this.cep.replace(/\D/g, ''),

      // Customer
      ...(customer.cpf ? { cpf_destinatario: customer.cpf.replace(/\D/g, '') } : {}),
      nome_destinatario: customer.name,
      email_destinatario: customer.email,
      indicador_inscricao_estadual_destinatario: 9,
      ...(customer.address
        ? {
            logradouro_destinatario: customer.address.street,
            numero_destinatario: customer.address.number || 'S/N',
            complemento_destinatario: customer.address.complement,
            bairro_destinatario: customer.address.neighborhood,
            municipio_destinatario: customer.address.city,
            uf_destinatario: customer.address.state,
            cep_destinatario: customer.address.cep.replace(/\D/g, ''),
          }
        : {}),

      // Items
      items: items.map((item, idx) => ({
        valor_frete: freightPerItem[idx],
        numero_item: idx + 1,
        codigo_produto: item.sku,
        descricao: item.name,
        cfop: item.cfop || '5102',
        codigo_ncm: (item.ncm?.replace(/\D/g, '') || this.defaultNcm).padStart(8, '0').slice(0, 8),
        unidade_comercial: item.unit ?? 'UN',
        quantidade_comercial: item.quantity,
        valor_unitario_comercial: item.unitPrice,
        valor_bruto: item.total,
        icms_origem: 0,
        icms_situacao_tributaria: '102',
        incluir_no_total: 1,
        pis_situacao_tributaria: '07',
        pis_base_calculo: 0,
        pis_aliquota_porcentual: 0,
        pis_valor: 0,
        cofins_situacao_tributaria: '07',
        cofins_base_calculo: 0,
        cofins_aliquota_porcentual: 0,
        cofins_valor: 0,
      })),

      // Totals
      valor_produtos: valorProdutos,
      valor_frete: freight,
      valor_desconto: discount,
      valor_total: total,
      modalidade_frete: freight > 0 ? 0 : 9,

      // Payment
      formas_pagamento: [
        {
          forma_pagamento: this.mapPaymentMethod(payload.paymentMethod),
          valor_pagamento: total,
        },
      ],

      ...(additionalInfo ? { informacoes_adicionais_contribuinte: additionalInfo } : {}),
    };
  }
}
