export interface MpPayer {
  email?: string;
  first_name?: string;
  last_name?: string;
  identification?: { type?: string; number?: string };
}

export interface MpPaymentResponse {
  id?: number;
  status?: string;
  status_detail?: string;
  payment_method_id?: string;
  transaction_amount?: number;
  date_of_expiration?: string;
  point_of_interaction?: {
    transaction_data?: {
      qr_code?: string;
      qr_code_base64?: string;
      ticket_url?: string;
    };
  };
  card?: {
    first_six_digits?: string;
    last_four_digits?: string;
  };
  payment_method?: {
    id?: string;
    type?: string;
  };
  installments?: number;
  payer?: MpPayer;
}

export interface MpWebhookPayload {
  action?: string;
  type?: string;
  data?: { id?: string };
  live_mode?: boolean;
}
