/**
 * Typed shapes for Stripe next_action fields and related data.
 * These narrow the loose `object` type returned by the Stripe SDK.
 */

export interface StripeBoletoDetails {
  hosted_voucher_url?: string | null;
  number?: string | null;
  expires_at?: number | null;
}

export interface StripePixDetails {
  data?: string | null;
  image_url_png?: string | null;
  expiration_timestamp?: number | null;
}

export interface StripeBillingAddress {
  line1: string;
  line2?: string;
  city: string;
  state: string;
  postal_code: string;
  country: string;
}

export interface StripeBillingDetails {
  name: string;
  email: string;
  address: StripeBillingAddress;
}

/** Shape stored in Order.shippingAddress (Json field) */
export interface ShippingAddressJson {
  name?: string;
  street?: string;
  number?: string;
  complement?: string;
  neighborhood?: string;
  city?: string;
  state?: string;
  cep?: string;
}

/** What payments.service passes to Stripe for a boleto payment */
export interface BoletoPaymentMethodData {
  type: 'boleto';
  billing_details: StripeBillingDetails;
  boleto: { tax_id: string };
}

/** What payments.service passes to Stripe for a PIX payment */
export interface PixPaymentMethodData {
  type: 'pix';
}
