'use client';

import { useQuery } from '@tanstack/react-query';
import {
  RefreshCw,
  TrendingUp,
  ShoppingCart,
  Package,
  DollarSign,
  Calendar,
  Hash,
  Warehouse,
} from 'lucide-react';
import { useAuth } from '@/contexts/auth-context';
import { fetchAdminStats } from '@/actions/analytics';
import { StatCard } from '@/components/dashboard/stat-card';
import { BarChart } from '@/components/dashboard/bar-chart';
import { OrdersTable } from '@/components/dashboard/orders-table';

function fmt(n: number) {
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

const STATUS_LABEL: Record<string, string> = {
  PENDING: 'Pendente',
  CONFIRMED: 'Confirmado',
  PAID: 'Pago',
  SHIPPED: 'Enviado',
  DELIVERED: 'Entregue',
  CANCELLED: 'Cancelado',
  REFUNDED: 'Reembolsado',
};

const STATUS_COLOR: Record<string, string> = {
  PENDING: 'bg-yellow-500',
  CONFIRMED: 'bg-blue-500',
  PAID: 'bg-green-500',
  SHIPPED: 'bg-purple-500',
  DELIVERED: 'bg-emerald-500',
  CANCELLED: 'bg-red-500',
  REFUNDED: 'bg-gray-400',
};

export default function AdminDashboard() {
  const { token, loading: authLoading, user } = useAuth();

  const { data, isLoading, isError, refetch, isFetching, dataUpdatedAt } = useQuery({
    queryKey: ['admin-stats'],
    queryFn: () => fetchAdminStats(token!),
    enabled: !!token && !authLoading,
    refetchInterval: 5 * 60 * 1000,
  });

  const updatedAt = dataUpdatedAt ? new Date(dataUpdatedAt).toLocaleTimeString('pt-BR') : null;

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton />
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="flex flex-col items-center gap-3 py-24">
        <p className="text-muted-foreground">Erro ao carregar dados do dashboard.</p>
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

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">Dashboard</h1>
          <p className="text-sm text-muted-foreground">Bem-vindo, {user?.name ?? 'Admin'}</p>
        </div>
        <div className="flex items-center gap-3">
          {updatedAt && (
            <span className="text-xs text-muted-foreground">Atualizado às {updatedAt}</span>
          )}
          <button
            onClick={() => refetch()}
            disabled={isFetching}
            className="flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs hover:bg-muted disabled:opacity-50 transition-colors"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isFetching ? 'animate-spin' : ''}`} />
            Atualizar
          </button>
        </div>
      </div>

      {/* Stats row 1 — revenue */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Receita Hoje"
          value={fmt(data.revenueToday)}
          icon={<DollarSign className="h-4 w-4" />}
          highlight
        />
        <StatCard
          label="Receita Mensal"
          value={fmt(data.revenueMonth)}
          icon={<Calendar className="h-4 w-4" />}
        />
        <StatCard
          label="Ticket Médio"
          value={fmt(data.avgTicket)}
          icon={<TrendingUp className="h-4 w-4" />}
        />
        <StatCard
          label="Produtos Vendidos"
          value={data.productsSold.toLocaleString('pt-BR')}
          icon={<Package className="h-4 w-4" />}
          description="itens totais"
        />
      </div>

      {/* Stats row 2 — orders + inventory */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Pedidos Hoje"
          value={data.ordersToday.toLocaleString('pt-BR')}
          icon={<ShoppingCart className="h-4 w-4" />}
        />
        <StatCard
          label="Pedidos no Mês"
          value={data.ordersMonth.toLocaleString('pt-BR')}
          icon={<Calendar className="h-4 w-4" />}
        />
        <StatCard
          label="Total de Pedidos"
          value={data.ordersTotal.toLocaleString('pt-BR')}
          icon={<Hash className="h-4 w-4" />}
          description="desde o início"
        />
        <StatCard
          label="Valor do Estoque"
          value={fmt(data.inventoryValue)}
          icon={<Warehouse className="h-4 w-4" />}
          description="preço × qtd em estoque"
        />
      </div>

      {/* Revenue chart + Status */}
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2 rounded-xl border bg-card p-5 shadow-sm">
          <h2 className="mb-4 text-sm font-semibold">Receita — últimos 30 dias</h2>
          <BarChart data={data.revenueChart} />
        </div>

        <div className="rounded-xl border bg-card p-5 shadow-sm">
          <h2 className="mb-4 text-sm font-semibold">Pedidos por status</h2>
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
                      className={`h-full rounded-full ${STATUS_COLOR[s.status] ?? 'bg-gray-400'}`}
                      style={{ width: `${(s.count / maxStatus) * 100}%` }}
                    />
                  </div>
                </div>
              ))}
          </div>
        </div>
      </div>

      {/* Top products + Recent orders */}
      <div className="grid gap-4 lg:grid-cols-5">
        <div className="lg:col-span-2 rounded-xl border bg-card p-5 shadow-sm">
          <h2 className="mb-4 text-sm font-semibold">Top produtos</h2>
          {data.topProducts.length === 0 ? (
            <p className="text-sm text-muted-foreground">Sem dados</p>
          ) : (
            <ol className="space-y-3">
              {data.topProducts.map((p, i) => (
                <li key={p.productId} className="flex items-center gap-3">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-bold text-muted-foreground">
                    {i + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{p.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {p.sold} vendido{p.sold !== 1 ? 's' : ''}
                    </p>
                  </div>
                  <span className="shrink-0 text-xs font-semibold text-muted-foreground">
                    {fmt(p.revenue)}
                  </span>
                </li>
              ))}
            </ol>
          )}
        </div>

        <div className="lg:col-span-3 rounded-xl border bg-card p-5 shadow-sm">
          <h2 className="mb-4 text-sm font-semibold">Pedidos recentes</h2>
          <OrdersTable orders={data.recentOrders} />
        </div>
      </div>
    </div>
  );
}

function Skeleton() {
  return (
    <>
      <div className="h-8 w-48 rounded-lg bg-muted animate-pulse" />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-24 rounded-xl bg-muted animate-pulse" />
        ))}
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-24 rounded-xl bg-muted animate-pulse" />
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2 h-72 rounded-xl bg-muted animate-pulse" />
        <div className="h-72 rounded-xl bg-muted animate-pulse" />
      </div>
    </>
  );
}
