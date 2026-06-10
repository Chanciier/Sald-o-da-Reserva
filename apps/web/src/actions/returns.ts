'use server';

const BASE = process.env.NEXT_PUBLIC_API_URL ?? process.env.API_URL ?? 'http://localhost:3001';

export type ReturnReason = 'REGRET' | 'DEFECT' | 'WRONG_ITEM' | 'OTHER';
export type ReturnStatus = 'PENDING' | 'IN_REVIEW' | 'APPROVED' | 'REJECTED' | 'COMPLETED';

export interface ReturnRequest {
  id: string;
  orderId: string;
  userId: string;
  reason: ReturnReason;
  notes: string | null;
  status: ReturnStatus;
  adminNotes: string | null;
  meOrderId: string | null;
  trackingCode: string | null;
  labelUrl: string | null;
  postedAt: string | null;
  returnDeliveredAt: string | null;
  refundId: string | null;
  refundAmount: number | null;
  refundStatus: string | null;
  refundedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export const RETURN_REASON_LABEL: Record<ReturnReason, string> = {
  REGRET: 'Arrependimento',
  DEFECT: 'Defeito',
  WRONG_ITEM: 'Produto incorreto',
  OTHER: 'Outro',
};

export const RETURN_STATUS_LABEL: Record<ReturnStatus, string> = {
  PENDING: 'Solicitada',
  IN_REVIEW: 'Em análise',
  APPROVED: 'Aprovada',
  REJECTED: 'Recusada',
  COMPLETED: 'Concluída',
};

async function apiFetch(path: string, token: string, options?: RequestInit) {
  const res = await fetch(`${BASE}/api/v1${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...(options?.headers ?? {}),
    },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { message?: string }).message ?? `Erro ${res.status}`);
  return data;
}

export async function createReturnRequest(
  token: string,
  orderId: string,
  reason: ReturnReason,
  notes?: string,
): Promise<ReturnRequest> {
  return apiFetch('/returns', token, {
    method: 'POST',
    body: JSON.stringify({ orderId, reason, notes }),
  });
}

export async function getReturnsByOrder(token: string, orderId: string): Promise<ReturnRequest[]> {
  return apiFetch(`/returns/order/${orderId}`, token);
}

export async function getMyReturns(token: string): Promise<ReturnRequest[]> {
  return apiFetch('/returns/my', token);
}

export async function syncReturnTracking(token: string, id: string): Promise<ReturnRequest> {
  return apiFetch(`/returns/${id}/sync-tracking`, token, { method: 'POST' });
}

export async function processReturnRefund(
  token: string,
  id: string,
  amount?: number,
): Promise<ReturnRequest> {
  return apiFetch(`/returns/${id}/refund`, token, {
    method: 'POST',
    body: JSON.stringify(amount !== undefined ? { amount } : {}),
  });
}
