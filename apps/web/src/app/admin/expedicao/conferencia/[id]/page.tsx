'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, FileText, Tag, CheckCircle2, Loader2, AlertCircle } from 'lucide-react';
import { useAuth } from '@/contexts/auth-context';
import { getOrder } from '@/lib/cart-api';
import { fetchInvoices, emitInvoice, reemitInvoice } from '@/actions/invoices';
import { purchaseLabel } from '@/lib/shipping';
import { marcarPronto, confirmarRetirada, cancelarPedido } from '@/actions/expedicao';
import type { Order } from '@/types/order';
import type { Invoice } from '@/actions/invoices';

const API = `${process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001'}/api/v1`;

const STATUS_LABEL: Record<string, string> = {
  PAID: 'Pago',
  SEPARATING: 'Em Separação',
  SEPARATED: 'Separado',
  READY_TO_SHIP: 'Pronto p/ Envio',
  SHIPPED: 'Enviado',
  DELIVERED: 'Entregue',
  CANCELLED: 'Cancelado',
  PENDING: 'Pendente',
  CONFIRMED: 'Confirmado',
};

const STATUS_COLOR: Record<string, string> = {
  PAID: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300',
  SEPARATING: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300',
  SEPARATED: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
  READY_TO_SHIP: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300',
  SHIPPED: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-300',
  DELIVERED: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300',
};

function fmt(n: number) {
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

async function patchStatus(token: string, orderId: string, status: string) {
  const res = await fetch(`${API}/orders/admin/${orderId}/status`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ status }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { message?: string }).message ?? `Erro ${res.status}`);
  return data;
}

