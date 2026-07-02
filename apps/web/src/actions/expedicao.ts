const API = `${process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001'}/api/v1`;

export interface EnvioStats {
  aguardandoSeparacao: number;
  emSeparacao: number;
  prontos: number;
  emTransito: number;
  entreguesHoje: number;
}

export interface RetiradaStats {
  aguardandoSeparacao: number;
  emSeparacao: number;
  separados: number;
  aguardandoRetirada: number;
  retiradosHoje: number;
}

export interface ExpedicaoStats {
  aguardandoSeparacao: number;
  aguardandoNFe: number;
  aguardandoEtiqueta: number;
  enviadosHoje: number;
  retiradosHoje: number;
  envio: EnvioStats;
  retirada: RetiradaStats;
}

export interface TimelineEvent {
  id: string;
  status: string;
  title: string;
  description: string | null;
  actor: string | null;
  createdAt: string;
}

export interface OrderDetailItem {
  id: string;
  productId: string;
  name: string;
  sku: string;
  quantity: number;
  price: number;
  subtotal: number;
  image: string | null;
}

export type OrderChannel = 'SITE' | 'MERCADO_LIVRE' | 'SHOPEE';

export interface ExpedicaoOrderDetail {
  id: string;
  status: string;
  channel: OrderChannel;
  externalId: string | null;
  deliveryMethod: 'SHIPPING' | 'PICKUP';
  pickupCode: string | null;
  customerPhone: string | null;
  buyerName: string | null;
  separatedItems: string[] | null;
  separationNotes: string | null;
  notes: string | null;
  total: number;
  subtotal: number;
  discount: number;
  shipping: number;
  shippingMethod: string;
  shippingAddress: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
  user: { id: string; name: string | null; email: string };
  items: OrderDetailItem[];
  shipment: {
    carrier: string;
    service: string;
    trackingCode: string | null;
    status: string;
    labelUrl: string | null;
    deliveryMin: number | null;
    deliveryMax: number | null;
  } | null;
  statusEvents: TimelineEvent[];
}

export interface OrderSummary {
  id: string;
  status: string;
  channel: OrderChannel;
  buyerName: string | null;
  deliveryMethod: 'SHIPPING' | 'PICKUP';
  pickupCode: string | null;
  separatedItems: string[] | null;
  total: number;
  subtotal: number;
  discount: number;
  shipping: number;
  shippingMethod: string;
  createdAt: string;
  updatedAt: string;
  user: { id: string; name: string | null; email: string };
  _count: { items: number };
  payment: { method: string; status: string } | null;
  shipment: { carrier: string; trackingCode: string | null; status: string } | null;
  invoices: Array<{
    id: string;
    status: string;
    invoiceNumber: string | null;
    danfeUrl: string | null;
  }>;
}

export interface OrderShipped extends OrderSummary {
  shipment: { carrier: string; trackingCode: string | null; status: string };
}

