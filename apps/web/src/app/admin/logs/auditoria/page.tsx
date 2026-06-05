'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ScrollText, RefreshCw, ChevronLeft, ChevronRight, Search } from 'lucide-react';
import { useAuth } from '@/contexts/auth-context';

const BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

async function fetchAuditLogs(token: string, page: number, action: string) {
  const params = new URLSearchParams({ page: String(page), limit: '30' });
  if (action) params.set('action', action);
  const res = await fetch(`${BASE}/api/v1/admin/rbac/audit-logs?${params}`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: 'no-store',
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message ?? 'Erro');
  return data;
}

const ACTION_COLORS: Record<string, string> = {
  ROLE_ASSIGNED: 'bg-blue-100 text-blue-800',
  'payment.created': 'bg-green-100 text-green-800',
  'payment.updated': 'bg-purple-100 text-purple-800',
  'invoice.emitted': 'bg-orange-100 text-orange-800',
};

export default function AdminAuditoria() {
  const { token } = useAuth();
  const [page, setPage] = useState(1);
  const [action, setAction] = useState('');
  const [actionInput, setActionInput] = useState('');

  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: ['admin-audit-logs', page, action],
    queryFn: () => fetchAuditLogs(token!, page, action),
    enabled: !!token,
  });

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">Auditoria</h1>
          <p className="text-sm text-muted-foreground">Registro de ações no sistema</p>
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

      <form
        onSubmit={(e) => {
          e.preventDefault();
          setAction(actionInput);
          setPage(1);
        }}
        className="flex gap-2"
      >
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <input
            type="text"
            placeholder="Filtrar por ação (ex: payment, ROLE)..."
            value={actionInput}
            onChange={(e) => setActionInput(e.target.value)}
            className="h-9 w-72 rounded-lg border bg-background pl-8 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
        <button
          type="submit"
          className="h-9 rounded-lg bg-primary px-3 text-sm text-primary-foreground"
        >
          Filtrar
        </button>
        {action && (
          <button
            type="button"
            onClick={() => {
              setAction('');
              setActionInput('');
            }}
            className="h-9 rounded-lg border px-3 text-sm hover:bg-muted"
          >
            Limpar
          </button>
        )}
      </form>

      <div className="rounded-xl border bg-card shadow-sm overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <div className="h-7 w-7 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          </div>
        ) : !data?.data.length ? (
          <div className="flex flex-col items-center gap-3 py-16 text-center">
            <ScrollText className="h-10 w-10 text-muted-foreground/40" />
            <p className="text-sm text-muted-foreground">Nenhum log encontrado</p>
          </div>
        ) : (
          <div className="divide-y">
            {data.data.map(
              (log: {
                id: string;
                action: string;
                userId: string | null;
                ipAddress: string | null;
                metadata: Record<string, unknown> | null;
                createdAt: string;
                user: { email: string; name: string | null } | null;
              }) => (
                <div
                  key={log.id}
                  className="flex items-start justify-between px-5 py-3.5 hover:bg-muted/20 transition-colors"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span
                        className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium shrink-0 ${ACTION_COLORS[log.action] ?? 'bg-muted text-muted-foreground'}`}
                      >
                        {log.action}
                      </span>
                      {log.user && (
                        <span className="text-xs text-muted-foreground">
                          por{' '}
                          <span className="font-medium text-foreground">
                            {log.user.name ?? log.user.email}
                          </span>
                        </span>
                      )}
                    </div>
                    {log.metadata && (
                      <p className="mt-1 text-xs text-muted-foreground font-mono truncate max-w-lg">
                        {JSON.stringify(log.metadata)}
                      </p>
                    )}
                    {log.ipAddress && (
                      <p className="text-xs text-muted-foreground/60 mt-0.5">IP: {log.ipAddress}</p>
                    )}
                  </div>
                  <span className="shrink-0 ml-4 text-xs text-muted-foreground whitespace-nowrap">
                    {new Date(log.createdAt).toLocaleString('pt-BR', {
                      day: '2-digit',
                      month: '2-digit',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </span>
                </div>
              ),
            )}
          </div>
        )}

        {data && data.pages > 1 && (
          <div className="flex items-center justify-between border-t px-4 py-3">
            <p className="text-xs text-muted-foreground">
              {data.total} logs · página {data.page} de {data.pages}
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="flex items-center gap-1 rounded border px-2.5 py-1.5 text-xs hover:bg-muted disabled:opacity-40"
              >
                <ChevronLeft className="h-3.5 w-3.5" /> Anterior
              </button>
              <button
                onClick={() => setPage((p) => Math.min(data.pages, p + 1))}
                disabled={page === data.pages}
                className="flex items-center gap-1 rounded border px-2.5 py-1.5 text-xs hover:bg-muted disabled:opacity-40"
              >
                Próxima <ChevronRight className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
