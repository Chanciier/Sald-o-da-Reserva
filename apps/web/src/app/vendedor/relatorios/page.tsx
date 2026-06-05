'use client';

import { useQuery } from '@tanstack/react-query';
import { RefreshCw, TrendingUp, ShoppingBag } from 'lucide-react';
import { useAuth } from '@/contexts/auth-context';
import { fetchSellerStats } from '@/actions/analytics';

function fmt(n: number) {
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export default function VendedorRelatorios() {
  const { token, loading: authLoading } = useAuth();

  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: ['seller-stats'],
    queryFn: () => fetchSellerStats(token!),
    enabled: !!token && !authLoading,
    refetchInterval: 5 * 60 * 1000,
  });

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="h-8 w-48 rounded-lg bg-muted animate-pulse" />
        {[...Array(4)].map((_, i) => (
          <div key={i} className="h-24 rounded-xl bg-muted animate-pulse" />
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
          <h1 className="text-xl font-bold">Relatórios</h1>
          <p className="text-sm text-muted-foreground">Desempenho dos seus produtos</p>
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

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-xl border bg-card p-5 shadow-sm flex items-center gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
            <TrendingUp className="h-5 w-5 text-primary" />
          </div>
          <div>
            <p className="text-2xl font-bold">{fmt(data.revenueToday ?? 0)}</p>
            <p className="text-sm text-muted-foreground">Receita hoje</p>
          </div>
        </div>
        <div className="rounded-xl border bg-card p-5 shadow-sm flex items-center gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-green-100">
            <ShoppingBag className="h-5 w-5 text-green-700" />
          </div>
          <div>
            <p className="text-2xl font-bold">{fmt(data.revenueMonth ?? 0)}</p>
            <p className="text-sm text-muted-foreground">Receita este mês</p>
          </div>
        </div>
      </div>

      {/* Gráfico de receita */}
      {data.revenueChart && data.revenueChart.length > 0 && (
        <div className="rounded-xl border bg-card p-5 shadow-sm">
          <h2 className="mb-4 text-sm font-semibold">Receita — últimos 30 dias</h2>
          <div className="flex items-end gap-1 h-32">
            {data.revenueChart.map((d: { date: string; revenue: number }) => {
              const max = Math.max(
                ...data.revenueChart.map((x: { revenue: number }) => x.revenue),
                1,
              );
              const pct = (d.revenue / max) * 100;
              return (
                <div key={d.date} className="flex-1 flex flex-col items-center gap-1 group">
                  <div
                    className="w-full rounded-t bg-primary/80 hover:bg-primary transition-colors"
                    style={{ height: `${pct}%`, minHeight: d.revenue > 0 ? '4px' : '0' }}
                    title={`${d.date}: ${fmt(d.revenue)}`}
                  />
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Top produtos */}
      {data.topProducts && data.topProducts.length > 0 && (
        <div className="rounded-xl border bg-card shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b">
            <h2 className="text-sm font-semibold">Top produtos</h2>
          </div>
          <div className="divide-y">
            {data.topProducts.map(
              (
                p: { productId: string; name: string; sold: number; revenue: number },
                i: number,
              ) => (
                <div key={p.productId} className="flex items-center gap-4 px-5 py-3">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-bold text-muted-foreground">
                    {i + 1}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="truncate font-medium text-sm">{p.name}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-sm font-semibold">{p.sold} und.</p>
                    <p className="text-xs text-muted-foreground">{fmt(p.revenue)}</p>
                  </div>
                </div>
              ),
            )}
          </div>
        </div>
      )}
    </div>
  );
}
