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

export interface CreatePixPayload {
  orderId: string;
}

export interface CreateCardPayload {
  orderId: string;
  token: string;
  installments: number;
  paymentMethodId: string;
  issuerId?: string;
  identificationNumber?: string;
}

export interface InstallmentOption {
  installments: number;
  recommended_message: string;
  total_amount: number;
}
