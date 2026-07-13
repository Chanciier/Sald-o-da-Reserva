'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Search, ChevronLeft, ChevronRight, CheckCircle2 } from 'lucide-react';
import { useAuth } from '@/contexts/auth-context';
import { fetchConcluidos, cancelarPedido } from '@/actions/expedicao';
import type { OrderSummary } from '@/actions/expedicao';
import { DeliveryTabs, useDeliveryTab } from '../_components/delivery-tabs';

function shortId(id: string) {
  return '#' + id.slice(-8).toUpperCase();
}

function fmt(n: number) {
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export default function ConcluidosPage() {
  const { token } = useAuth();
  const qc = useQueryClient();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [deliveryMethod, setDeliveryMethod] = useDeliveryTab();
  const [confirmCancel, setConfirmCancel] = useState<string | null>(null);
  const [cancelError, setCancelError] = useState<string | null>(null);
  const [refundWarning, setRefundWarning] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['expedicao-concluidos', page, search, deliveryMethod],
    queryFn: () => fetchConcluidos(token!, { page, search, deliveryMethod }),
    enabled: !!token,
  });

  const cancelMutation = useMutation({
    mutationFn: (orderId: string) => cancelarPedido(token!, orderId),
    onSuccess: (result) => {
      if (!result.ok) {
        setCancelError(result.error);
        return;
      }
      setConfirmCancel(null);
      if (result.refundError) setRefundWarning(result.refundError);
      qc.invalidateQueries({ queryKey: ['expedicao-concluidos'] });
    },
  });

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    setSearch(searchInput);
    setPage(1);
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-2">
        <CheckCircle2 className="h-5 w-5 text-primary" />
        <h1 className="text-xl font-bold">Pedidos Concluídos</h1>
      </div>

      <DeliveryTabs
        value={deliveryMethod}
        onChange={(v) => {
          setDeliveryMethod(v);
          setPage(1);
        }}
      />

      {cancelError && (
        <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive flex items-center justify-between gap-3">
          <span>{cancelError}</span>
          <button
            onClick={() => setCancelError(null)}
            className="shrink-0 text-destructive/70 hover:text-destructive"
          >
            ✕
          </button>
        </div>
      )}

      {refundWarning && (
        <div className="rounded-lg border border-yellow-400/60 bg-yellow-50 dark:bg-yellow-900/20 px-4 py-3 text-sm text-yellow-800 dark:text-yellow-300 flex items-center justify-between gap-3">
          <span>
            Pedido cancelado, mas o estorno automático falhou: {refundWarning}. Realize o estorno
            manualmente no Mercado Pago.
          </span>
          <button
            onClick={() => setRefundWarning(null)}
            className="shrink-0 opacity-70 hover:opacity-100"
          >
            ✕
          </button>
        </div>
      )}

      <form onSubmit={handleSearch} className="flex gap-2">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <input
            type="text"
            placeholder="Buscar pedido ou cliente..."
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            className="h-9 rounded-lg border bg-background pl-8 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring w-64"
          />
        </div>
        <button
          type="submit"
          className="h-9 rounded-lg bg-primary px-3 text-sm text-primary-foreground hover:opacity-90"
        >
          Buscar
        </button>
        {search && (
          <button
            type="button"
            onClick={() => {
              setSearch('');
              setSearchInput('');
              setPage(1);
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
          <p className="py-16 text-center text-sm text-muted-foreground">
            Nenhum pedido concluído encontrado
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b bg-muted/40">
                <tr className="text-left text-xs text-muted-foreground">
                  <th className="px-4 py-3 font-medium">Pedido</th>
                  <th className="px-4 py-3 font-medium">Cliente</th>
                  <th className="px-4 py-3 font-medium">Data Pedido</th>
                  <th className="px-4 py-3 font-medium">Data Conclusão</th>
                  <th className="px-4 py-3 font-medium text-right">Valor</th>
                  <th className="px-4 py-3 font-medium">Ação</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {data.data.map((o: OrderSummary) => (
                  <tr key={o.id} className="hover:bg-muted/20 transition-colors">
                    <td className="px-4 py-3">
                      <span className="font-mono text-xs text-primary">{shortId(o.id)}</span>
                    </td>
                    <td className="px-4 py-3">
                      <p className="font-medium leading-tight">{o.user.name ?? '—'}</p>
                      <p className="text-xs text-muted-foreground">{o.user.email}</p>
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">
                      {new Date(o.createdAt).toLocaleDateString('pt-BR')}
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">
                      {new Date(o.updatedAt).toLocaleDateString('pt-BR')}
                    </td>
                    <td className="px-4 py-3 text-right font-semibold">{fmt(o.total)}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5">
                        {confirmCancel === o.id ? (
                          <>
                            <span className="text-xs text-muted-foreground">Cancelar?</span>
                            <button
                              onClick={() => cancelMutation.mutate(o.id)}
                              disabled={cancelMutation.isPending}
                              className="rounded-lg bg-destructive px-2.5 py-1.5 text-xs text-white hover:opacity-90 disabled:opacity-50"
                            >
                              {cancelMutation.isPending && cancelMutation.variables === o.id
                                ? '...'
                                : 'Sim'}
                            </button>
                            <button
                              onClick={() => setConfirmCancel(null)}
                              className="rounded-lg border px-2.5 py-1.5 text-xs hover:bg-muted"
                            >
                              Não
                            </button>
                          </>
                        ) : (
                          <button
                            onClick={() => setConfirmCancel(o.id)}
                            className="rounded-lg border border-destructive/50 px-2.5 py-1.5 text-xs text-destructive hover:bg-destructive/10"
                          >
                            Cancelar
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {data && data.pages > 1 && (
          <div className="flex items-center justify-between border-t px-4 py-3">
            <p className="text-xs text-muted-foreground">
              {data.total} pedidos · página {data.page} de {data.pages}
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
