// Meta Pixel helper — all calls are no-ops outside production.
// Uses window.fbq injected by PixelProvider; safe to call before fbq loads
// because fbq queues events internally until the script initializes.

declare global {
  interface Window {
    fbq?: (...args: unknown[]) => void;
    _fbq?: unknown;
  }
}

const isProd = process.env.NEXT_PUBLIC_ENV === 'production';

function fbq(...args: unknown[]) {
  if (!isProd) return;
  if (typeof window === 'undefined') return;
  window.fbq?.(...args);
}

// ── Events ────────────────────────────────────────────────────────────────────

export function pixelPageView() {
  fbq('track', 'PageView');
}

export interface ViewContentParams {
  content_ids: string[];
  content_name: string;
  content_type: 'product';
  value: number;
  currency: 'BRL';
}
export function pixelViewContent(params: ViewContentParams) {
  fbq('track', 'ViewContent', params);
}

export interface AddToCartParams {
  content_ids: string[];
  content_name: string;
  content_type: 'product';
  value: number;
  currency: 'BRL';
}
export function pixelAddToCart(params: AddToCartParams) {
  fbq('track', 'AddToCart', params);
}

export interface InitiateCheckoutParams {
  content_ids: string[];
  num_items: number;
  value: number;
  currency: 'BRL';
}
export function pixelInitiateCheckout(params: InitiateCheckoutParams) {
  fbq('track', 'InitiateCheckout', params);
}

export interface PurchaseParams {
  content_ids: string[];
  num_items: number;
  value: number;
  currency: 'BRL';
}
export function pixelPurchase(params: PurchaseParams) {
  fbq('track', 'Purchase', params);
}
