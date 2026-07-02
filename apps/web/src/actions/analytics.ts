const BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

async function apiFetch<T>(path: string, token: string): Promise<T> {
  const res = await fetch(`${BASE}/api/v1${path}`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: 'no-store',
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { message?: string }).message ?? `Erro ${res.status}`);
  return data as T;
}

export async function fetchAdminStats(token: string) {
  return apiFetch<AdminOverview>('/analytics/admin', token);
}

export async function fetchReports(token: string, from: string, to: string) {
  const query = new URLSearchParams({ from, to });
  return apiFetch<ReportsOverview>(`/analytics/reports?${query}`, token);
}

export async function fetchSellerStats(token: string, days = 30) {
  return apiFetch<SellerOverview>(`/analytics/seller?days=${days}`, token);
}

export async function fetchCustomerStats(token: string) {
  return apiFetch<CustomerOverview>('/analytics/customer', token);
}

export async function fetchMarketingStats(token: string, days = 30) {
  return apiFetch<MarketingOverview>(`/analytics/marketing?days=${days}`, token);
}

export interface AdminOverview {
  inventoryValue: number;
  revenueToday: number;
  revenueMonth: number;
  avgTicket: number;
  productsSold: number;
  ordersToday: number;
  ordersMonth: number;
  ordersTotal: number;
  ordersByStatus: { status: string; count: number }[];
  recentOrders: RecentOrder[];
  topProducts: TopProduct[];
  revenueChart: ChartPoint[];
}

export interface ReportsOverview {
  period: { from: string; to: string; days: number; timeZone: string };
  sales: {
    revenue: number;
    paidOrders: number;
    allOrders: number;
    units: number;
    avgTicket: number;
    cancellationRate: number;
    comparison: { revenue: number; orders: number; units: number };
    timeline: { date: string; revenue: number; orders: number; units: number }[];
    hourly: { hour: number; revenue: number; orders: number }[];
    weekdays: { weekday: number; revenue: number; orders: number }[];
    channels: BreakdownPoint[];
    payments: BreakdownPoint[];
    status: { name: string; count: number }[];
  };
  products: {
    units: number;
    revenue: number;
    inventoryValue: number;
    active: number;
    lowStockCount: number;
    top: { productId: string; name: string; sold: number; revenue: number }[];
    categories: { name: string; sold: number; revenue: number }[];
    lowStock: { id: string; name: string; sku: string; stock: number; minimumStock: number }[];
  };
  customers: {
    total: number;
    buyers: number;
    newCustomers: number;
    repeatCustomers: number;
    repeatRate: number;
    revenuePerBuyer: number;
    top: {
      id: string;
      name: string;
      email: string;
      orders: number;
      spent: number;
      lastOrderAt: string;
    }[];
  };
}

export interface BreakdownPoint {
  name: string;
  revenue: number;
  orders: number;
}

export interface SellerOverview {
  period: { days: number; since: string; until: string };
  revenueToday: number;
  revenueMonth: number;
  revenuePeriod: number;
  revenuePrevPeriod: number;
  revenueChangePct: number | null;
  totalOrders: number;
  ordersToday: number;
  ordersTotal: number;
  totalUnitsSold: number;
  avgTicket: number;
  ordersByStatus: { status: string; count: number }[];
  topProducts: TopProduct[];
  recentOrders: {
    orderId: string;
    orderStatus: string;
    createdAt: string;
    customer: { name: string | null; email: string } | null;
    product: string;
    quantity: number;
    subtotal: number;
  }[];
  revenueChart: ChartPoint[];
}

export interface CustomerOverview {
  totalOrders: number;
  totalSpent: number;
  avgTicket: number;
  pendingOrders: number;
  ordersByStatus: { status: string; count: number }[];
  recentOrders: CustomerOrder[];
}

export interface RecentOrder {
  id: string;
  status: string;
  total: number;
  createdAt: string;
  itemCount: number;
  user: { name: string | null; email: string } | null;
  payment: { method: string; status: string } | null;
}

export interface CustomerOrder {
  id: string;
  status: string;
  total: number;
  createdAt: string;
  itemCount: number;
  payment: { method: string; status: string } | null;
  shipment: { status: string; carrier: string; trackingCode: string | null } | null;
}

export interface TopProduct {
  productId: string;
  name: string;
  sold: number;
  revenue: number;
}

export interface ChartPoint {
  date: string;
  revenue: number;
  orders: number;
}

export interface MarketingChartPoint {
  date: string;
  revenue: number;
  orders: number;
  conversions: number;
}

export interface MarketingProduct {
  productId: string;
  name: string;
  sold: number;
  revenue: number;
}

export interface MarketingOverview {
  period: { days: number; since: string; until: string };
  purchases: number;
  revenue: number;
  avgTicket: number;
  activeProducts: number;
  topSelling: MarketingProduct[];
  topByRevenue: MarketingProduct[];
  meta: {
    catalogSynced: number;
    catalogErrors: number;
    lastCatalogSync: string | null;
    capiPurchases: number;
  };
  chart: MarketingChartPoint[];
}
