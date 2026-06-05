export type PaymentMethod = 'PIX' | 'CREDIT_CARD' | 'DEBIT_CARD' | 'BOLETO';

export type PaymentStatus =
  | 'PENDING'
  | 'APPROVED'
  | 'AUTHORIZED'
  | 'REJECTED'
  | 'CANCELLED'
  | 'REFUNDED';

export interface Payment {
  id: string;
  orderId: string;
  gatewayPaymentId: string | null;
  clientSecret: string | null;
  method: PaymentMethod;
  status: PaymentStatus;
  amount: number;
  pixQrCode: string | null;
  pixQrCodeBase64: string | null;
  pixExpiresAt: string | null;
  boletoUrl: string | null;
  boletoCode: string | null;
  boletoExpiresAt: string | null;
  cardBrand: string | null;
  cardLast4: string | null;
  installments: number | null;
  rawStatus: string | null;
  statusDetail: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreatePaymentPayload {
  method: PaymentMethod;
  /** CPF/CNPJ — obrigatório para BOLETO */
  taxId?: string;
}

export interface BillingAddress {
  line1: string;
  line2?: string | null;
  city: string;
  state: string;
  postalCode: string;
  country: string;
}

export interface BoletoPaymentResult {
  boletoUrl: string | null;
  boletoCode: string | null;
  boletoExpiresAt: string | null;
}

export interface PixPaymentResult {
  pixQrCode: string | null;
  pixQrCodeBase64: string | null;
  pixExpiresAt: string | null;
}

export interface CardPaymentResult {
  clientSecret: string;
  cardBrand: string | null;
  cardLast4: string | null;
  installments: number | null;
}

/** Stripe status values mapped in the backend */
export type StripePaymentIntentStatus =
  | 'requires_payment_method'
  | 'requires_confirmation'
  | 'requires_action'
  | 'processing'
  | 'requires_capture'
  | 'canceled'
  | 'succeeded';
