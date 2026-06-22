'use client';

import { useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/contexts/auth-context';
import {
  fetchMarketingStats,
  type MarketingChartPoint,
  type MarketingProduct,
} from '@/actions/analytics';
import { StatCard } from '@/components/dashboard/stat-card';
import {
  ShoppingBag,
  DollarSign,
  TrendingUp,
  Package,
  RefreshCw,
  CheckCircle2,
  XCircle,
  Clock,
  Zap,
  ExternalLink,
} from 'lucide-react';
import Link from 'next/link';

const PERIODS = [
  { label: '7 dias', value: 7 },
  { label: '30 dias', value: 30 },
  { label: '90 dias', value: 90 },
];

function fmtBRL(n: number) {
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function fmtDate(d: string | null) {
  if (!d) return '—';
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(d));
}

function fmtShortDate(d: string) {
  return new Date(d).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
}

// ── Dual Bar Chart (receita + pedidos) ───────────────────────────────────────

function DualBarChart({ data }: { data: MarketingChartPoint[] }) {
  const [hover, setHover] = useState<number | null>(null);
  if (!data.length || data.every((d) => d.revenue === 0 && d.orders === 0)) {
    return (
      <div className="flex h-40 items-center justify-center text-sm text-muted-foreground">
        Sem dados no período
      </div>
    );
  }
  const maxRevenue = Math.max(...data.map((d) => d.revenue), 1);
  const maxOrders = Math.max(...data.map((d) => d.orders), 1);

  return (
    <div className="space-y-2">
      {/* Legend */}
      <div className="flex gap-4 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-sm bg-primary" /> Receita
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-sm bg-blue-400" /> Pedidos
        </span>
      </div>

      {/* Bars */}
      <div className="flex items-end gap-0.5 h-44 relative">
        {data.map((d, i) => {
          const revH = Math.max((d.revenue / maxRevenue) * 100, d.revenue > 0 ? 2 : 0);
          const ordH = Math.max((d.orders / maxOrders) * 100, d.orders > 0 ? 2 : 0);
          const isHover = hover === i;

          return (
            <div
              key={d.date}
              className="group relative flex-1 flex items-end gap-px"
              style={{ height: '100%' }}
              onMouseEnter={() => setHover(i)}
              onMouseLeave={() => setHover(null)}
            >
              {/* Tooltip */}
              {isHover && (
                <div className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 z-10 whitespace-nowrap rounded-lg bg-popover text-popover-foreground border shadow-md text-xs px-3 py-2 space-y-1">
                  <p className="font-semibold">{fmtShortDate(d.date)}</p>
                  <p className="text-primary font-medium">{fmtBRL(d.revenue)}</p>
                  <p className="text-muted-foreground">
                    {d.orders} pedido{d.orders !== 1 ? 's' : ''}
                  </p>
                  {d.conversions > 0 && (
                    <p className="text-green-600">{d.conversions} conv. Meta</p>
                  )}
                </div>
              )}

              {/* Revenue bar */}
              <div className="flex-1 flex flex-col justify-end" style={{ height: '100%' }}>
                <div
                  className="w-full rounded-t bg-primary/80 hover:bg-primary transition-colors"
                  style={{ height: `${revH}%` }}
                />
              </div>

              {/* Orders bar */}
              <div className="flex-1 flex flex-col justify-end" style={{ height: '100%' }}>
                <div
                  className="w-full rounded-t bg-blue-400/80 hover:bg-blue-500 transition-colors"
                  style={{ height: `${ordH}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>

      {/* x-axis */}
      <div className="flex justify-between text-[10px] text-muted-foreground">
        <span>{data[0] ? fmtShortDate(data[0].date) : ''}</span>
        <span>
          {data[Math.floor(data.length / 2)]
            ? fmtShortDate(data[Math.floor(data.length / 2)].date)
            : ''}
        </span>
        <span>{data[data.length - 1] ? fmtShortDate(data[data.length - 1].date) : ''}</span>
      </div>
    </div>
  );
}

// ── Conversions Line Chart ────────────────────────────────────────────────────

function ConversionsChart({ data }: { data: MarketingChartPoint[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(...data.map((d) => d.conversions), 1);
  const hasData = data.some((d) => d.conversions > 0);

  if (!hasData) {
    return (
      <div className="flex h-28 items-center justify-center text-sm text-muted-foreground">
        Sem conversões no período
      </div>
    );
  }

  return (
    <div className="flex items-end gap-0.5 h-28">
      {data.map((d, i) => {
        const h = Math.max((d.conversions / max) * 100, d.conversions > 0 ? 4 : 0);
        return (
          <div
            key={d.date}
            className="group relative flex-1 flex flex-col justify-end"
            style={{ height: '100%' }}
            onMouseEnter={() => setHover(i)}
            onMouseLeave={() => setHover(null)}
          >
            {hover === i && (
              <div className="absolute bottom-full mb-1.5 left-1/2 -translate-x-1/2 z-10 whitespace-nowrap rounded-md bg-popover text-popover-foreground border text-xs px-2 py-1 shadow">
                <p className="font-medium">{fmtShortDate(d.date)}</p>
                <p className="text-green-600">
                  {d.conversions} conversão{d.conversions !== 1 ? 'ões' : ''}
                </p>
              </div>
            )}
            <div
              className="w-full rounded-t bg-green-500/80 hover:bg-green-500 transition-colors"
              style={{ height: `${h}%` }}
            />
          </div>
        );
      })}
    </div>
  );
}

// ── Products Table ────────────────────────────────────────────────────────────

function ProductsRanking({ products, label }: { products: MarketingProduct[]; label: string }) {
  const max = Math.max(...products.map((p) => p.sold), 1);
  return (
    <div className="space-y-3">
      <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
        {label}
      </h3>
      {products.length === 0 ? (
        <p className="text-sm text-muted-foreground">Sem dados</p>
      ) : (
        <ol className="space-y-3">
          {products.map((p, i) => (
            <li key={p.productId} className="space-y-1">
              <div className="flex items-center gap-3">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-muted text-[10px] font-bold text-muted-foreground">
                  {i + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{p.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {p.sold} vendido{p.sold !== 1 ? 's' : ''} · {fmtBRL(p.revenue)}
                  </p>
                </div>
              </div>
              <div className="ml-8 h-1 w-full rounded-full bg-muted overflow-hidden">
                <div
                  className="h-full rounded-full bg-primary/60"
                  style={{ width: `${(p.sold / max) * 100}%` }}
                />
              </div>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function MarketingDashboardPage() {
  const { token } = useAuth();
  const [days, setDays] = useState(30);

  const { data, isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: ['marketing-overview', days],
    queryFn: () => fetchMarketingStats(token!, days),
    enabled: !!token,
    refetchInterval: 5 * 60 * 1000,
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold">Marketing</h1>
          <p className="text-sm text-muted-foreground">Desempenho de vendas e conversões Meta</p>
        </div>
        <div className="flex items-center gap-2">
          {/* Period selector */}
          <div className="flex rounded-lg border border-border overflow-hidden">
            {PERIODS.map((p) => (
              <button
                key={p.value}
                onClick={() => setDays(p.value)}
                className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                  days === p.value
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:bg-muted'
                }`}
              >
                {p.label}
              </button>
            ))}
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
      </div>

      {isLoading && <PageSkeleton />}
      {isError && (
        <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-6 text-sm text-destructive">
          Erro ao carregar dados. Tente novamente.
        </div>
      )}

      {data && (
        <>
          {/* KPI Cards */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard
              label="Compras"
              value={data.purchases.toLocaleString('pt-BR')}
              icon={<ShoppingBag className="h-4 w-4" />}
              description={`últimos ${days} dias`}
              highlight
            />
            <StatCard
              label="Receita"
              value={fmtBRL(data.revenue)}
              icon={<DollarSign className="h-4 w-4" />}
              description={`últimos ${days} dias`}
            />
            <StatCard
              label="Ticket Médio"
              value={fmtBRL(data.avgTicket)}
              icon={<TrendingUp className="h-4 w-4" />}
            />
            <StatCard
              label="Produtos Ativos"
              value={data.activeProducts.toLocaleString('pt-BR')}
              icon={<Package className="h-4 w-4" />}
              description="no catálogo"
            />
          </div>

          {/* Main chart + Meta block */}
          <div className="grid gap-4 lg:grid-cols-3">
            {/* Revenue + Orders chart */}
            <div className="lg:col-span-2 rounded-xl border bg-card p-5 shadow-sm">
              <h2 className="mb-4 text-sm font-semibold">
                Receita e Pedidos — últimos {days} dias
              </h2>
              <DualBarChart data={data.chart} />
            </div>

            {/* Meta block */}
            <div className="rounded-xl border bg-card p-5 shadow-sm space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold">Meta Integration</h2>
                <Link
                  href="/admin/marketing/meta-catalog"
                  className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  Catálogo <ExternalLink className="h-3 w-3" />
                </Link>
              </div>

              <div className="space-y-3">
                <MetaRow
                  icon={<CheckCircle2 className="h-4 w-4 text-green-600" />}
                  label="Sincronizados"
                  value={data.meta.catalogSynced}
                />
                <MetaRow
                  icon={<XCircle className="h-4 w-4 text-destructive" />}
                  label="Erros no Catálogo"
                  value={data.meta.catalogErrors}
                />
                <MetaRow
                  icon={<Zap className="h-4 w-4 text-yellow-500" />}
                  label={`Purchases CAPI (${days}d)`}
                  value={data.meta.capiPurchases}
                />
                <div className="flex items-start gap-2.5 text-xs text-muted-foreground pt-1 border-t border-border">
                  <Clock className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                  <span>Última sync: {fmtDate(data.meta.lastCatalogSync)}</span>
                </div>
              </div>

              {/* Conversions mini chart */}
              <div>
                <p className="mb-2 text-xs text-muted-foreground">Conversões por dia</p>
                <ConversionsChart data={data.chart} />
              </div>
            </div>
          </div>

          {/* Products section */}
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="rounded-xl border bg-card p-5 shadow-sm">
              <ProductsRanking products={data.topSelling} label="Mais vendidos (quantidade)" />
            </div>
            <div className="rounded-xl border bg-card p-5 shadow-sm">
              <ProductsRanking products={data.topByRevenue} label="Mais vendidos (receita)" />
            </div>
          </div>

          {/* Future campaigns placeholder */}
          <div className="rounded-xl border border-dashed border-border bg-muted/20 p-6 text-center space-y-2">
            <p className="text-sm font-medium text-muted-foreground">Campanhas</p>
            <p className="text-xs text-muted-foreground">
              Estrutura pronta para futuras campanhas de Meta Ads, e-mail marketing e cupons
              segmentados.
            </p>
            <div className="flex justify-center gap-3 pt-1">
              <span className="rounded-full border border-border px-3 py-1 text-xs text-muted-foreground">
                Meta Ads
              </span>
              <span className="rounded-full border border-border px-3 py-1 text-xs text-muted-foreground">
                E-mail Marketing
              </span>
              <span className="rounded-full border border-border px-3 py-1 text-xs text-muted-foreground">
                Cupons Segmentados
              </span>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function MetaRow({ icon, label, value }: { icon: ReactNode; label: string; value: number }) {
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        {icon}
        {label}
      </div>
      <span className="text-sm font-semibold">{value.toLocaleString('pt-BR')}</span>
    </div>
  );
}

function PageSkeleton() {
  return (
    <div className="space-y-4 animate-pulse">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-24 rounded-xl bg-muted" />
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2 h-72 rounded-xl bg-muted" />
        <div className="h-72 rounded-xl bg-muted" />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="h-64 rounded-xl bg-muted" />
        <div className="h-64 rounded-xl bg-muted" />
      </div>
    </div>
  );
}
