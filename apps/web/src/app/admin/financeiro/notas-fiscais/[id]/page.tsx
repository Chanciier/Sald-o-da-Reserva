'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import {
  ArrowLeft,
  RefreshCw,
  Download,
  FileText,
  XCircle,
  RotateCcw,
  Send,
  Printer,
} from 'lucide-react';
import { useAuth } from '@/contexts/auth-context';
import {
  fetchInvoice,
  emitInvoice,
  reemitInvoice,
  cancelInvoice,
  syncInvoice,
  fetchInvoiceXml,
  fetchInvoiceDanfe,
} from '@/actions/invoices';

const STATUS_BADGE: Record<string, string> = {
  PENDING: 'bg-gray-100 text-gray-700',
  PROCESSING: 'bg-blue-100 text-blue-800',
  AUTHORIZED: 'bg-green-100 text-green-800',
  REJECTED: 'bg-red-100 text-red-800',
  CANCELLED: 'bg-slate-100 text-slate-600',
};

const STATUS_LABEL: Record<string, string> = {
  PENDING: 'Pendente',
  PROCESSING: 'Processando',
  AUTHORIZED: 'Autorizada',
  REJECTED: 'Rejeitada',
  CANCELLED: 'Cancelada',
};

const PAYMENT_METHOD: Record<string, string> = {
  PIX: 'Pix',
  CREDIT_CARD: 'Cartão de Crédito',
  DEBIT_CARD: 'Cartão de Débito',
  BOLETO: 'Boleto',
};

function fmt(n: number) {
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function fmtDate(s: string | null) {
  if (!s) return '—';
  return new Date(s).toLocaleString('pt-BR');
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between py-2 border-b last:border-0">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-xs font-medium text-right max-w-[60%] break-all">{value ?? '—'}</span>
    </div>
  );
}

