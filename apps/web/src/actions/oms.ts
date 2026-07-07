const BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

async function apiGet<T>(path: string, token: string): Promise<T> {
  const res = await fetch(`${BASE}/api/v1${path}`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: 'no-store',
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { message?: string }).message ?? `Erro ${res.status}`);
  return data as T;
}

async function apiPost<T>(path: string, token: string): Promise<T> {
  const res = await fetch(`${BASE}/api/v1${path}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { message?: string }).message ?? `Erro ${res.status}`);
  return data as T;
}

export type Marketplace = 'SITE' | 'MERCADO_LIVRE' | 'SHOPEE';

export interface OmsDashboard {
  ordersToday: number;
  paymentsApprovedToday: number;
  productsSold: number;
  awaitingSeparation: number;
  publicationErrors: number;
  activeProductsByMarketplace: Record<Marketplace, number>;
  revenueToday: number;
  criticalAlerts: { level: 'warning' | 'error'; message: string }[];
}

export interface MarketplaceHealth {
  marketplace: Marketplace;
  connected: boolean;
  publishedCount: number;
  errorCount: number;
  lastSyncAt: string | null;
  queuedJobs: number;
  deadLetterJobs: number;
  importedOrders: number;
}

export function fetchOmsDashboard(token: string) {
  return apiGet<OmsDashboard>('/oms/dashboard', token);
}

export function fetchMarketplacesHealth(token: string) {
  return apiGet<MarketplaceHealth[]>('/marketplaces/health', token);
}

export function retryFailedPublications(token: string, marketplace: Marketplace) {
  return apiPost<{ enqueued: boolean; count: number }>(
    `/marketplaces/${marketplace}/retry-failed`,
    token,
  );
}

export function syncAllProducts(token: string, marketplace: Marketplace) {
  return apiPost<{ enqueued: boolean; count: number }>(
    `/marketplaces/${marketplace}/sync-all`,
    token,
  );
}

/** Retorna a URL de autorização da Shopee — o admin é redirecionado para lá. */
export function getShopeeAuthorizeUrl(token: string) {
  return apiGet<{ url: string }>('/marketplaces/shopee/oauth/authorize', token);
}

export async function disconnectShopee(token: string): Promise<void> {
  const res = await fetch(`${BASE}/api/v1/marketplaces/shopee/oauth`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error((data as { message?: string }).message ?? `Erro ${res.status}`);
  }
}
