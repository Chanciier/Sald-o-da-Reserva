export type AdminSection =
  | 'DASHBOARD'
  | 'PRODUTOS'
  | 'PRODUTOS_CRIAR'
  | 'PRODUTOS_EDITAR'
  | 'PEDIDOS'
  | 'VENDAS'
  | 'CLIENTES'
  | 'CUPONS'
  | 'CONFIGURACOES'
  | 'RELATORIOS'
  | 'FINANCEIRO';

export type SectionAccessMode = 'NONE' | 'FREE' | 'PASSWORD' | 'AUTHORIZATION';

export const SECTION_LABELS: Record<AdminSection, string> = {
  DASHBOARD: 'Dashboard',
  PRODUTOS: 'Produtos',
  PRODUTOS_CRIAR: 'Criar Produto',
  PRODUTOS_EDITAR: 'Editar Produto',
  PEDIDOS: 'Pedidos',
  VENDAS: 'Vendas',
  CLIENTES: 'Clientes',
  CUPONS: 'Cupons',
  CONFIGURACOES: 'Configurações',
  RELATORIOS: 'Relatórios',
  FINANCEIRO: 'Financeiro',
};

export const MODE_LABELS: Record<SectionAccessMode, string> = {
  NONE: 'Sem acesso',
  FREE: 'Acesso livre',
  PASSWORD: 'Acesso com senha',
  AUTHORIZATION: 'Após autorização',
};

export const ADMIN_SECTIONS = Object.keys(SECTION_LABELS) as AdminSection[];

export interface SectionState {
  section: AdminSection;
  label: string;
  mode: SectionAccessMode;
  unlocked: boolean;
  hasPendingRequest?: boolean;
}

export interface PendingRequest {
  id: string;
  section: AdminSection;
  message: string | null;
  createdAt: string;
}

export interface VendedorPermissions {
  id: string;
  name: string | null;
  email: string;
  isActive: boolean;
  createdAt: string;
  permissions: SectionState[];
  pendingRequests: PendingRequest[];
}

export interface SectionPermissionUpdate {
  section: AdminSection;
  mode: SectionAccessMode;
  password?: string;
}

const BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

async function apiFetch<T>(path: string, token: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}/api/v1${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...(options?.headers ?? {}),
    },
    cache: 'no-store',
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { message?: string }).message ?? `Erro ${res.status}`);
  return data as T;
}

export function listSellerPermissions(token: string) {
  return apiFetch<VendedorPermissions[]>('/seller-permissions/vendedores', token);
}

export function getMySellerPermissions(token: string) {
  return apiFetch<SectionState[]>('/seller-permissions/me', token);
}

export function updateSellerPermissions(
  token: string,
  userId: string,
  permissions: SectionPermissionUpdate[],
) {
  return apiFetch<SectionState[]>(`/seller-permissions/vendedores/${userId}`, token, {
    method: 'PATCH',
    body: JSON.stringify({ permissions }),
  });
}

export function requestSectionAccess(token: string, section: AdminSection, message?: string) {
  return apiFetch('/seller-permissions/request', token, {
    method: 'POST',
    body: JSON.stringify({ section, message }),
  });
}

export function approveAccessRequest(token: string, requestId: string) {
  return apiFetch(`/seller-permissions/requests/${requestId}/approve`, token, { method: 'PATCH' });
}

export function denyAccessRequest(token: string, requestId: string) {
  return apiFetch(`/seller-permissions/requests/${requestId}/deny`, token, { method: 'PATCH' });
}

export function validateSectionPassword(token: string, section: AdminSection, password: string) {
  return apiFetch<{ granted: boolean; expiresAt: string }>(
    '/seller-permissions/validate-password',
    token,
    {
      method: 'POST',
      body: JSON.stringify({ section, password }),
    },
  );
}