export interface ExpedicaoListResponse {
  data: OrderSummary[];
  total: number;
  page: number;
  pages: number;
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

function qs(params?: Record<string, string | number | undefined>) {
  if (!params) return '';
  const entries = Object.entries(params).filter(([, v]) => v !== undefined && v !== '');
  if (!entries.length) return '';
  return '?' + new URLSearchParams(entries.map(([k, v]) => [k, String(v)])).toString();
}

export async function fetchExpedicaoStats(token: string): Promise<ExpedicaoStats> {
  return apiFetch<ExpedicaoStats>(token, '/expedicao/stats');
}

export async function fetchFila(
  token: string,
  params?: { page?: number; search?: string; deliveryMethod?: string },
): Promise<ExpedicaoListResponse> {
  return apiFetch<ExpedicaoListResponse>(token, `/expedicao/fila${qs(params)}`);
}

export async function fetchSeparacao(
  token: string,
  params?: { page?: number; deliveryMethod?: string },
): Promise<ExpedicaoListResponse> {
  return apiFetch<ExpedicaoListResponse>(token, `/expedicao/separacao${qs(params)}`);
}

export async function fetchProntos(
  token: string,
  params?: { page?: number; deliveryMethod?: string },
): Promise<ExpedicaoListResponse> {
  return apiFetch<ExpedicaoListResponse>(token, `/expedicao/prontos${qs(params)}`);
}

export async function fetchEnviados(
  token: string,
  params?: { page?: number; search?: string },
): Promise<ExpedicaoListResponse> {
  return apiFetch<ExpedicaoListResponse>(token, `/expedicao/enviados${qs(params)}`);
}

export async function fetchRetirada(
  token: string,
  params?: { page?: number; grupo?: 'separados' | 'prontos'; search?: string },
): Promise<ExpedicaoListResponse> {
  return apiFetch<ExpedicaoListResponse>(token, `/expedicao/retirada${qs(params)}`);
}

export async function fetchConcluidos(
  token: string,
  params?: { page?: number; search?: string; deliveryMethod?: string },
): Promise<ExpedicaoListResponse> {
  return apiFetch<ExpedicaoListResponse>(token, `/expedicao/concluidos${qs(params)}`);
}

export async function iniciarSeparacao(
  token: string,
  orderId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    await apiFetch(token, `/expedicao/${orderId}/iniciar-separacao`, { method: 'PATCH' });
    return { ok: true };
  } catch (err) {
    return { ok: false, error: (err as Error).message ?? 'Erro ao iniciar separação.' };
  }
}

export async function fetchExpedicaoOrder(
  token: string,
  orderId: string,
): Promise<ExpedicaoOrderDetail> {
  return apiFetch<ExpedicaoOrderDetail>(token, `/expedicao/${orderId}`);
}

export async function atualizarItensSeparados(
  token: string,
  orderId: string,
  separatedItems: string[],
) {
  return apiFetch(token, `/expedicao/${orderId}/itens-separados`, {
    method: 'PATCH',
    body: JSON.stringify({ separatedItems }),
  });
}

export async function salvarObservacao(token: string, orderId: string, separationNotes: string) {
  return apiFetch(token, `/expedicao/${orderId}/observacao`, {
    method: 'PATCH',
    body: JSON.stringify({ separationNotes }),
  });
}

export async function finalizarSeparacao(token: string, orderId: string) {
  return apiFetch(token, `/expedicao/${orderId}/finalizar-separacao`, { method: 'PATCH' });
}

export async function marcarPronto(token: string, orderId: string) {
  return apiFetch(token, `/expedicao/${orderId}/marcar-pronto`, { method: 'PATCH' });
}

export async function marcarEnviado(token: string, orderId: string) {
  return apiFetch(token, `/expedicao/${orderId}/marcar-enviado`, { method: 'PATCH' });
}

/**
 * Baixa a etiqueta do Mercado Livre (PDF protegido por token) e abre numa nova
 * aba. Como o endpoint exige Authorization, buscamos como blob e geramos a URL.
 */
export async function abrirEtiquetaMl(token: string, orderId: string): Promise<void> {
  const res = await fetch(`${API}/marketplaces/ml/orders/${orderId}/label`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: 'no-store',
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: 'Falha ao obter etiqueta.' }));
    throw new Error((err as { message?: string }).message ?? 'Falha ao obter etiqueta.');
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  window.open(url, '_blank', 'noopener,noreferrer');
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

export async function confirmarRetirada(token: string, orderId: string) {
  return apiFetch(token, `/expedicao/${orderId}/confirmar-retirada`, { method: 'PATCH' });
}

export async function cancelarPedido(
  token: string,
  orderId: string,
): Promise<{ ok: true; refundError?: string } | { ok: false; error: string }> {
  try {
    const result = await apiFetch<{ ok: true; refundError?: string }>(
      token,
      `/expedicao/${orderId}/cancelar`,
      { method: 'PATCH' },
    );
    return result;
  } catch (err) {
    return { ok: false, error: (err as Error).message ?? 'Erro ao cancelar pedido.' };
  }
}

export async function batchExpedicao(token: string, ids: string[], action: string) {
  return apiFetch<{ success: string[]; failed: string[] }>(token, '/expedicao/batch', {
    method: 'POST',
    body: JSON.stringify({ ids, action }),
  });
}
