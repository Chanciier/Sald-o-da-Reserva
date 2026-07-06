'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight, FileText, Package, Printer, Truck } from 'lucide-react';
import { useAuth } from '@/contexts/auth-context';
import { fetchProntos, cancelarPedido, marcarEnviado, abrirEtiquetaMl } from '@/actions/expedicao';
import type { OrderSummary } from '@/actions/expedicao';
import { ChannelBadge } from '../_components/channel-badge';

function shortId(id: string) {
  return '#' + id.slice(-8).toUpperCase();
}

function InvoiceBadge({ invoices }: { invoices: OrderSummary['invoices'] }) {
  const inv = invoices?.[0];
  if (!inv) return <span className="text-xs text-muted-foreground">—</span>;
  const colors: Record<string, string> = {
    AUTHORIZED: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300',
    PROCESSING: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300',
    PENDING: 'bg-muted text-foreground',
    REJECTED: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300',
    CANCELLED: 'bg-gray-100 text-gray-700',
  };
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${colors[inv.status] ?? 'bg-muted text-foreground'}`}
    >
      {inv.status === 'AUTHORIZED' ? `NF-e #${inv.invoiceNumber ?? '—'}` : inv.status}
    </span>
  );
}

function EtiquetaBadge({ shipment }: { shipment: OrderSummary['shipment'] }) {
  if (!shipment) return <span className="text-xs text-muted-foreground">—</span>;
  if (shipment.trackingCode)
    return <span className="text-xs font-mono text-muted-foreground">{shipment.trackingCode}</span>;
  return (
    <span className="inline-flex items-center rounded-full bg-orange-100 px-2 py-0.5 text-xs font-medium text-orange-800 dark:bg-orange-900/30 dark:text-orange-300">
      Sem rastreio
    </span>
  );
}

export default function ProntosPage() {
  const { token } = useAuth();
  const qc = useQueryClient();
  const [page, setPage] = useState(1);
  const [confirmCancel, setConfirmCancel] = useState<string | null>(null);
  const [cancelError, setCancelError] = useState<string | null>(null);
  const [refundWarning, setRefundWarning] = useState<string | null>(null);
  const [labelBusy, setLabelBusy] = useState<string | null>(null);

  const cancelMutation = useMutation({
    mutationFn: (orderId: string) => cancelarPedido(token!, orderId),
    onSuccess: (result) => {
      if (!result.ok) {
        setCancelError(result.error);
        return;
      }
      setConfirmCancel(null);
      if (result.refundError) setRefundWarning(result.refundError);
      qc.invalidateQueries({ queryKey: ['expedicao-prontos'] });
    },
  });

  const shipMutation = useMutation({
    mutationFn: (orderId: string) => marcarEnviado(token!, orderId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['expedicao-prontos'] }),
    onError: (err) => setCancelError((err as Error).message),
  });

  async function handleMlLabel(orderId: string) {
    if (!token) return;
    setLabelBusy(orderId);
    setCancelError(null);
    try {
      await abrirEtiquetaMl(token, orderId);
    } catch (err) {
      setCancelError((err as Error).message);
    } finally {
      setLabelBusy(null);
    }
  }

  const { data, isLoading } = useQuery({
    queryKey: ['expedicao-prontos', page],
    queryFn: () => fetchProntos(token!, { page, deliveryMethod: 'SHIPPING' }),
    enabled: !!token,
  });

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-2">
        <Package className="h-5 w-5 text-primary" />
        <h1 className="text-xl font-bold">Prontos para Envio</h1>
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
            Nenhum pedido pronto para envio
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b bg-muted/40">
                <tr className="text-left text-xs text-muted-foreground">
                  <th className="px-4 py-3 font-medium">Pedido</th>
                  <th className="px-4 py-3 font-medium">Cliente</th>
                  <th className="px-4 py-3 font-medium">NF-e</th>
                  <th className="px-4 py-3 font-medium">Etiqueta</th>
                  <th className="px-4 py-3 font-medium">Ação</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {data.data.map((o: OrderSummary) => (
                  <tr key={o.id} className="hover:bg-muted/20 transition-colors">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs text-primary">{shortId(o.id)}</span>
                        <ChannelBadge channel={o.channel} />
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <p className="font-medium leading-tight">
                        {o.channel === 'SITE'
                          ? (o.user.name ?? '—')
                          : (o.buyerName ?? o.user.name ?? '—')}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {o.channel === 'SITE' ? o.user.email : 'Comprador do marketplace'}
                      </p>
                    </td>
                    <td className="px-4 py-3">
                      <InvoiceBadge invoices={o.invoices} />
                    </td>
                    <td className="px-4 py-3">
                      <EtiquetaBadge shipment={o.shipment} />
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
                            {o.channel === 'MERCADO_LIVRE' ? (
                              <>
                                <Link
                                  href={`/admin/expedicao/conferencia/${o.id}`}
                                  className="flex items-center gap-1 rounded border px-2 py-1 text-xs hover:bg-muted transition-colors"
                                >
                                  <FileText className="h-3.5 w-3.5" />
                                  Nota Fiscal
                                </Link>
                                <button
                                  onClick={() => handleMlLabel(o.id)}
                                  disabled={labelBusy === o.id}
                                  className="flex items-center gap-1 rounded border border-yellow-400 px-2 py-1 text-xs text-yellow-900 dark:text-yellow-200 hover:bg-yellow-100 dark:hover:bg-yellow-900/30 disabled:opacity-50 transition-colors"
                                >
                                  <Printer className="h-3.5 w-3.5" />
                                  {labelBusy === o.id ? '...' : 'Etiqueta ML'}
                                </button>
                                <button
                                  onClick={() => shipMutation.mutate(o.id)}
                                  disabled={shipMutation.isPending}
                                  className="flex items-center gap-1 rounded-lg bg-primary px-2.5 py-1.5 text-xs text-primary-foreground hover:opacity-90 disabled:opacity-50"
                                >
                                  <Truck className="h-3.5 w-3.5" />
                                  {shipMutation.isPending && shipMutation.variables === o.id
                                    ? 'Enviando...'
                                    : 'Marcar enviado'}
                                </button>
                              </>
                            ) : (
                              <Link
                                href={`/admin/expedicao/conferencia/${o.id}`}
                                className="rounded border px-2 py-1 text-xs hover:bg-muted transition-colors"
                              >
                                Conferência
                              </Link>
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
