'use client';

import { useQuery } from '@tanstack/react-query';
import { RefreshCw, Users } from 'lucide-react';
import { useAuth } from '@/contexts/auth-context';
import { fetchAdminStats } from '@/actions/analytics';

function fmt(n: number) {
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

const BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

async function fetchUserStats(token: string) {
  const res = await fetch(`${BASE}/api/v1/admin/rbac/users?limit=1`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: 'no-store',
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message ?? 'Erro');
  return data;
}

export default function RelatorioClientes() {
  const { token, loading: authLoading } = useAuth();

  const { data: stats } = useQuery({
    queryKey: ['admin-stats'],
    queryFn: () => fetchAdminStats(token!),
    enabled: !!token && !authLoading,
  });

  const {
    data: users,
    isLoading,
    isFetching,
    refetch,
  } = useQuery({
    queryKey: ['admin-users-stats'],
    queryFn: () => fetchUserStats(token!),
    enabled: !!token && !authLoading,
  });

  if (isLoading) {
    return (
      <div className="space-y-4">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="h-24 rounded-xl bg-muted animate-pulse" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">Relatório de Clientes</h1>
          <p className="text-sm text-muted-foreground">
            Base de clientes e comportamento de compra
          </p>
        </div>
        <button
          onClick={() => refetch()}
          disabled={isFetching}
          className="flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs hover:bg-muted disabled:opacity-50"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${isFetching ? 'animate-spin' : ''}`} />
          Atualizar
        </button>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-xl border bg-card p-5 shadow-sm text-center">
          <p className="text-3xl font-bold">{users?.total ?? '—'}</p>
          <p className="text-sm text-muted-foreground mt-1">Total de usuários</p>
        </div>
        <div className="rounded-xl border bg-card p-5 shadow-sm text-center">
          <p className="text-3xl font-bold">{stats?.ordersTotal ?? '—'}</p>
          <p className="text-sm text-muted-foreground mt-1">Total de pedidos</p>
        </div>
        <div className="rounded-xl border bg-card p-5 shadow-sm text-center">
          <p className="text-3xl font-bold">{stats ? fmt(stats.avgTicket) : '—'}</p>
          <p className="text-sm text-muted-foreground mt-1">Ticket médio</p>
        </div>
      </div>

      {stats && stats.recentOrders.length > 0 && (
        <div className="rounded-xl border bg-card shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b">
            <h2 className="text-sm font-semibold">Clientes recentes</h2>
          </div>
          <div className="divide-y">
            {stats.recentOrders.map(
              (o: {
                id: string;
                user: { name: string | null; email: string } | null;
                total: number;
                status: string;
                createdAt: string;
              }) => (
                <div key={o.id} className="flex items-center justify-between px-5 py-3">
                  <div>
                    <p className="font-medium text-sm">{o.user?.name ?? 'Anônimo'}</p>
                    <p className="text-xs text-muted-foreground">{o.user?.email}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-semibold">{fmt(o.total)}</p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(o.createdAt).toLocaleDateString('pt-BR')}
                    </p>
                  </div>
                </div>
              ),
            )}
          </div>
        </div>
      )}

      {!stats?.recentOrders.length && (
        <div className="flex flex-col items-center gap-3 py-16 text-center">
          <Users className="h-10 w-10 text-muted-foreground/40" />
          <p className="text-sm text-muted-foreground">Nenhum dado disponível ainda</p>
        </div>
      )}
    </div>
  );
}
