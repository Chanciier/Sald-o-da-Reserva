import type { Category, PaginatedResult, Product, ProductQuery } from '@/types/product';

const BASE = `${process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001'}/api/v1`;

async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, options);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { message?: string }).message ?? `HTTP ${res.status}`);
  }
  return res.json() as Promise<T>;
}

function toQueryString(params: Record<string, unknown>): string {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== '') qs.set(k, String(v));
  }
  return qs.toString();
}

export async function getProducts(query: ProductQuery = {}): Promise<PaginatedResult<Product>> {
  const qs = toQueryString(query as Record<string, unknown>);
  return apiFetch<PaginatedResult<Product>>(`/products${qs ? `?${qs}` : ''}`, {
    cache: 'no-store',
  });
}

export async function getProduct(slug: string): Promise<Product> {
  return apiFetch<Product>(`/products/${slug}`, { next: { revalidate: 300 } });
}

export async function getCategories(): Promise<PaginatedResult<Category>> {
  return apiFetch<PaginatedResult<Category>>('/categories?limit=100', {
    next: { revalidate: 1800 },
  });
}

export async function getCategory(slug: string): Promise<Category> {
  return apiFetch<Category>(`/categories/${slug}`, { next: { revalidate: 1800 } });
}
