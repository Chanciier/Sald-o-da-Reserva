'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight, Store, PackageCheck, Clock } from 'lucide-react';
import { useAuth } from '@/contexts/auth-context';
import {
  fetchRetirada,
  marcarPronto,
  confirmarRetirada,
  cancelarPedido,
} from '@/actions/expedicao';
import type { OrderSummary } from '@/actions/expedicao';

type Grupo = 'separados' | 'prontos';

const STATUS_LABEL: Record<string, string> = {
  PAID: 'Pago',
  SEPARATING: 'Em Separação',
  SEPARATED: 'Separado',
  READY_TO_SHIP: 'Pronto p/ Retirada',
  SHIPPED: 'Enviado',
  DELIVERED: 'Entregue',
};

const STATUS_COLOR: Record<string, string> = {
  PAID: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300',
  SEPARATING: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300',
  SEPARATED: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
  READY_TO_SHIP: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300',
};

function shortId(id: string) {
  return '#' + id.slice(-8).toUpperCase();
}

function useGrupoTab(): [Grupo, (g: Grupo) => void] {
  const [grupo, setGrupo] = useState<Grupo>('separados');
  useEffect(() => {
    const g = new URLSearchParams(window.location.search).get('grupo');
    if (g === 'separados' || g === 'prontos') setGrupo(g);
  }, []);
  return [grupo, setGrupo];
}

export default function RetiradaPage() {
  const { token } = useAuth();
  const qc = useQueryClient();
  const [page, setPage] = useState(1);
  const [grupo, setGrupo] = useGrupoTab();
  const [confirmCancel, setConfirmCancel] = useState<string | null>(null);
  const [cancelError, setCancelError] = useState<string | null>(null);
  const [refundWarning, setRefundWarning] = useState<string | null>(null);

  const cancelMutation = useMutation({
    mutationFn: (orderId: string) => cancelarPedido(token!, orderId),
    onSuccess: (result) => {
      if (!result.ok) {
        setCancelError(result.error);
        return;
      }
      setConfirmCancel(null);
      if (result.refundError) setRefundWarning(result.refundError);
      qc.invalidateQueries({ queryKey: ['expedicao-retirada'] });
    },
  });

  const { data, isLoading } = useQuery({
    queryKey: ['expedicao-retirada', grupo, page],
    queryFn: () => fetchRetirada(token!, { page, grupo }),
    enabled: !!token,
  });

  const prontoMutation = useMutation({
    mutationFn: (orderId: string) => marcarPronto(token!, orderId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['expedicao-retirada'] }),
  });

  const mutation = useMutation({
    mutationFn: (orderId: string) => confirmarRetirada(token!, orderId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['expedicao-retirada'] }),
  });

  function handleGrupo(g: Grupo) {
    setGrupo(g);
    setPage(1);
    setConfirmCancel(null);
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-2">
        <Store className="h-5 w-5 text-primary" />
        <h1 className="text-xl font-bold">Retirada na Loja</h1>
      </div>

      {/* Tabs */}
      <div className="inline-flex rounded-lg border bg-card p-1">
        <button
          type="button"
          onClick={() => handleGrupo('separados')}
          className={`flex items-center gap-1.5 rounded-md px-4 py-1.5 text-sm font-medium transition-colors ${
            grupo === 'separados'
              ? 'bg-primary text-primary-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          <PackageCheck className="h-4 w-4" />
          Separados
        </button>
        <button
          type="button"
          onClick={() => handleGrupo('prontos')}
          className={`flex items-center gap-1.5 rounded-md px-4 py-1.5 text-sm font-medium transition-colors ${
            grupo === 'prontos'
              ? 'bg-primary text-primary-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          <Clock className="h-4 w-4" />
          Aguardando Retirada
        </button>
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

      <div className="rounded-xl border bg-card shadow-sm overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <div className="h-7 w-7 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          </div>
        ) : !data?.data.length ? (
          <p className="py-16 text-center text-sm text-muted-foreground">
            {grupo === 'separados'
              ? 'Nenhum pedido separado aguardando ser posto no balcão'
              : 'Nenhum pedido aguardando retirada pelo cliente'}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b bg-muted/40">
                <tr className="text-left text-xs text-muted-foreground">
                  <th className="px-4 py-3 font-medium">Código Retirada</th>
                  <th className="px-4 py-3 font-medium">Pedido</th>
                  <th className="px-4 py-3 font-medium">Cliente</th>
                  <th className="px-4 py-3 font-medium">Data</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Ação</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {data.data.map((o: OrderSummary) => (
                  <tr key={o.id} className="hover:bg-muted/20 transition-colors">
                    <td className="px-4 py-3">
                      <span className="font-mono text-sm font-bold tracking-wider">
                        {o.pickupCode ?? '—'}
                      </span>
                    </td>
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
                      <span
                        className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_COLOR[o.status] ?? 'bg-muted text-foreground'}`}
                      >
                        {STATUS_LABEL[o.status] ?? o.status}
                      </span>
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
                              href={`/pedidos/${o.id}`}
                              className="rounded-lg border px-2.5 py-1.5 text-xs hover:bg-muted transition-colors"
                            >
                              Ver
                            </Link>
                            {grupo === 'separados' ? (
                              <button
                                onClick={() => prontoMutation.mutate(o.id)}
                                disabled={prontoMutation.isPending}
                                className="rounded-lg bg-amber-500 px-3 py-1.5 text-xs text-white hover:opacity-90 disabled:opacity-50"
                              >
                                {prontoMutation.isPending && prontoMutation.variables === o.id
                                  ? 'Salvando...'
                                  : 'Pronto na Loja'}
                              </button>
                            ) : (
                              <button
                                onClick={() => mutation.mutate(o.id)}
                                disabled={mutation.isPending}
                                className="rounded-lg bg-primary px-3 py-1.5 text-xs text-primary-foreground hover:opacity-90 disabled:opacity-50"
                              >
                                {mutation.isPending && mutation.variables === o.id
                                  ? 'Confirmando...'
                                  : 'Confirmar Retirada'}
                              </button>
                            )}
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
