export interface CartItem {
  productId: string;
  name: string;
  slug: string;
  sku: string;
  price: number;
  salePrice: number | null;
  image: string | null;
  quantity: number;
  stock: number;
  available?: boolean;
}

export interface CartData {
  items: CartItem[];
  couponCode: string | null;
  updatedAt: string;
  recoveryId?: string;
  reminderCreatedAt?: string;
  reminderPushSentAt?: string;
  couponCreatedAt?: string;
  couponPushSentAt?: string;
}

export interface CouponSummary {
  code: string;
  type: string;
  value: number;
  description: string | null;
}

export interface CartResponse {
  items: CartItem[];
  couponCode: string | null;
  coupon: CouponSummary | null;
  subtotal: number;
  discount: number;
  total: number;
  itemCount: number;
  updatedAt: string;
}
