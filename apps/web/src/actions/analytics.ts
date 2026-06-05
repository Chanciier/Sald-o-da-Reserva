'use server';

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

export async function fetchSellerStats(token: string) {
  return apiFetch<AdminOverview>('/analytics/seller', token);
}

export async function fetchCustomerStats(token: string) {
  return apiFetch<CustomerOverview>('/analytics/customer', token);
}

export interface AdminOverview {
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
