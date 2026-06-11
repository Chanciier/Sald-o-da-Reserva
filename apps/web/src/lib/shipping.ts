import type { ShippingOption } from '@/types/cart';
import type { Shipment } from '@/types/order';

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

export const getShippingQuote = (cep: string, token: string) =>
  apiFetch<ShippingOption[]>(`/shipping/quote?cep=${cep}`, token);

export const getShipment = (orderId: string, token: string) =>
  apiFetch<Shipment | null>(`/shipping/${orderId}`, token);

export const getTracking = (orderId: string, token: string) =>
  apiFetch<Shipment>(`/shipping/${orderId}/tracking`, token);

export const purchaseLabel = (orderId: string, token: string) =>
  apiFetch<{ meOrderId?: string; frenetTicket?: string; labelUrl: string | null }>(
    `/shipping/label/${orderId}`,
    token,
    { method: 'POST' },
  );
