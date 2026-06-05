'use client';

import { useQuery } from '@tanstack/react-query';
import { RefreshCw, TrendingUp } from 'lucide-react';
import { useAuth } from '@/contexts/auth-context';
import { fetchAdminStats } from '@/actions/analytics';
import { BarChart } from '@/components/dashboard/bar-chart';
import { StatCard } from '@/components/dashboard/stat-card';

function fmt(n: number) {
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export default function RelatorioVendas() {
  const { token, loading: authLoading } = useAuth();

  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: ['admin-stats'],
    queryFn: () => fetchAdminStats(token!),
    enabled: !!token && !authLoading,
    refetchInterval: 5 * 60 * 1000,
  });

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="h-8 w-48 rounded-lg bg-muted animate-pulse" />
        {[...Array(3)].map((_, i) => (
          <div key={i} className="h-32 rounded-xl bg-muted animate-pulse" />
        ))}
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex flex-col items-center gap-3 py-24">
        <p className="text-muted-foreground">Erro ao carregar relatório.</p>
        <button
          onClick={() => refetch()}
          className="flex items-center gap-2 rounded-lg border px-4 py-2 text-sm hover:bg-muted"
        >
          <RefreshCw className="h-4 w-4" /> Tentar novamente
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">Relatório de Vendas</h1>
          <p className="text-sm text-muted-foreground">Visão geral das receitas e pedidos</p>
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

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Receita Hoje"
          value={fmt(data.revenueToday)}
          icon={<TrendingUp className="h-4 w-4" />}
          highlight
        />
        <StatCard
          label="Receita Mensal"
          value={fmt(data.revenueMonth)}
          icon={<TrendingUp className="h-4 w-4" />}
        />
        <StatCard
          label="Ticket Médio"
          value={fmt(data.avgTicket)}
          icon={<TrendingUp className="h-4 w-4" />}
        />
        <StatCard
          label="Pedidos no Mês"
          value={data.ordersMonth.toLocaleString('pt-BR')}
          icon={<TrendingUp className="h-4 w-4" />}
        />
      </div>

      <div className="rounded-xl border bg-card p-5 shadow-sm">
        <h2 className="mb-4 text-sm font-semibold">Receita — últimos 30 dias</h2>
        <BarChart data={data.revenueChart} />
      </div>

      <div className="rounded-xl border bg-card p-5 shadow-sm">
        <h2 className="mb-4 text-sm font-semibold">Pedidos por status</h2>
        <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-6">
          {data.ordersByStatus.map((s: { status: string; count: number }) => (
            <div key={s.status} className="rounded-lg border bg-muted/30 p-3 text-center">
              <p className="text-2xl font-bold">{s.count}</p>
              <p className="text-xs text-muted-foreground mt-1">{s.status}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
