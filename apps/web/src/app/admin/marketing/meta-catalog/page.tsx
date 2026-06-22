'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/contexts/auth-context';
import { CheckCircle2, XCircle, RefreshCw, AlertTriangle, Clock, Package } from 'lucide-react';

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

interface SyncError {
  productId: string;
  productName: string;
  productSlug: string;
  errorMessage: string | null;
  updatedAt: string;
}

interface CatalogStats {
  enabled: boolean;
  total: number;
  synced: number;
  errored: number;
  lastSyncedAt: string | null;
  errors: SyncError[];
}

function fmt(d: string | null) {
  if (!d) return '—';
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(d));
}

export default function MetaCatalogPage() {
  const { token } = useAuth();
  const qc = useQueryClient();
  const [syncMsg, setSyncMsg] = useState('');

  const { data, isLoading, error } = useQuery<CatalogStats>({
    queryKey: ['meta-catalog-stats'],
    queryFn: async () => {
      const res = await fetch(`${API}/api/v1/admin/meta-catalog/stats`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('Erro ao carregar stats');
      return res.json() as Promise<CatalogStats>;
    },
    enabled: !!token,
    refetchInterval: 30_000,
  });

  const syncMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`${API}/api/v1/admin/meta-catalog/sync`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('Erro ao sincronizar');
      return res.json() as Promise<{ synced: number; errors: number; message: string }>;
    },
    onSuccess: (result) => {
      setSyncMsg(result.message);
      void qc.invalidateQueries({ queryKey: ['meta-catalog-stats'] });
      setTimeout(() => setSyncMsg(''), 5000);
    },
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="h-6 w-6 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-6 text-sm text-destructive">
        Erro ao carregar dados do Meta Catalog.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Meta Catalog</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Sincronização de produtos com o catálogo do Meta (Facebook/Instagram)
          </p>
        </div>
        <button
          onClick={() => syncMutation.mutate()}
          disabled={syncMutation.isPending || !data?.enabled}
          className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60 transition-colors"
        >
          <RefreshCw className={`h-4 w-4 ${syncMutation.isPending ? 'animate-spin' : ''}`} />
          {syncMutation.isPending ? 'Sincronizando...' : 'Sincronizar Tudo'}
        </button>
      </div>

      {syncMsg && (
        <div className="rounded-lg bg-green-50 border border-green-200 px-4 py-3 text-sm text-green-800">
          {syncMsg}
        </div>
      )}

      {syncMutation.isError && (
        <div className="rounded-lg bg-destructive/10 border border-destructive/30 px-4 py-3 text-sm text-destructive">
          Erro ao sincronizar. Verifique as variáveis META_CATALOG_ID e META_CATALOG_ACCESS_TOKEN.
        </div>
      )}

      {/* Status badge */}
      {!data?.enabled && (
        <div className="flex items-center gap-2 rounded-xl border border-yellow-200 bg-yellow-50 px-4 py-3 text-sm text-yellow-800">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span>
            Integração desativada. Configure{' '}
            <code className="font-mono text-xs">META_CATALOG_ID</code> e{' '}
            <code className="font-mono text-xs">META_CATALOG_ACCESS_TOKEN</code> no Railway.
          </span>
        </div>
      )}

      {/* Stats cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          icon={<Package className="h-5 w-5 text-muted-foreground" />}
          label="Registros totais"
          value={String(data?.total ?? 0)}
        />
        <StatCard
          icon={<CheckCircle2 className="h-5 w-5 text-green-600" />}
          label="Sincronizados"
          value={String(data?.synced ?? 0)}
          highlight="green"
        />
        <StatCard
          icon={<XCircle className="h-5 w-5 text-destructive" />}
          label="Com erro"
          value={String(data?.errored ?? 0)}
          highlight={data?.errored ? 'red' : undefined}
        />
        <StatCard
          icon={<Clock className="h-5 w-5 text-muted-foreground" />}
          label="Última sincronização"
          value={fmt(data?.lastSyncedAt ?? null)}
          small
        />
      </div>

      {/* Errors table */}
      {(data?.errors?.length ?? 0) > 0 && (
        <div className="rounded-xl border border-border">
          <div className="border-b border-border px-5 py-3">
            <h2 className="font-semibold text-sm">Produtos com erro</h2>
          </div>
          <div className="divide-y divide-border">
            {data!.errors.map((e) => (
              <div key={e.productId} className="flex items-start justify-between gap-4 px-5 py-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{e.productName}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground truncate">
                    {e.errorMessage ?? 'Erro desconhecido'}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <span className="inline-flex items-center gap-1 rounded-full bg-destructive/10 px-2 py-0.5 text-xs font-medium text-destructive">
                    <XCircle className="h-3 w-3" /> Erro
                  </span>
                  <p className="mt-1 text-xs text-muted-foreground">{fmt(e.updatedAt)}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {data?.enabled && (data?.errors?.length ?? 0) === 0 && data?.synced > 0 && (
        <div className="flex items-center gap-2 rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          Todos os produtos estão sincronizados com o Meta Catalog.
        </div>
      )}

      {/* Instructions */}
      <div className="rounded-xl border border-border bg-muted/30 p-5 space-y-3">
        <h2 className="font-semibold text-sm">Como configurar</h2>
        <ol className="space-y-1.5 text-sm text-muted-foreground list-decimal list-inside">
          <li>
            Acesse <strong>Meta Commerce Manager</strong> → Catálogos → crie ou selecione um
            catálogo
          </li>
          <li>
            Copie o <strong>ID do catálogo</strong> na URL ou em Configurações do catálogo
          </li>
          <li>
            Gere um token em{' '}
            <strong>Events Manager → Pixel → Configurações → Gerar token de acesso</strong> (ou use
            um System User token com permissão{' '}
            <code className="font-mono text-xs">catalog_management</code>)
          </li>
          <li>
            No Railway, adicione as variáveis:
            <br />
            <code className="font-mono text-xs block mt-1 bg-background border border-border rounded px-2 py-1">
              META_CATALOG_ID=seu_id_aqui
              <br />
              META_CATALOG_ACCESS_TOKEN=seu_token_aqui
            </code>
          </li>
          <li>Clique em &quot;Sincronizar Tudo&quot; para sincronização inicial</li>
        </ol>
      </div>
    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
  highlight,
  small,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  highlight?: 'green' | 'red';
  small?: boolean;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-4 space-y-2">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        {icon}
        {label}
      </div>
      <p
        className={`font-bold ${small ? 'text-base' : 'text-2xl'} ${
          highlight === 'green'
            ? 'text-green-600'
            : highlight === 'red'
              ? 'text-destructive'
              : 'text-foreground'
        }`}
      >
        {value}
      </p>
    </div>
  );
}
