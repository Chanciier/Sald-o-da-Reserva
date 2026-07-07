'use client';

import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { CheckCircle2, Link2, RefreshCw, RotateCcw, Store, Unlink, XCircle } from 'lucide-react';
import { useAuth } from '@/contexts/auth-context';
import {
  disconnectShopee,
  fetchMarketplacesHealth,
  getShopeeAuthorizeUrl,
  retryFailedPublications,
  syncAllProducts,
  type Marketplace,
  type MarketplaceHealth,
} from '@/actions/oms';

const MARKETPLACE_LABEL: Record<Marketplace, string> = {
  SITE: 'Site próprio',
  MERCADO_LIVRE: 'Mercado Livre',
  SHOPEE: 'Shopee',
};

function formatDate(value: string | null) {
  if (!value) return '—';
  return new Date(value).toLocaleString('pt-BR');
}

export default function MarketplacesPage() {
  const { token, loading: authLoading } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [busy, setBusy] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  const { data, isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: ['marketplaces-health'],
    queryFn: () => fetchMarketplacesHealth(token!),
    enabled: !!token && !authLoading,
    refetchInterval: 60 * 1000,
  });

  useEffect(() => {
    const shopee = searchParams.get('shopee');
    if (!shopee) return;
    setFeedback(
      shopee === 'connected'
        ? 'Shopee conectada com sucesso.'
        : 'Falha ao conectar a Shopee. Tente novamente.',
    );
    router.replace('/admin/marketplaces');
    refetch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  async function connectShopee() {
    if (!token) return;
    setBusy('SHOPEE:connect');
    setFeedback(null);
    try {
      const { url } = await getShopeeAuthorizeUrl(token);
      window.location.href = url;
    } catch (err) {
      setFeedback((err as Error).message);
      setBusy(null);
    }
  }

  async function disconnectShopeeAction() {
    if (!token) return;
    setBusy('SHOPEE:disconnect');
    setFeedback(null);
    try {
      await disconnectShopee(token);
      setFeedback('Shopee desconectada.');
      await refetch();
    } catch (err) {
      setFeedback((err as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function run(marketplace: Marketplace, action: 'retry' | 'sync') {
    if (!token) return;
    const key = `${marketplace}:${action}`;
    setBusy(key);
    setFeedback(null);
    try {
      const result =
        action === 'retry'
          ? await retryFailedPublications(token, marketplace)
          : await syncAllProducts(token, marketplace);
      setFeedback(
        `${action === 'retry' ? 'Reprocessamento' : 'Sincronização'} de ${MARKETPLACE_LABEL[marketplace]}: ${result.count} item(ns) enfileirado(s).`,
      );
      await refetch();
    } catch (err) {
      setFeedback((err as Error).message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">Marketplaces</h1>
          <p className="text-sm text-muted-foreground">
            Saúde da integração e reprocessamento por canal
          </p>
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

      {feedback && (
        <div className="rounded-lg border bg-muted/50 px-4 py-3 text-sm">{feedback}</div>
      )}

      {isLoading ? (
        <div className="grid gap-4 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-56 rounded-xl bg-muted animate-pulse" />
          ))}
        </div>
      ) : isError || !data ? (
        <div className="flex flex-col items-center gap-3 py-24">
          <p className="text-muted-foreground">Erro ao carregar a saúde dos marketplaces.</p>
          <button
            onClick={() => refetch()}
            className="flex items-center gap-2 rounded-lg border px-4 py-2 text-sm hover:bg-muted"
          >
            <RefreshCw className="h-4 w-4" /> Tentar novamente
          </button>
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-3">
          {data.map((mp) => (
            <MarketplaceCard
              key={mp.marketplace}
              health={mp}
              busy={busy}
              onAction={run}
              onConnectShopee={connectShopee}
              onDisconnectShopee={disconnectShopeeAction}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function MarketplaceCard({
  health,
  busy,
  onAction,
  onConnectShopee,
  onDisconnectShopee,
}: {
  health: MarketplaceHealth;
  busy: string | null;
  onAction: (m: Marketplace, a: 'retry' | 'sync') => void;
  onConnectShopee: () => void;
  onDisconnectShopee: () => void;
}) {
  const retrying = busy === `${health.marketplace}:retry`;
  const syncing = busy === `${health.marketplace}:sync`;
  const connectingShopee = busy === 'SHOPEE:connect';
  const disconnectingShopee = busy === 'SHOPEE:disconnect';

  return (
    <div className="rounded-xl border bg-card p-5 shadow-sm">
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Store className="h-5 w-5 text-muted-foreground" />
          <span className="font-semibold">{MARKETPLACE_LABEL[health.marketplace]}</span>
        </div>
        {health.connected ? (
          <span className="flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-xs font-medium text-emerald-600">
            <CheckCircle2 className="h-3.5 w-3.5" /> Conectado
          </span>
        ) : (
          <span className="flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
            <XCircle className="h-3.5 w-3.5" /> Desconectado
          </span>
        )}
      </div>

      <dl className="space-y-2 text-sm">
        <Row label="Produtos publicados" value={health.publishedCount} />
        <Row label="Produtos com erro" value={health.errorCount} danger={health.errorCount > 0} />
        <Row label="Pedidos importados" value={health.importedOrders} />
        <Row label="Na fila" value={health.queuedJobs} />
        <Row label="Dead-letter" value={health.deadLetterJobs} danger={health.deadLetterJobs > 0} />
        <div className="flex items-center justify-between">
          <dt className="text-muted-foreground">Última sincronização</dt>
          <dd className="font-medium">{formatDate(health.lastSyncAt)}</dd>
        </div>
      </dl>

      {health.marketplace === 'SHOPEE' && (
        <div className="mt-4">
          {health.connected ? (
            <button
              onClick={onDisconnectShopee}
              disabled={connectingShopee || disconnectingShopee}
              className="flex w-full items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-xs hover:bg-muted disabled:opacity-50 transition-colors"
            >
              <Unlink className="h-3.5 w-3.5" />
              {disconnectingShopee ? 'Desconectando...' : 'Desconectar Shopee'}
            </button>
          ) : (
            <button
              onClick={onConnectShopee}
              disabled={connectingShopee || disconnectingShopee}
              className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-xs text-primary-foreground hover:opacity-90 disabled:opacity-50 transition-colors"
            >
              <Link2 className="h-3.5 w-3.5" />
              {connectingShopee ? 'Conectando...' : 'Conectar Shopee'}
            </button>
          )}
        </div>
      )}

      <div className="mt-2 flex gap-2">
        <button
          onClick={() => onAction(health.marketplace, 'retry')}
          disabled={retrying || syncing}
          className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-xs hover:bg-muted disabled:opacity-50 transition-colors"
        >
          <RotateCcw className={`h-3.5 w-3.5 ${retrying ? 'animate-spin' : ''}`} />
          Tentar novamente
        </button>
        <button
          onClick={() => onAction(health.marketplace, 'sync')}
          disabled={retrying || syncing}
          className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-xs hover:bg-muted disabled:opacity-50 transition-colors"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${syncing ? 'animate-spin' : ''}`} />
          Sincronizar agora
        </button>
      </div>
    </div>
  );
}

function Row({ label, value, danger }: { label: string; value: number; danger?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className={`font-medium ${danger ? 'text-destructive' : ''}`}>{value}</dd>
    </div>
  );
}
