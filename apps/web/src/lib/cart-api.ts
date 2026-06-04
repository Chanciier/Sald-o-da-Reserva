import type { Cart, ShippingOption } from '@/types/cart';
import type { Order } from '@/types/order';

const BASE = `${process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001'}/api/v1`;

async function apiFetch<T>(path: string, token: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...(options.headers as Record<string, string>),
    },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { message?: string }).message ?? `Erro ${res.status}`);
  return data as T;
}

export const getCart = (token: string) => apiFetch<Cart>('/cart', token);

export const addToCart = (token: string, productId: string, quantity = 1) =>
  apiFetch<Cart>('/cart/items', token, {
    method: 'POST',
    body: JSON.stringify({ productId, quantity }),
  });

export const updateCartItem = (token: string, productId: string, quantity: number) =>
  apiFetch<Cart>(`/cart/items/${productId}`, token, {
    method: 'PUT',
    body: JSON.stringify({ quantity }),
  });

export const removeCartItem = (token: string, productId: string) =>
  apiFetch<Cart>(`/cart/items/${productId}`, token, { method: 'DELETE' });

export const clearCart = (token: string) => apiFetch<void>('/cart', token, { method: 'DELETE' });

export const applyCoupon = (token: string, code: string) =>
  apiFetch<Cart>('/cart/coupon', token, {
    method: 'POST',
    body: JSON.stringify({ code }),
  });

export const removeCoupon = (token: string) =>
  apiFetch<Cart>('/cart/coupon', token, { method: 'DELETE' });

export const getShippingOptions = (token: string, subtotal: number, cep?: string) =>
  apiFetch<ShippingOption[]>(
    `/checkout/shipping?subtotal=${subtotal}${cep ? `&cep=${cep}` : ''}`,
    token,
  );

export const createOrder = (token: string, body: unknown) =>
  apiFetch<Order>('/checkout', token, {
    method: 'POST',
    body: JSON.stringify(body),
  });

export const getOrders = (token: string) => apiFetch<Order[]>('/orders', token);

export const getOrder = (token: string, id: string) => apiFetch<Order>(`/orders/${id}`, token);
