const API = `${process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001'}/api/v1`;

export interface InvoiceOrder {
  id: string;
  total: number;
  status: string;
  user: { id: string; name: string | null; email: string };
  items: Array<{ name: string; sku: string; price: number; quantity: number; subtotal: number }>;
  payment: { method: string; status: string; amount: number } | null;
}

export interface Invoice {
  id: string;
  orderId: string;
  focusReference: string | null;
  invoiceNumber: string | null;
  accessKey: string | null;
  protocol: string | null;
  status: 'PENDING' | 'PROCESSING' | 'AUTHORIZED' | 'REJECTED' | 'CANCELLED';
  xmlUrl: string | null;
  danfeUrl: string | null;
  issueDate: string | null;
  cancellationDate: string | null;
  errorMessage: string | null;
  createdAt: string;
  updatedAt: string;
  order: InvoiceOrder;
}

export interface InvoicesResponse {
  data: Invoice[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

async function apiFetch<T>(token: string, path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
    cache: 'no-store',
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: res.statusText }));
    throw new Error((err as { message?: string }).message ?? res.statusText);
  }
  return res.json() as Promise<T>;
}

export async function fetchInvoices(
  token: string,
  params?: Record<string, string | number>,
): Promise<InvoicesResponse> {
  const qs = params
    ? '?' +
      new URLSearchParams(
        Object.fromEntries(Object.entries(params).map(([k, v]) => [k, String(v)])),
      ).toString()
    : '';
  return apiFetch<InvoicesResponse>(token, `/invoices${qs}`);
}

export async function fetchInvoice(token: string, id: string): Promise<Invoice> {
  return apiFetch<Invoice>(token, `/invoices/${id}`);
}

export async function emitInvoice(
  token: string,
  orderId: string,
  overrides?: { cpf?: string; name?: string },
): Promise<Invoice> {
  return apiFetch<Invoice>(token, `/invoices/emit/${orderId}`, {
    method: 'POST',
    body: JSON.stringify(overrides ?? {}),
  });
}

export async function reemitInvoice(token: string, id: string): Promise<Invoice> {
  return apiFetch<Invoice>(token, `/invoices/${id}/reemit`, { method: 'POST' });
}

export async function cancelInvoice(token: string, id: string, reason?: string): Promise<Invoice> {
  return apiFetch<Invoice>(token, `/invoices/${id}`, {
    method: 'DELETE',
    body: JSON.stringify({ reason: reason ?? 'Cancelamento solicitado pelo administrador.' }),
  });
}

export async function syncInvoice(token: string, id: string): Promise<Invoice> {
  return apiFetch<Invoice>(token, `/invoices/${id}/sync`, { method: 'POST' });
}

export async function fetchInvoiceXml(token: string, id: string): Promise<{ url: string | null }> {
  return apiFetch<{ url: string | null }>(token, `/invoices/${id}/xml`);
}

export async function fetchInvoiceDanfe(
  token: string,
  id: string,
): Promise<{ url: string | null }> {
  return apiFetch<{ url: string | null }>(token, `/invoices/${id}/danfe`);
}

/** @deprecated use fetchInvoiceDanfe */
export const fetchInvoicePdf = fetchInvoiceDanfe;
