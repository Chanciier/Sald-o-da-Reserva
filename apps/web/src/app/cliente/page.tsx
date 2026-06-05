'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { ShoppingCart, DollarSign, TrendingUp, Clock, RefreshCw, ArrowRight } from 'lucide-react';
import { useAuth } from '@/contexts/auth-context';
import { fetchCustomerStats } from '@/actions/analytics';
import { StatCard } from '@/components/dashboard/stat-card';

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
  PENDING: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300',
  CONFIRMED: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
  PAID: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300',
  SHIPPED: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300',
  DELIVERED: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300',
  CANCELLED: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300',
  REFUNDED: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300',
};

const PAYMENT_LABEL: Record<string, string> = {
  PIX: 'PIX',
  CREDIT_CARD: 'Cartão',
  DEBIT_CARD: 'Débito',
  BOLETO: 'Boleto',
};

export default function ClienteDashboard() {
  const { token, loading: authLoading, user } = useAuth();

  const { data, isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: ['customer-stats'],
    queryFn: () => fetchCustomerStats(token!),
    enabled: !!token && !authLoading,
    refetchInterval: 5 * 60 * 1000,
  });

  if (isLoading) {
    return <Skeleton />;
  }

  if (isError || !data) {
    return (
      <div className="flex flex-col items-center gap-3 py-24">
        <p className="text-muted-foreground">Erro ao carregar seus dados.</p>
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
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">Olá, {user?.name?.split(' ')[0] ?? 'cliente'} 👋</h1>
          <p className="text-sm text-muted-foreground">Aqui está um resumo das suas compras</p>
        </div>
        <button
          onClick={() => refetch()}
          disabled={isFetching}
          className="flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs hover:bg-muted disabled:opacity-50 transition-colors"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${isFetching ? 'animate-spin' : ''}`} />
          Atualizar
        </button>
      </div>

      {/* Stats */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Total de Pedidos"
          value={data.totalOrders.toLocaleString('pt-BR')}
          icon={<ShoppingCart className="h-4 w-4" />}
        />
        <StatCard
          label="Total Gasto"
          value={fmt(data.totalSpent)}
          icon={<DollarSign className="h-4 w-4" />}
          highlight
        />
        <StatCard
          label="Ticket Médio"
          value={fmt(data.avgTicket)}
          icon={<TrendingUp className="h-4 w-4" />}
          description="por pedido"
        />
        <StatCard
          label="Pedidos Pendentes"
          value={data.pendingOrders.toLocaleString('pt-BR')}
          icon={<Clock className="h-4 w-4" />}
          description="aguardando pagamento"
        />
      </div>

      {/* Status distribution */}
      {data.ordersByStatus.length > 0 && (
        <div className="rounded-xl border bg-card p-5 shadow-sm">
          <h2 className="mb-4 text-sm font-semibold">Seus pedidos por status</h2>
          <div className="flex flex-wrap gap-3">
            {data.ordersByStatus.map((s) => (
              <div
                key={s.status}
                className={`flex items-center gap-2 rounded-full px-3 py-1.5 text-sm ${STATUS_COLOR[s.status] ?? 'bg-muted text-foreground'}`}
              >
                <span className="font-medium">{s.count}</span>
                <span>{STATUS_LABEL[s.status] ?? s.status}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Recent orders */}
      <div className="rounded-xl border bg-card shadow-sm">
        <div className="flex items-center justify-between border-b px-5 py-4">
          <h2 className="text-sm font-semibold">Pedidos recentes</h2>
          <Link
            href="/pedidos"
            className="flex items-center gap-1 text-xs text-primary hover:underline"
          >
            Ver todos <ArrowRight className="h-3 w-3" />
          </Link>
        </div>

        {data.recentOrders.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-12">
            <ShoppingCart className="h-10 w-10 text-muted-foreground/40" />
            <p className="text-sm text-muted-foreground">Você ainda não fez nenhum pedido.</p>
            <Link
              href="/produtos"
              className="rounded-lg bg-primary px-4 py-2 text-sm text-primary-foreground hover:opacity-90 transition-opacity"
            >
              Explorar produtos
            </Link>
          </div>
        ) : (
          <div className="divide-y">
            {data.recentOrders.map((o) => (
              <Link
                key={o.id}
                href={`/pedidos/${o.id}`}
                className="flex items-center gap-4 px-5 py-4 hover:bg-muted/30 transition-colors"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs text-muted-foreground">
                      #{o.id.slice(-8).toUpperCase()}
                    </span>
                    <span
                      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_COLOR[o.status] ?? 'bg-muted text-foreground'}`}
                    >
                      {STATUS_LABEL[o.status] ?? o.status}
                    </span>
                  </div>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {o.itemCount} item{o.itemCount !== 1 ? 'ns' : ''}
                    {o.payment ? ` · ${PAYMENT_LABEL[o.payment.method] ?? o.payment.method}` : ''}
                    {o.shipment?.carrier ? ` · ${o.shipment.carrier}` : ''}
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-sm font-semibold">{fmt(o.total)}</p>
                  <p className="text-xs text-muted-foreground">
                    {new Date(o.createdAt).toLocaleDateString('pt-BR')}
                  </p>
                </div>
                <ArrowRight className="h-4 w-4 text-muted-foreground shrink-0" />
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function Skeleton() {
  return (
    <div className="space-y-6">
      <div className="h-8 w-48 rounded-lg bg-muted animate-pulse" />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-24 rounded-xl bg-muted animate-pulse" />
        ))}
      </div>
      <div className="h-20 rounded-xl bg-muted animate-pulse" />
      <div className="h-64 rounded-xl bg-muted animate-pulse" />
    </div>
  );
}
