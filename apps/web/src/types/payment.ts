export type PaymentMethod = 'PIX' | 'CREDIT_CARD' | 'DEBIT_CARD' | 'BOLETO';

export type PaymentStatus =
  | 'PENDING'
  | 'APPROVED'
  | 'AUTHORIZED'
  | 'IN_PROCESS'
  | 'IN_MEDIATION'
  | 'REJECTED'
  | 'CANCELLED'
  | 'REFUNDED'
  | 'CHARGED_BACK';

export interface Payment {
  id: string;
  orderId: string;
  mpPaymentId: string | null;
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
  cardToken?: string;
  paymentMethodId?: string;
  installments?: number;
  boletoMethod?: string;
  payer?: {
    identification?: { type: 'CPF' | 'CNPJ'; number: string };
  };
}
