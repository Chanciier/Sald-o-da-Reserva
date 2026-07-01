'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  RefreshCw,
  TrendingUp,
  TrendingDown,
  ShoppingBag,
  DollarSign,
  Package,
  Hash,
  Download,
} from 'lucide-react';
import { useAuth } from '@/contexts/auth-context';
import { fetchSellerStats } from '@/actions/analytics';
import { StatCard } from '@/components/dashboard/stat-card';
import { BarChart } from '@/components/dashboard/bar-chart';

const PERIODS = [
  { days: 7, label: '7 dias' },
  { days: 30, label: '30 dias' },
  { days: 90, label: '90 dias' },
];

const STATUS_LABEL: Record<string, string> = {
  PENDING: 'Pendente',
  CONFIRMED: 'Confirmado',
  PAID: 'Pago',
  SEPARATING: 'Separando',
  SEPARATED: 'Separado',
  READY_TO_SHIP: 'Pronto p/ envio',
  SHIPPED: 'Enviado',
  DELIVERED: 'Entregue',
  CANCELLED: 'Cancelado',
  REFUNDED: 'Reembolsado',
};

function fmt(n: number) {
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function csvEscape(v: string | number) {
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export default function VendedorRelatorios() {
  const { token, loading: authLoading } = useAuth();
  const [days, setDays] = useState(30);

  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: ['seller-stats', days],
    queryFn: () => fetchSellerStats(token!, days),
    enabled: !!token && !authLoading,
    refetchInterval: 5 * 60 * 1000,
  });

  function exportCsv() {
    if (!data) return;
    const rows = [
      ['Produto', 'Unidades vendidas', 'Receita'],
      ...data.topProducts.map((p) => [p.name, String(p.sold), p.revenue.toFixed(2)]),
    ];
    const csv = rows.map((r) => r.map(csvEscape).join(',')).join('\n');
    const BOM = String.fromCharCode(0xfeff);
    const blob = new Blob([BOM + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `relatorio-vendas-${days}dias-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

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

  const maxStatus = Math.max(...data.ordersByStatus.map((s) => s.count), 1);
  const change = data.revenueChangePct;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold">Relatórios</h1>
          <p className="text-sm text-muted-foreground">Desempenho dos seus produtos</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex rounded-lg border p-0.5">
            {PERIODS.map((p) => (
              <button
                key={p.days}
                onClick={() => setDays(p.days)}
                className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                  days === p.days
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:bg-muted'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
          <button
            onClick={exportCsv}
            className="flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs hover:bg-muted"
          >
            <Download className="h-3.5 w-3.5" />
            Exportar CSV
          </button>
          <button
            onClick={() => refetch()}
            disabled={isFetching}
            className="flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs hover:bg-muted disabled:opacity-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isFetching ? 'animate-spin' : ''}`} />
            Atualizar
          </button>
        </div>
      </div>

      {/* Stats principais */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Receita Hoje"
          value={fmt(data.revenueToday)}
          icon={<DollarSign className="h-4 w-4" />}
          highlight
        />
        <StatCard
          label={`Receita — ${days} dias`}
          value={fmt(data.revenuePeriod)}
          icon={<TrendingUp className="h-4 w-4" />}
          description={
            change === null
              ? 'sem período anterior p/ comparar'
              : `${change >= 0 ? '▲' : '▼'} ${Math.abs(change).toFixed(1)}% vs. período anterior`
          }
        />
        <StatCard
          label="Ticket Médio"
          value={fmt(data.avgTicket)}
          icon={
            change !== null && change < 0 ? (
              <TrendingDown className="h-4 w-4" />
            ) : (
              <TrendingUp className="h-4 w-4" />
            )
          }
        />
        <StatCard
          label="Unidades Vendidas"
          value={data.totalUnitsSold.toLocaleString('pt-BR')}
          icon={<Package className="h-4 w-4" />}
          description={`nos últimos ${days} dias`}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard
          label="Pedidos Hoje"
          value={data.ordersToday.toLocaleString('pt-BR')}
          icon={<ShoppingBag className="h-4 w-4" />}
        />
        <StatCard
          label={`Pedidos — ${days} dias`}
          value={data.totalOrders.toLocaleString('pt-BR')}
          icon={<ShoppingBag className="h-4 w-4" />}
        />
        <StatCard
          label="Total de Pedidos"
          value={data.ordersTotal.toLocaleString('pt-BR')}
          icon={<Hash className="h-4 w-4" />}
          description="desde o início"
        />
      </div>

      {/* Gráfico + status */}
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2 rounded-xl border bg-card p-5 shadow-sm">
          <h2 className="mb-4 text-sm font-semibold">Receita — últimos {days} dias</h2>
          <BarChart data={data.revenueChart} />
        </div>

        <div className="rounded-xl border bg-card p-5 shadow-sm">
          <h2 className="mb-4 text-sm font-semibold">Pedidos por status</h2>
          {data.ordersByStatus.length === 0 ? (
            <p className="text-sm text-muted-foreground">Sem dados</p>
          ) : (
            <div className="space-y-3">
              {data.ordersByStatus
                .sort((a, b) => b.count - a.count)
                .map((s) => (
                  <div key={s.status}>
                    <div className="flex justify-between text-xs mb-1">
                      <span className="text-muted-foreground">
                        {STATUS_LABEL[s.status] ?? s.status}
                      </span>
                      <span className="font-medium">{s.count}</span>
                    </div>
                    <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
                      <div
                        className="h-full rounded-full bg-primary/80"
                        style={{ width: `${(s.count / maxStatus) * 100}%` }}
                      />
                    </div>
                  </div>
                ))}
            </div>
          )}
        </div>
      </div>

      {/* Top produtos */}
      {data.topProducts.length > 0 && (
        <div className="rounded-xl border bg-card shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b">
            <h2 className="text-sm font-semibold">Top produtos</h2>
          </div>
          <div className="divide-y">
            {data.topProducts.map((p, i) => (
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
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
