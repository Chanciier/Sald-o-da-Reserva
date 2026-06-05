import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MercadoPagoConfig, Payment } from 'mercadopago';
import { PaymentStatus } from '@prisma/client';
import type { MpPaymentResponse } from './mercadopago.types';

export interface MpCreatePixInput {
  amount: number;
  description: string;
  payerEmail: string;
  payerName: string;
  orderId: string;
  idempotencyKey: string;
}

export interface MpCreateCardInput {
  amount: number;
  description: string;
  token: string;
  installments: number;
  paymentMethodId: string;
  issuerId?: string;
  payerEmail: string;
  payerName: string;
  identificationNumber?: string;
  orderId: string;
  idempotencyKey: string;
}

@Injectable()
export class MercadoPagoService {
  private readonly logger = new Logger(MercadoPagoService.name);
  private readonly accessToken: string;
  private readonly webhookUrl: string;
  private readonly client: MercadoPagoConfig | null;
  private readonly paymentApi: Payment | null;

  constructor(private readonly config: ConfigService) {
    this.accessToken = this.config.get<string>('MERCADO_PAGO_ACCESS_TOKEN', '');
    const port = this.config.get<number>('PORT', 3001);
    const apiPublicUrl =
      this.config.get<string>('API_PUBLIC_URL', '') || `http://localhost:${port}`;
    const cleanUrl = apiPublicUrl.replace(/\/$/, '');
    // MP rejects localhost URLs — only set webhook URL in production/ngrok
    this.webhookUrl = /localhost|127\.0\.0\.1/.test(cleanUrl)
      ? ''
      : `${cleanUrl}/api/v1/payments/webhook`;

    if (!this.accessToken) {
      this.logger.warn('MERCADO_PAGO_ACCESS_TOKEN não configurado.');
      this.client = null;
      this.paymentApi = null;
    } else {
      this.client = new MercadoPagoConfig({ accessToken: this.accessToken });
      this.paymentApi = new Payment(this.client);
    }
  }

  isConfigured(): boolean {
    return Boolean(this.accessToken && this.paymentApi);
  }

  async createPix(input: MpCreatePixInput): Promise<MpPaymentResponse> {
    this.ensureConfigured();
    const { firstName, lastName } = splitName(input.payerName);

    const expiration = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

    const result = await this.paymentApi!.create({
      body: {
        transaction_amount: input.amount,
        description: input.description,
        payment_method_id: 'pix',
        date_of_expiration: expiration,
        payer: {
          email: input.payerEmail,
          first_name: firstName,
          last_name: lastName,
        },
        ...(this.webhookUrl ? { notification_url: this.webhookUrl } : {}),
        external_reference: input.orderId,
        metadata: { order_id: input.orderId },
      },
      requestOptions: { idempotencyKey: input.idempotencyKey },
    });

    return result as MpPaymentResponse;
  }

  async createCard(input: MpCreateCardInput): Promise<MpPaymentResponse> {
    this.ensureConfigured();
    const { firstName, lastName } = splitName(input.payerName);
    const doc = (input.identificationNumber ?? '').replace(/\D/g, '');

    const body: Record<string, unknown> = {
      transaction_amount: input.amount,
      description: input.description,
      token: input.token,
      installments: input.installments,
      payment_method_id: input.paymentMethodId,
      payer: {
        email: input.payerEmail,
        first_name: firstName,
        last_name: lastName,
        ...(doc ? { identification: { type: doc.length > 11 ? 'CNPJ' : 'CPF', number: doc } } : {}),
      },
      ...(this.webhookUrl ? { notification_url: this.webhookUrl } : {}),
      external_reference: input.orderId,
      metadata: { order_id: input.orderId },
    };

    if (input.issuerId) body.issuer_id = input.issuerId;

    const result = await this.paymentApi!.create({
      body,
      requestOptions: { idempotencyKey: input.idempotencyKey },
    });

    return result as MpPaymentResponse;
  }

  async getPayment(mpPaymentId: string): Promise<MpPaymentResponse> {
    this.ensureConfigured();
    const result = await this.paymentApi!.get({ id: mpPaymentId });
    return result as MpPaymentResponse;
  }

  mapStatus(mpStatus?: string): PaymentStatus {
    switch (mpStatus) {
      case 'approved':
        return 'APPROVED';
      case 'authorized':
        return 'AUTHORIZED';
      case 'in_process':
        return 'IN_PROCESS';
      case 'in_mediation':
        return 'IN_MEDIATION';
      case 'rejected':
        return 'REJECTED';
      case 'cancelled':
        return 'CANCELLED';
      case 'refunded':
        return 'REFUNDED';
      case 'charged_back':
        return 'CHARGED_BACK';
      case 'pending':
      default:
        return 'PENDING';
    }
  }

  extractPix(mp: MpPaymentResponse) {
    const tx = mp.point_of_interaction?.transaction_data;
    const base64 = tx?.qr_code_base64;
    return {
      pixQrCode: tx?.qr_code ?? null,
      pixQrCodeBase64: base64 ? `data:image/png;base64,${base64}` : null,
      pixExpiresAt: mp.date_of_expiration ? new Date(mp.date_of_expiration) : null,
    };
  }

  extractCard(mp: MpPaymentResponse) {
    return {
      cardBrand: mp.payment_method_id ?? mp.payment_method?.id ?? null,
      cardLast4: mp.card?.last_four_digits ?? null,
      installments: mp.installments ?? null,
    };
  }

  private ensureConfigured() {
    if (!this.isConfigured()) {
      throw new BadRequestException('Gateway de pagamento não configurado. Contate o suporte.');
    }
  }
}

function splitName(fullName: string) {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return { firstName: 'Cliente', lastName: 'Saldão' };
  if (parts.length === 1) return { firstName: parts[0], lastName: 'Saldão' };
  return { firstName: parts[0], lastName: parts.slice(1).join(' ') };
}
