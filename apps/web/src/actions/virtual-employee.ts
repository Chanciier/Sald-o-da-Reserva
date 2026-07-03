import type { Product } from '@/actions/products';
import type { VirtualEmployeeApproveInput, VirtualEmployeeReview } from '@/types/virtual-employee';

const BASE = `${process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001'}/api/v1`;

async function post<T>(path: string, token: string, body: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
    cache: 'no-store',
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((json as { message?: string }).message ?? `Erro ${res.status}`);
  return json as T;
}

/**
 * VirtualEmployeeModule: orquestra Vision → Identification → Pesquisa de
 * mercado → Preço (já com o viés aprendido da categoria) e devolve um painel
 * único para revisão. Nada é persistido nesta etapa.
 */
export async function analyzeVirtualEmployee(
  token: string,
  imageUrls: string[],
): Promise<VirtualEmployeeReview> {
  return post<VirtualEmployeeReview>('/virtual-employee/analyze', token, { imageUrls });
}

/** Operador aprova (com ou sem edições) → cria o produto de verdade. */
export async function approveVirtualEmployee(
  token: string,
  input: VirtualEmployeeApproveInput,
): Promise<Product> {
  return post<Product>('/virtual-employee/approve', token, input);
}
