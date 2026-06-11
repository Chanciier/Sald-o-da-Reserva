export type OrderStatus =
  | 'PENDING'
  | 'CONFIRMED'
  | 'PAID'
  | 'SEPARATING'
  | 'SEPARATED'
  | 'READY_TO_SHIP'
  | 'SHIPPED'
  | 'DELIVERED'
  | 'CANCELLED'
  | 'REFUNDED';

export type ShipmentStatus =
  | 'PENDING'
  | 'LABEL_PURCHASED'
  | 'SHIPPED'
  | 'IN_TRANSIT'
  | 'DELIVERED'
  | 'CANCELLED';

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

export interface ShipmentEvent {
  id: string;
  event: string;
  status: string | null;
  description: string | null;
  location: string | null;
  createdAt: string;
}

export interface Shipment {
  id: string;
  orderId: string;
  meOrderId: string | null;
  carrier: string;
  service: string;
  serviceId: number;
  serviceCode?: string | null;
  trackingCode: string | null;
  status: ShipmentStatus;
  labelUrl: string | null;
  price: number;
  deliveryMin: number | null;
  deliveryMax: number | null;
  shippedAt: string | null;
  deliveredAt: string | null;
  createdAt: string;
  updatedAt: string;
  events?: ShipmentEvent[];
}

export interface Order {
  id: string;
  userId: string;
  couponId: string | null;
  status: OrderStatus;
  deliveryMethod?: string | null;
  pickupCode?: string | null;
  subtotal: number;
  discount: number;
  shipping: number;
  total: number;
  shippingAddress: ShippingAddress | null;
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
  shipment?: Shipment | null;
  createdAt: string;
  updatedAt: string;
}
