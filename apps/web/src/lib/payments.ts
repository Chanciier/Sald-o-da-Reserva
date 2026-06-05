import type { CreateCardPayload, CreatePixPayload, Payment } from '@/types/payment';

const BASE = `${process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001'}/api/v1`;

async function request<T>(path: string, init: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, init);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { message?: string }).message ?? `Erro ${res.status}`);
  }
  return res.json() as Promise<T>;
}

function authHeaders(token: string) {
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
  };
}

/** POST /payments/pix */
export async function createPixPayment(payload: CreatePixPayload, token: string): Promise<Payment> {
  return request<Payment>('/payments/pix', {
    method: 'POST',
    headers: authHeaders(token),
    body: JSON.stringify(payload),
  });
}

/** POST /payments/card */
export async function createCardPayment(
  payload: CreateCardPayload,
  token: string,
): Promise<Payment> {
  return request<Payment>('/payments/card', {
    method: 'POST',
    headers: authHeaders(token),
    body: JSON.stringify(payload),
  });
}

/** GET /payments/:id — consulta status (sincroniza com Mercado Pago) */
export async function getPaymentById(paymentId: string, token: string): Promise<Payment> {
  return request<Payment>(`/payments/${paymentId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
}

/** GET /payments/order/:orderId */
export async function getPaymentByOrder(orderId: string, token: string): Promise<Payment> {
  return request<Payment>(`/payments/order/${orderId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
}

/** @deprecated use getPaymentById */
export async function getPaymentStatus(paymentId: string, token: string): Promise<Payment> {
  return getPaymentById(paymentId, token);
}

/** @deprecated use createPixPayment or createCardPayment */
export async function getPayment(orderId: string, token: string): Promise<Payment> {
  return getPaymentByOrder(orderId, token);
}
