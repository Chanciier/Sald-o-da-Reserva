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
}

export interface CouponSummary {
  code: string;
  type: 'PERCENT' | 'FIXED';
  value: number;
  description: string | null;
}

export interface Cart {
  items: CartItem[];
  couponCode: string | null;
  coupon: CouponSummary | null;
  subtotal: number;
  discount: number;
  total: number;
  itemCount: number;
  updatedAt: string;
}

export interface ShippingOption {
  method: 'PAC' | 'SEDEX' | 'FREE';
  name: string;
  description: string;
  price: number;
}
