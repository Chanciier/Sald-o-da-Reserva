'use client';

import { useQuery } from '@tanstack/react-query';
import {
  AlertTriangle,
  Boxes,
  CheckCircle2,
  DollarSign,
  Package,
  RefreshCw,
  ShoppingCart,
  Store,
  XCircle,
} from 'lucide-react';
import Link from 'next/link';
import { useAuth } from '@/contexts/auth-context';
import { fetchOmsDashboard, type Marketplace } from '@/actions/oms';
import { StatCard } from '@/components/dashboard/stat-card';

function fmt(n: number) {
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

const MARKETPLACE_LABEL: Record<Marketplace, string> = {
  SITE: 'Site próprio',
  MERCADO_LIVRE: 'Mercado Livre',
  SHOPEE: 'Shopee',
};

export default function OmsDashboardPage() {
  const { token, loading: authLoading } = useAuth();

  const { data, isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: ['oms-dashboard'],
    queryFn: () => fetchOmsDashboard(token!),
    enabled: !!token && !authLoading,
    refetchInterval: 60 * 1000,
  });

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="h-8 w-48 rounded-lg bg-muted animate-pulse" />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-24 rounded-xl bg-muted animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="flex flex-col items-center gap-3 py-24">
        <p className="text-muted-foreground">Erro ao carregar o painel OMS.</p>
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
          <h1 className="text-xl font-bold">OMS — Painel operacional</h1>
          <p className="text-sm text-muted-foreground">
            Pedidos, vendas e marketplaces em tempo real
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Link
            href="/admin/marketplaces"
            className="flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs hover:bg-muted transition-colors"
          >
            <Store className="h-3.5 w-3.5" /> Marketplaces
          </Link>
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

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Faturamento do dia"
          value={fmt(data.revenueToday)}
          icon={<DollarSign className="h-4 w-4" />}
          highlight
        />
        <StatCard
          label="Pedidos de hoje"
          value={data.ordersToday.toLocaleString('pt-BR')}
          icon={<ShoppingCart className="h-4 w-4" />}
        />
        <StatCard
          label="Pagamentos aprovados"
          value={data.paymentsApprovedToday.toLocaleString('pt-BR')}
          icon={<CheckCircle2 className="h-4 w-4" />}
          description="hoje"
        />
        <StatCard
          label="Produtos vendidos"
          value={data.productsSold.toLocaleString('pt-BR')}
          icon={<Package className="h-4 w-4" />}
          description="únicos marcados como vendidos"
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Aguardando separação"
          value={data.awaitingSeparation.toLocaleString('pt-BR')}
          icon={<Boxes className="h-4 w-4" />}
        />
        <StatCard
          label="Publicações com erro"
          value={data.publicationErrors.toLocaleString('pt-BR')}
          icon={<XCircle className="h-4 w-4" />}
          description="ver painel de marketplaces"
        />
      </div>

      {/* Produtos ativos por marketplace */}
      <div className="rounded-xl border bg-card p-5 shadow-sm">
        <h2 className="mb-4 text-sm font-semibold">Produtos ativos por marketplace</h2>
        <div className="grid gap-4 sm:grid-cols-3">
          {(Object.keys(data.activeProductsByMarketplace) as Marketplace[]).map((mp) => (
            <div
              key={mp}
              className="flex items-center justify-between rounded-lg border bg-background p-4"
            >
              <div className="flex items-center gap-2">
                <Store className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-medium">{MARKETPLACE_LABEL[mp]}</span>
              </div>
              <span className="text-lg font-bold">{data.activeProductsByMarketplace[mp]}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Alertas críticos */}
      <div className="rounded-xl border bg-card p-5 shadow-sm">
        <h2 className="mb-4 flex items-center gap-2 text-sm font-semibold">
          <AlertTriangle className="h-4 w-4" /> Alertas críticos
        </h2>
        {data.criticalAlerts.length === 0 ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <CheckCircle2 className="h-4 w-4 text-emerald-500" /> Nenhum alerta no momento.
          </p>
        ) : (
          <ul className="space-y-2">
            {data.criticalAlerts.map((alert, i) => (
              <li
                key={i}
                className={`flex items-start gap-2 rounded-lg px-3 py-2 text-sm ${
                  alert.level === 'error'
                    ? 'bg-destructive/10 text-destructive'
                    : 'bg-yellow-500/10 text-yellow-700 dark:text-yellow-500'
                }`}
              >
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                {alert.message}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
