export type OrderStatus =
  | 'PENDING'
  | 'CONFIRMED'
  | 'PAID'
  | 'SHIPPED'
  | 'DELIVERED'
  | 'CANCELLED'
  | 'REFUNDED';

export interface ShippingAddress {
  name: string;
  cep: string;
  street: string;
  number: string;
  complement?: string;
  neighborhood: string;
  city: string;
  state: string;
}

export interface OrderItem {
  id: string;
  productId: string;
  name: string;
  sku: string;
  price: number;
  quantity: number;
  subtotal: number;
  product?: {
    images?: { url: string }[];
  };
}

export interface Order {
  id: string;
  userId: string;
  couponId: string | null;
  status: OrderStatus;
  subtotal: number;
  discount: number;
  shipping: number;
  total: number;
  shippingAddress: ShippingAddress;
  shippingMethod: string;
  notes: string | null;
  coupon: { code: string; type?: string; value?: number } | null;
  items: OrderItem[];
  payment?: {
    id: string;
    method: string;
    status: string;
    amount: number;
  } | null;
  createdAt: string;
  updatedAt: string;
}