export default function InvoiceDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { token } = useAuth();
  const router = useRouter();
  const qc = useQueryClient();
  const [error, setError] = useState('');

  const { data: invoice, isLoading } = useQuery({
    queryKey: ['invoice', id],
    queryFn: () => fetchInvoice(token!, id),
    enabled: !!token,
    refetchInterval: (q) => {
      const status = q.state.data?.status;
      return status === 'PROCESSING' || status === 'PENDING' ? 15000 : false;
    },
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ['invoice', id] });

  const emitMut = useMutation({
    mutationFn: () => emitInvoice(token!, invoice!.orderId),
    onSuccess: invalidate,
    onError: (e: Error) => setError(e.message),
  });

  const reemitMut = useMutation({
    mutationFn: () => reemitInvoice(token!, id),
    onSuccess: invalidate,
    onError: (e: Error) => setError(e.message),
  });

  const cancelMut = useMutation({
    mutationFn: () => cancelInvoice(token!, id),
    onSuccess: invalidate,
    onError: (e: Error) => setError(e.message),
  });

  const syncMut = useMutation({
    mutationFn: () => syncInvoice(token!, id),
    onSuccess: invalidate,
    onError: (e: Error) => setError(e.message),
  });

  const xmlMut = useMutation({
    mutationFn: () => fetchInvoiceXml(token!, id),
    onSuccess: (r) => {
      if (r.url) window.open(r.url, '_blank');
      else setError('URL do XML não disponível.');
    },
    onError: (e: Error) => setError(e.message),
  });

  const danfeMut = useMutation({
    mutationFn: () => fetchInvoiceDanfe(token!, id),
    onSuccess: (r) => {
      if (r.url) window.open(r.url, '_blank');
      else setError('URL do DANFE não disponível.');
    },
    onError: (e: Error) => setError(e.message),
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-32">
        <div className="h-7 w-7 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  if (!invoice) return <p className="text-sm text-muted-foreground">Nota não encontrada.</p>;

  const isProcessing =
    emitMut.isPending ||
    reemitMut.isPending ||
    cancelMut.isPending ||
    syncMut.isPending ||
    danfeMut.isPending;

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Header */}
      <div className="flex items-center gap-4">
        <button
          onClick={() => router.back()}
          className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> Voltar
        </button>
        <div className="flex-1">
          <h1 className="text-xl font-bold">
            NF-e {invoice.invoiceNumber ? `#${invoice.invoiceNumber}` : '—'}
          </h1>
          <p className="text-sm text-muted-foreground">
            Pedido {invoice.orderId.slice(-8).toUpperCase()}
          </p>
        </div>
        <span
          className={`inline-flex rounded-full px-3 py-1 text-xs font-medium ${STATUS_BADGE[invoice.status]}`}
        >
          {STATUS_LABEL[invoice.status]}
        </span>
      </div>

      {error && (
        <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
          <button onClick={() => setError('')} className="ml-2 underline text-xs">
            Fechar
          </button>
        </div>
      )}

      {/* Actions */}
      <div className="flex flex-wrap gap-2">
        {(invoice.status === 'PENDING' || invoice.status === 'REJECTED') && (
          <button
            onClick={() => emitMut.mutate()}
            disabled={isProcessing}
            className="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-xs text-primary-foreground hover:opacity-90 disabled:opacity-50"
          >
            <Send className="h-3.5 w-3.5" />
            {emitMut.isPending ? 'Emitindo…' : 'Emitir Nota'}
          </button>
        )}

        {(invoice.status === 'REJECTED' || invoice.status === 'CANCELLED') && (
          <button
            onClick={() => reemitMut.mutate()}
            disabled={isProcessing}
            className="flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs hover:bg-muted disabled:opacity-50"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            {reemitMut.isPending ? 'Reemitindo…' : 'Reemitir Nota'}
          </button>
        )}

        {invoice.status === 'AUTHORIZED' && (
          <button
            onClick={() => {
              if (window.confirm('Tem certeza que deseja cancelar esta nota fiscal?')) {
                cancelMut.mutate();
              }
            }}
            disabled={isProcessing}
            className="flex items-center gap-1.5 rounded-lg border border-destructive/40 px-3 py-2 text-xs text-destructive hover:bg-destructive/10 disabled:opacity-50"
          >
            <XCircle className="h-3.5 w-3.5" />
            {cancelMut.isPending ? 'Cancelando…' : 'Cancelar Nota'}
          </button>
        )}

        <button
          onClick={() => syncMut.mutate()}
          disabled={isProcessing}
          className="flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs hover:bg-muted disabled:opacity-50"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${syncMut.isPending ? 'animate-spin' : ''}`} />
          Sincronizar Status
        </button>

        <Link
          href={`/admin/financeiro/notas-fiscais/${id}/imprimir`}
          target="_blank"
          className="flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs hover:bg-muted transition-colors"
        >
          <Printer className="h-3.5 w-3.5" /> Imprimir DANFE
        </Link>

        {invoice.xmlUrl && (
          <button
            onClick={() => xmlMut.mutate()}
            disabled={xmlMut.isPending}
            className="flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs hover:bg-muted disabled:opacity-50"
          >
            <Download className="h-3.5 w-3.5" /> Baixar XML
          </button>
        )}

        {invoice.danfeUrl && (
          <button
            onClick={() => danfeMut.mutate()}
            disabled={danfeMut.isPending}
            className="flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs hover:bg-muted disabled:opacity-50"
          >
            <FileText className="h-3.5 w-3.5" /> Baixar DANFE
          </button>
        )}
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        {/* Invoice data */}
        <div className="rounded-xl border bg-card p-4">
          <h2 className="text-sm font-semibold mb-3">Dados da Nota</h2>
          <Row
            label="ID interno"
            value={<span className="font-mono text-[10px]">{invoice.id}</span>}
          />
          <Row
            label="Focus NFe Ref"
            value={
              invoice.focusReference ? (
                <span className="font-mono text-[10px]">{invoice.focusReference}</span>
              ) : null
            }
          />
          <Row label="Número NF" value={invoice.invoiceNumber} />
          <Row
            label="Chave de Acesso"
            value={
              invoice.accessKey ? (
                <span className="font-mono text-[10px] break-all">{invoice.accessKey}</span>
              ) : null
            }
          />
          <Row label="Protocolo" value={invoice.protocol} />
          <Row label="Data de Emissão" value={fmtDate(invoice.issueDate)} />
          <Row label="Data Cancelamento" value={fmtDate(invoice.cancellationDate)} />
          {invoice.errorMessage && (
            <div className="mt-3 rounded-lg bg-destructive/10 px-3 py-2">
              <p className="text-xs text-destructive font-medium">Erro</p>
              <p className="text-xs text-destructive mt-0.5">{invoice.errorMessage}</p>
            </div>
          )}
        </div>

        {/* Order / Customer data */}
        <div className="rounded-xl border bg-card p-4">
          <h2 className="text-sm font-semibold mb-3">Pedido e Cliente</h2>
          <Row
            label="Pedido"
            value={<span className="font-mono">{invoice.orderId.slice(-8).toUpperCase()}</span>}
          />
          <Row label="Status pedido" value={invoice.order.status} />
          <Row label="Total" value={fmt(invoice.order.total)} />
          <Row
            label="Pagamento"
            value={
              invoice.order.payment
                ? `${PAYMENT_METHOD[invoice.order.payment.method] ?? invoice.order.payment.method} · ${invoice.order.payment.status}`
                : null
            }
          />
          <div className="border-t my-2" />
          <Row label="Cliente" value={invoice.order.user.name} />
          <Row label="E-mail" value={invoice.order.user.email} />
        </div>

        {/* Items */}
        <div className="rounded-xl border bg-card p-4 lg:col-span-2">
          <h2 className="text-sm font-semibold mb-3">Itens do Pedido</h2>
          <table className="w-full text-xs">
            <thead className="border-b">
              <tr className="text-left text-muted-foreground">
                <th className="pb-2 font-medium">Produto</th>
                <th className="pb-2 font-medium">SKU</th>
                <th className="pb-2 font-medium text-right">Qtd</th>
                <th className="pb-2 font-medium text-right">Unitário</th>
                <th className="pb-2 font-medium text-right">Subtotal</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {invoice.order.items.map((item, i) => (
                <tr key={i} className="py-1">
                  <td className="py-2">{item.name}</td>
                  <td className="py-2 font-mono text-muted-foreground">{item.sku}</td>
                  <td className="py-2 text-right">{item.quantity}</td>
                  <td className="py-2 text-right">{fmt(item.price)}</td>
                  <td className="py-2 text-right font-medium">{fmt(item.subtotal)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