export default function ConferenciaPage({ params }: { params: { id: string } }) {
  const { token } = useAuth();
  const router = useRouter();
  const qc = useQueryClient();
  const [labelError, setLabelError] = useState('');
  const [invoiceError, setInvoiceError] = useState('');
  const [danfePending, setDanfePending] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [cancelError, setCancelError] = useState('');
  const [refundWarning, setRefundWarning] = useState('');

  const { data: order, isLoading: orderLoading } = useQuery<Order>({
    queryKey: ['order', params.id],
    queryFn: () => getOrder(token!, params.id),
    enabled: !!token,
  });

  const {
    data: invoicesData,
    isLoading: invoiceLoading,
    refetch: refetchInvoice,
  } = useQuery({
    queryKey: ['invoice-order', params.id],
    queryFn: () => fetchInvoices(token!, { orderId: params.id, limit: '1' }),
    enabled: !!token,
  });

  const invoice: Invoice | undefined = invoicesData?.data?.[0];

  const emitMutation = useMutation({
    mutationFn: () => emitInvoice(token!, params.id),
    onSuccess: () => {
      setInvoiceError('');
      refetchInvoice();
    },
    onError: (e: Error) => setInvoiceError(e.message),
  });

  const reemitMutation = useMutation({
    mutationFn: () => reemitInvoice(token!, invoice!.id),
    onSuccess: () => {
      setInvoiceError('');
      refetchInvoice();
    },
    onError: (e: Error) => setInvoiceError(e.message),
  });

  const API_BASE = `${process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001'}/api/v1`;

  async function openDanfe() {
    setInvoiceError('');
    setDanfePending(true);
    try {
      const res = await fetch(`${API_BASE}/invoices/${invoice!.id}/danfe`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error((data as { message?: string }).message ?? `Erro HTTP ${res.status}`);
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      window.open(url, '_blank');
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (e) {
      setInvoiceError(e instanceof Error ? e.message : 'Erro ao baixar DANFE');
    } finally {
      setDanfePending(false);
    }
  }

  async function openXml() {
    setInvoiceError('');
    setDanfePending(true);
    try {
      const res = await fetch(`${API_BASE}/invoices/${invoice!.id}/xml/download`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error((data as { message?: string }).message ?? `Erro HTTP ${res.status}`);
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'nfe.xml';
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (e) {
      setInvoiceError(e instanceof Error ? e.message : 'Erro ao baixar XML');
    } finally {
      setDanfePending(false);
    }
  }

  const labelMutation = useMutation({
    mutationFn: () => purchaseLabel(params.id, token!),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['order', params.id] }),
    onError: (e: Error) => setLabelError(e.message),
  });

  const marcarMutation = useMutation({
    mutationFn: () => marcarPronto(token!, params.id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['order', params.id] }),
  });

  const confirmarEnvioMutation = useMutation({
    mutationFn: () => patchStatus(token!, params.id, 'SHIPPED'),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['order', params.id] });
      router.push('/admin/expedicao/enviados');
    },
  });

  const confirmarRetiradaMutation = useMutation({
    mutationFn: () => confirmarRetirada(token!, params.id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['order', params.id] });
      router.push('/admin/expedicao/concluidos');
    },
  });

  const cancelMutation = useMutation({
    mutationFn: () => cancelarPedido(token!, params.id),
    onSuccess: (result) => {
      if (!result.ok) {
        setCancelError(result.error);
        return;
      }
      if (result.refundError) {
        setRefundWarning(result.refundError);
        setConfirmCancel(false);
        return;
      }
      router.push('/admin/expedicao/fila');
    },
  });

  if (orderLoading || !order) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  const isPickup = (order as Order & { deliveryMethod?: string }).deliveryMethod === 'PICKUP';
  const pickupCode = (order as Order & { pickupCode?: string | null }).pickupCode;
  const shipment = order.shipment;
  const status = order.status;

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="flex items-center gap-3 flex-wrap">
        <Link
          href="/admin/expedicao/prontos"
          className="flex items-center gap-1 rounded-lg border px-3 py-1.5 text-xs hover:bg-muted transition-colors"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Voltar
        </Link>
        <h1 className="text-xl font-bold">Conferência — #{params.id.slice(-8).toUpperCase()}</h1>
        <span
          className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_COLOR[status] ?? 'bg-muted text-foreground'}`}
        >
          {STATUS_LABEL[status] ?? status}
        </span>
      </div>

      {/* 1. Resumo do Pedido */}
      <section className="rounded-xl border bg-card shadow-sm overflow-hidden">
        <div className="border-b px-4 py-3 flex items-center gap-2">
          <FileText className="h-4 w-4 text-muted-foreground" />
          <h2 className="font-semibold text-sm">Resumo do Pedido</h2>
        </div>
        <div className="p-4 space-y-3">
          <div className="space-y-2">
            {order.items.map((item) => (
              <div key={item.id} className="flex items-center justify-between text-sm">
                <div>
                  <span className="font-medium">{item.name}</span>
                  <span className="text-muted-foreground ml-2">× {item.quantity}</span>
                  <span className="text-xs text-muted-foreground ml-2">SKU: {item.sku}</span>
                </div>
                <span>{fmt(item.subtotal)}</span>
              </div>
            ))}
          </div>
          <div className="border-t pt-3 space-y-1 text-sm">
            <div className="flex justify-between text-muted-foreground">
              <span>Subtotal</span>
              <span>{fmt(order.subtotal)}</span>
            </div>
            {order.discount > 0 && (
              <div className="flex justify-between text-green-600">
                <span>Desconto</span>
                <span>-{fmt(order.discount)}</span>
              </div>
            )}
            {order.shipping > 0 && (
              <div className="flex justify-between text-muted-foreground">
                <span>Frete</span>
                <span>{fmt(order.shipping)}</span>
              </div>
            )}
            <div className="flex justify-between font-bold text-base border-t pt-2 mt-1">
              <span>Total</span>
              <span>{fmt(order.total)}</span>
            </div>
          </div>
        </div>
      </section>

      {/* 2. Nota Fiscal */}
      <section className="rounded-xl border bg-card shadow-sm overflow-hidden">
        <div className="border-b px-4 py-3 flex items-center gap-2">
          <FileText className="h-4 w-4 text-muted-foreground" />
          <h2 className="font-semibold text-sm">Nota Fiscal (NF-e)</h2>
        </div>
        <div className="p-4 space-y-3">
          {invoiceError && (
            <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive flex items-center justify-between gap-2">
              <span>Erro: {invoiceError}</span>
              <button
                onClick={() => setInvoiceError('')}
                className="shrink-0 opacity-70 hover:opacity-100"
              >
                ✕
              </button>
            </div>
          )}
          {invoiceLoading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Verificando NF-e...
            </div>
          ) : !invoice || invoice.status === 'PENDING' ? (
            <div className="flex items-center gap-3">
              <p className="text-sm text-muted-foreground">Nenhuma NF-e emitida.</p>
              <button
                onClick={() => emitMutation.mutate()}
                disabled={emitMutation.isPending}
                className="rounded-lg bg-primary px-3 py-1.5 text-xs text-primary-foreground hover:opacity-90 disabled:opacity-50"
              >
                {emitMutation.isPending ? (
                  <span className="flex items-center gap-1">
                    <Loader2 className="h-3 w-3 animate-spin" /> Emitindo...
                  </span>
                ) : (
                  'Emitir NF-e'
                )}
              </button>
            </div>
          ) : invoice.status === 'PROCESSING' ? (
            <div className="flex items-center gap-2 text-sm text-yellow-700 dark:text-yellow-300">
              <Loader2 className="h-4 w-4 animate-spin" /> Processando NF-e...
            </div>
          ) : invoice.status === 'AUTHORIZED' ? (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-green-500" />
                <span className="inline-flex items-center rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-800 dark:bg-green-900/30 dark:text-green-300">
                  Autorizada
                </span>
                {invoice.invoiceNumber && (
                  <span className="text-xs text-muted-foreground">
                    NF-e #{invoice.invoiceNumber}
                  </span>
                )}
              </div>
              <div className="flex gap-2 flex-wrap">
                <button
                  onClick={openDanfe}
                  disabled={danfePending}
                  className="rounded-lg border px-3 py-1.5 text-xs hover:bg-muted transition-colors disabled:opacity-50"
                >
                  {danfePending ? 'Buscando...' : 'Imprimir DANFE'}
                </button>
                <button
                  onClick={openXml}
                  disabled={danfePending}
                  className="rounded-lg border px-3 py-1.5 text-xs hover:bg-muted transition-colors disabled:opacity-50"
                >
                  Baixar XML
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-red-600 dark:text-red-400">
                <AlertCircle className="h-4 w-4" />
                <span className="text-sm">
                  {invoice.status === 'REJECTED' ? 'Rejeitada' : 'Cancelada'}
                </span>
                {invoice.errorMessage && (
                  <span className="text-xs text-muted-foreground">— {invoice.errorMessage}</span>
                )}
              </div>
              <button
                onClick={() => reemitMutation.mutate()}
                disabled={reemitMutation.isPending}
                className="rounded-lg bg-primary px-3 py-1.5 text-xs text-primary-foreground hover:opacity-90 disabled:opacity-50"
              >
                {reemitMutation.isPending ? 'Reemitindo...' : 'Reemitir NF-e'}
              </button>
            </div>
          )}
        </div>
      </section>

      {/* 3. Etiqueta de Envio */}
      {!isPickup ? (
        <section className="rounded-xl border bg-card shadow-sm overflow-hidden">
          <div className="border-b px-4 py-3 flex items-center gap-2">
            <Tag className="h-4 w-4 text-muted-foreground" />
            <h2 className="font-semibold text-sm">Etiqueta de Envio</h2>
          </div>
          <div className="p-4">
            {!shipment || !shipment.labelUrl ? (
              <div className="flex items-center gap-3">
                <p className="text-sm text-muted-foreground">Sem etiqueta gerada.</p>
                <button
                  onClick={() => {
                    setLabelError('');
                    labelMutation.mutate();
                  }}
                  disabled={labelMutation.isPending}
                  className="rounded-lg bg-primary px-3 py-1.5 text-xs text-primary-foreground hover:opacity-90 disabled:opacity-50"
                >
                  {labelMutation.isPending ? 'Gerando...' : 'Gerar Etiqueta'}
                </button>
                {labelError && <span className="text-xs text-red-500">{labelError}</span>}
              </div>
            ) : (
              <div className="space-y-2">
                <div className="text-sm text-muted-foreground">
                  <span className="font-medium text-foreground">{shipment.carrier}</span>
                  {shipment.trackingCode && (
                    <span className="ml-2 font-mono text-xs">{shipment.trackingCode}</span>
                  )}
                </div>
                <button
                  onClick={() => window.open(shipment.labelUrl!, '_blank')}
                  className="rounded-lg border px-3 py-1.5 text-xs hover:bg-muted transition-colors"
                >
                  Imprimir Etiqueta
                </button>
              </div>
            )}
          </div>
        </section>
      ) : (
        <section className="rounded-xl border bg-card shadow-sm overflow-hidden">
          <div className="border-b px-4 py-3 flex items-center gap-2">
            <Tag className="h-4 w-4 text-muted-foreground" />
            <h2 className="font-semibold text-sm">Etiqueta de Retirada</h2>
          </div>
          <div className="p-4 flex items-center gap-4">
            {pickupCode && (
              <span className="font-mono text-lg font-bold tracking-widest border rounded-lg px-3 py-1.5 bg-muted">
                {pickupCode}
              </span>
            )}
            <Link
              href={`/admin/expedicao/retirada/${params.id}/etiqueta`}
              target="_blank"
              className="rounded-lg border px-3 py-1.5 text-xs hover:bg-muted transition-colors"
            >
              Imprimir Etiqueta Interna
            </Link>
          </div>
        </section>
      )}

      {/* 4. Ações Finais */}
      <section className="rounded-xl border bg-card shadow-sm overflow-hidden">
        <div className="border-b px-4 py-3">
          <h2 className="font-semibold text-sm">Ações Finais</h2>
        </div>
        <div className="p-4 space-y-3">
          <div className="flex flex-wrap gap-3">
            {status !== 'READY_TO_SHIP' &&
              status !== 'SHIPPED' &&
              status !== 'DELIVERED' &&
              status !== 'CANCELLED' && (
                <button
                  onClick={() => marcarMutation.mutate()}
                  disabled={marcarMutation.isPending}
                  className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
                >
                  {marcarMutation.isPending ? 'Marcando...' : 'Marcar como Pronto'}
                </button>
              )}

            {!isPickup && (status === 'READY_TO_SHIP' || status === 'SEPARATED') && (
              <button
                onClick={() => confirmarEnvioMutation.mutate()}
                disabled={confirmarEnvioMutation.isPending}
                className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
              >
                {confirmarEnvioMutation.isPending ? 'Confirmando...' : 'Confirmar Envio'}
              </button>
            )}

            {isPickup && status !== 'DELIVERED' && status !== 'CANCELLED' && (
              <button
                onClick={() => confirmarRetiradaMutation.mutate()}
                disabled={confirmarRetiradaMutation.isPending}
                className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
              >
                {confirmarRetiradaMutation.isPending ? 'Confirmando...' : 'Confirmar Retirada'}
              </button>
            )}
          </div>

          {refundWarning && (
            <div className="rounded-lg border border-yellow-400/60 bg-yellow-50 dark:bg-yellow-900/20 px-4 py-3 text-sm text-yellow-800 dark:text-yellow-300">
              Pedido cancelado, mas o estorno automático falhou: {refundWarning}. Realize o estorno
              manualmente no Mercado Pago.
            </div>
          )}

          {status !== 'DELIVERED' && status !== 'SHIPPED' && status !== 'CANCELLED' && (
            <>
              {cancelError && <p className="text-xs text-destructive">{cancelError}</p>}
              {confirmCancel ? (
                <div className="flex items-center gap-3 rounded-lg border border-destructive/40 bg-destructive/5 px-4 py-3">
                  <span className="text-sm text-destructive font-medium">
                    Cancelar este pedido?
                  </span>
                  <button
                    onClick={() => cancelMutation.mutate()}
                    disabled={cancelMutation.isPending}
                    className="rounded-lg bg-destructive px-3 py-1.5 text-xs text-white hover:opacity-90 disabled:opacity-50"
                  >
                    {cancelMutation.isPending ? 'Cancelando...' : 'Confirmar Cancelamento'}
                  </button>
                  <button
                    onClick={() => setConfirmCancel(false)}
                    className="rounded-lg border px-3 py-1.5 text-xs hover:bg-muted"
                  >
                    Voltar
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setConfirmCancel(true)}
                  className="rounded-lg border border-destructive/50 px-4 py-2 text-sm text-destructive hover:bg-destructive/10 transition-colors"
                >
                  Cancelar Pedido
                </button>
              )}
            </>
          )}
        </div>
      </section>
    </div>
  );
}
