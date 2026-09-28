const API = `${process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001'}/api/v1`;

export interface InvoiceOrder {
  id: string;
  total: number;
  status: string;
  user: { id: string; name: string | null; email: string };
  items: Array<{ name: string; sku: string; price: number; quantity: number; subtotal: number }>;
  payment: { method: string; status: string; amount: number } | null;
}

export type ManualPaymentMethod =
  | 'PIX'
  | 'CREDIT_CARD'
  | 'DEBIT_CARD'
  | 'BOLETO'
  | 'CASH'
  | 'OTHER';

export interface ManualInvoiceInput {
  buyer: {
    name: string;
    document: string;
    email?: string;
    address: {
      cep: string;
      street: string;
      number: string;
      complement?: string;
      neighborhood: string;
      city: string;
      state: string;
    };
  };
  items: Array<{
    description: string;
    sku?: string;
    ncm?: string;
    quantity: number;
    unitPrice: number;
  }>;
  paymentMethod: ManualPaymentMethod;
  inPerson?: boolean;
  additionalInfo?: string;
}

export interface ManualInvoiceData extends Omit<ManualInvoiceInput, 'items'> {
  items: Array<{
    description: string;
    sku: string;
    ncm?: string;
    quantity: number;
    unitPrice: number;
    total: number;
  }>;
  total: number;
}

export interface Invoice {
  id: string;
  orderId: string | null;
  manualData: ManualInvoiceData | null;
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
  order: InvoiceOrder | null;
}

export interface InvoiceView {
  isManual: boolean;
  reference: string;
  customerName: string | null;
  customerEmail: string | null;
  customerDocument: string | null;
  total: number;
  paymentMethod: string | null;
  paymentStatus: string | null;
  items: Array<{ name: string; sku: string; quantity: number; price: number; subtotal: number }>;
}

export function invoiceView(inv: Invoice): InvoiceView {
  if (inv.order) {
    return {
      isManual: false,
      reference: `Pedido ${inv.order.id.slice(-8).toUpperCase()}`,
      customerName: inv.order.user.name,
      customerEmail: inv.order.user.email,
      customerDocument: null,
      total: Number(inv.order.total),
      paymentMethod: inv.order.payment?.method ?? null,
      paymentStatus: inv.order.payment?.status ?? null,
      items: inv.order.items,
    };
  }
  const data = inv.manualData;
  return {
    isManual: true,
    reference: 'Venda avulsa',
    customerName: data?.buyer.name ?? null,
    customerEmail: data?.buyer.email ?? null,
    customerDocument: data?.buyer.document ?? null,
    total: data?.total ?? 0,
    paymentMethod: data?.paymentMethod ?? null,
    paymentStatus: null,
    items: (data?.items ?? []).map((i) => ({
      name: i.description,
      sku: i.sku,
      quantity: i.quantity,
      price: i.unitPrice,
      subtotal: i.total,
    })),
  };
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

export async function emitManualInvoice(
  token: string,
  input: ManualInvoiceInput,
): Promise<Invoice> {
  return apiFetch<Invoice>(token, '/invoices/manual', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export async function reemitInvoice(
  token: string,
  id: string,
  overrides?: { cpf?: string; name?: string },
): Promise<Invoice> {
  return apiFetch<Invoice>(token, `/invoices/${id}/reemit`, {
    method: 'POST',
    body: JSON.stringify(overrides ?? {}),
  });
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
