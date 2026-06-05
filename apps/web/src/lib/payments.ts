import type { Payment, CreatePaymentPayload } from '@/types/payment';

const BASE = `${process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001'}/api/v1`;

async function request<T>(path: string, init: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, init);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { message?: string }).message ?? `Erro ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export async function createPayment(
  orderId: string,
  payload: CreatePaymentPayload,
  token: string,
): Promise<Payment> {
  return request<Payment>(`/payments/order/${orderId}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  });
}

export async function getPayment(orderId: string, token: string): Promise<Payment> {
  return request<Payment>(`/payments/order/${orderId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
}

/** Used after confirmCardPayment() to verify the current payment status in the backend. */
export async function getPaymentStatus(paymentId: string, token: string): Promise<Payment> {
  return request<Payment>(`/payments/${paymentId}/status`, {
    headers: { Authorization: `Bearer ${token}` },
  });
}
