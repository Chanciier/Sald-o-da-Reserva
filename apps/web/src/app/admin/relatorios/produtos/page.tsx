'use client';

import { useQuery } from '@tanstack/react-query';
import { RefreshCw, Package } from 'lucide-react';
import { useAuth } from '@/contexts/auth-context';
import { fetchAdminStats } from '@/actions/analytics';

function fmt(n: number) {
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export default function RelatorioProdutos() {
  const { token, loading: authLoading } = useAuth();

  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: ['admin-stats'],
    queryFn: () => fetchAdminStats(token!),
    enabled: !!token && !authLoading,
  });

  if (isLoading) {
    return (
      <div className="space-y-4">
        {[...Array(5)].map((_, i) => (
          <div key={i} className="h-16 rounded-xl bg-muted animate-pulse" />
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
          <h1 className="text-xl font-bold">Relatório de Produtos</h1>
          <p className="text-sm text-muted-foreground">Top produtos por volume de vendas</p>
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
        <div className="rounded-xl border bg-card p-4 shadow-sm text-center">
          <p className="text-3xl font-bold">{data.productsSold.toLocaleString('pt-BR')}</p>
          <p className="text-sm text-muted-foreground mt-1">Unidades vendidas (total)</p>
        </div>
        <div className="rounded-xl border bg-card p-4 shadow-sm text-center">
          <p className="text-3xl font-bold">{data.topProducts.length}</p>
          <p className="text-sm text-muted-foreground mt-1">Produtos com vendas</p>
        </div>
      </div>

      <div className="rounded-xl border bg-card shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b">
          <h2 className="text-sm font-semibold">Top produtos por quantidade vendida</h2>
        </div>
        {data.topProducts.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-16 text-center">
            <Package className="h-10 w-10 text-muted-foreground/40" />
            <p className="text-sm text-muted-foreground">Sem dados de vendas ainda</p>
          </div>
        ) : (
          <div className="divide-y">
            {data.topProducts.map(
              (
                p: { productId: string; name: string; sold: number; revenue: number },
                i: number,
              ) => {
                const max = data.topProducts[0].sold;
                return (
                  <div key={p.productId} className="flex items-center gap-4 px-5 py-4">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted text-sm font-bold text-muted-foreground">
                      {i + 1}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">{p.name}</p>
                      <div className="mt-1.5 h-1.5 w-full rounded-full bg-muted overflow-hidden">
                        <div
                          className="h-full rounded-full bg-primary"
                          style={{ width: `${(p.sold / max) * 100}%` }}
                        />
                      </div>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="text-sm font-semibold">{p.sold} und.</p>
                      <p className="text-xs text-muted-foreground">{fmt(p.revenue)}</p>
                    </div>
                  </div>
                );
              },
            )}
          </div>
        )}
      </div>
    </div>
  );
}
