'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight, Package } from 'lucide-react';
import { useAuth } from '@/contexts/auth-context';
import { fetchSeparacao, cancelarPedido } from '@/actions/expedicao';
import type { OrderSummary } from '@/actions/expedicao';

function shortId(id: string) {
  return '#' + id.slice(-8).toUpperCase();
}

function fmt(n: number) {
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function DeliveryBadge({ method }: { method: string }) {
  if (method === 'PICKUP')
    return (
      <span className="inline-flex items-center rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-800 dark:bg-blue-900/30 dark:text-blue-300">
        Retirada
      </span>
    );
  return (
    <span className="inline-flex items-center rounded-full bg-purple-100 px-2 py-0.5 text-xs font-medium text-purple-800 dark:bg-purple-900/30 dark:text-purple-300">
      Envio
    </span>
  );
}

export default function SeparacaoListPage() {
  const { token } = useAuth();
  const qc = useQueryClient();
  const [page, setPage] = useState(1);
  const [confirmCancel, setConfirmCancel] = useState<string | null>(null);
  const [cancelError, setCancelError] = useState<string | null>(null);

  const cancelMutation = useMutation({
    mutationFn: (orderId: string) => cancelarPedido(token!, orderId),
    onSuccess: (result) => {
      if (!result.ok) {
        setCancelError(result.error);
        return;
      }
      setConfirmCancel(null);
      qc.invalidateQueries({ queryKey: ['expedicao-separacao'] });
    },
  });

  const { data, isLoading } = useQuery({
    queryKey: ['expedicao-separacao', page],
    queryFn: () => fetchSeparacao(token!, { page }),
    enabled: !!token,
  });

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-2">
        <Package className="h-5 w-5 text-primary" />
        <h1 className="text-xl font-bold">Em Separação</h1>
      </div>

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

      <div className="rounded-xl border bg-card shadow-sm overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <div className="h-7 w-7 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          </div>
        ) : !data?.data.length ? (
          <p className="py-16 text-center text-sm text-muted-foreground">
            Nenhum pedido em separação
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b bg-muted/40">
                <tr className="text-left text-xs text-muted-foreground">
                  <th className="px-4 py-3 font-medium">Pedido</th>
                  <th className="px-4 py-3 font-medium">Cliente</th>
                  <th className="px-4 py-3 font-medium">Data</th>
                  <th className="px-4 py-3 font-medium">Tipo</th>
                  <th className="px-4 py-3 font-medium">Itens</th>
                  <th className="px-4 py-3 font-medium text-right">Total</th>
                  <th className="px-4 py-3 font-medium">Progresso</th>
                  <th className="px-4 py-3 font-medium">Ação</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {data.data.map((o: OrderSummary) => {
                  const separated = o.separatedItems?.length ?? 0;
                  const total = o._count.items;
                  return (
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
                      <td className="px-4 py-3">
                        <DeliveryBadge method={o.deliveryMethod} />
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">
                        {total} item{total !== 1 ? 'ns' : ''}
                      </td>
                      <td className="px-4 py-3 text-right font-semibold text-sm">{fmt(o.total)}</td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">
                        {separated}/{total}
                      </td>
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
                            <>
                              <Link
                                href={`/admin/expedicao/separacao/${o.id}`}
                                className="rounded-lg border px-3 py-1.5 text-xs hover:bg-muted transition-colors"
                              >
                                Continuar Separação
                              </Link>
                              <button
                                onClick={() => setConfirmCancel(o.id)}
                                className="rounded-lg border border-destructive/50 px-2.5 py-1.5 text-xs text-destructive hover:bg-destructive/10"
                              >
                                Cancelar
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
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
