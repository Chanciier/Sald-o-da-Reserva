import type { Product, ProductQuery, PaginatedResult } from '@/types/product';

export type Badge = 'novo' | 'oferta' | 'ultimas' | 'visualizado';

export const badgeLabels: Record<Badge, string> = {
  novo: 'Chegou agora',
  oferta: 'Oferta',
  ultimas: 'Últimas unidades',
  visualizado: 'Muito visto',
};

export function hasDiscount(p: Product): boolean {
  return p.salePrice != null && p.salePrice < p.price;
}

export function effectivePrice(p: Product): number {
  return hasDiscount(p) ? (p.salePrice as number) : p.price;
}

export function discountPercent(p: Product): number {
  return hasDiscount(p) ? Math.round((1 - (p.salePrice as number) / p.price) * 100) : 0;
}

export function formatBRL(v: number): string {
  return v.toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  });
}

// Deterministic string hash (FNV-1a-ish), SSR-safe.
function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function pseudoViews(p: Product): number {
  return 80 + (hash(p.id) % 600);
}

export function pseudoSaves(p: Product): number {
  return Math.round(pseudoViews(p) * 0.18);
}

export function deriveBadges(p: Product): Badge[] {
  const badges: Badge[] = [];

  const ageDays = (Date.now() - new Date(p.createdAt).getTime()) / 86400000;
  if (ageDays <= 14) badges.push('novo');

  if (hasDiscount(p)) badges.push('oferta');

  if (p.stock > 0 && p.stock <= 3) badges.push('ultimas');

  if (badges.length < 2 && pseudoViews(p) > 400) badges.push('visualizado');

  return badges.slice(0, 2);
}

// Deterministic seeded shuffle (LCG) to mix categories per page.
export function shuffleWithSeed<T>(arr: T[], seed: number): T[] {
  const result = [...arr];
  let s = seed;
  for (let i = result.length - 1; i > 0; i--) {
    s = (s * 9301 + 49297) % 233280;
    const j = Math.floor((s / 233280) * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

export async function clientGetProducts(query: ProductQuery): Promise<PaginatedResult<Product>> {
  const base = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';
  const params = new URLSearchParams();

  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null || value === '') continue;
    params.append(key, String(value));
  }

  const qs = params.toString();
  const url = `${base}/api/v1/products${qs ? `?${qs}` : ''}`;

  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) {
    throw new Error(`Failed to fetch products: ${res.status}`);
  }
  return res.json() as Promise<PaginatedResult<Product>>;
}
