'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  X,
  ExternalLink,
  Package,
  RotateCcw,
} from 'lucide-react';
import { useAuth } from '@/contexts/auth-context';

const BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

const STATUS_OPTIONS = [
  { value: '', label: 'Todos' },
  { value: 'PENDING', label: 'Solicitada' },
  { value: 'IN_REVIEW', label: 'Em análise' },
  { value: 'APPROVED', label: 'Aprovada' },
  { value: 'REJECTED', label: 'Recusada' },
  { value: 'COMPLETED', label: 'Concluída' },
];

const NEXT_STATUSES: Record<string, { value: string; label: string; variant: string }[]> = {
  PENDING: [
    { value: 'IN_REVIEW', label: 'Iniciar análise', variant: 'blue' },
    { value: 'REJECTED', label: 'Recusar', variant: 'red' },
  ],
  IN_REVIEW: [
    { value: 'APPROVED', label: 'Aprovar', variant: 'green' },
    { value: 'REJECTED', label: 'Recusar', variant: 'red' },
  ],
  APPROVED: [{ value: 'COMPLETED', label: 'Marcar como concluída', variant: 'gray' }],
  REJECTED: [],
  COMPLETED: [],
};

const VARIANT_CLASS: Record<string, string> = {
  blue: 'border-blue-300 bg-blue-50 text-blue-700 dark:border-blue-700 dark:bg-blue-900/20 dark:text-blue-300',
  green:
    'border-green-300 bg-green-50 text-green-700 dark:border-green-700 dark:bg-green-900/20 dark:text-green-300',
  red: 'border-red-300 bg-red-50 text-red-700 dark:border-red-700 dark:bg-red-900/20 dark:text-red-300',
  gray: 'border-border hover:bg-muted',
};

const STATUS_COLOR: Record<string, string> = {
  PENDING: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300',
  IN_REVIEW: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
  APPROVED: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300',
  REJECTED: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300',
  COMPLETED: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300',
};

const REASON_LABEL: Record<string, string> = {
  REGRET: 'Arrependimento',
  DEFECT: 'Defeito',
  WRONG_ITEM: 'Produto incorreto',
  OTHER: 'Outro',
};

interface ReturnRequest {
  id: string;
  orderId: string;
  reason: string;
  notes: string | null;
  status: string;
  adminNotes: string | null;
  meOrderId: string | null;
  trackingCode: string | null;
  labelUrl: string | null;
  postedAt: string | null;
  returnDeliveredAt: string | null;
  refundId: string | null;
  refundAmount: number | null;
  refundStatus: string | null;
  refundedAt: string | null;
  createdAt: string;
  user: { id: string; name: string | null; email: string };
  order: {
    id: string;
    total: number;
    deliveryMethod: string;
    pickupCode: string | null;
    items: { name: string }[];
  };
}

interface ReturnsResponse {
  data: ReturnRequest[];
  total: number;
  page: number;
  pages: number;
}

async function fetchReturns(token: string, page: number, status: string) {
  const params = new URLSearchParams({ page: String(page), limit: '20' });
  if (status) params.set('status', status);
  const res = await fetch(`${BASE}/api/v1/returns?${params}`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: 'no-store',
  });
  const data = await res.json();
  if (!res.ok) throw new Error((data as { message?: string }).message ?? 'Erro');
  return data as ReturnsResponse;
}

async function patchReturnStatus(token: string, id: string, status: string, adminNotes?: string) {
  const res = await fetch(`${BASE}/api/v1/returns/${id}/status`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ status, adminNotes: adminNotes ?? null }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error((data as { message?: string }).message ?? 'Erro');
  return data as ReturnRequest;
}

async function doSyncTracking(token: string, id: string) {
  const res = await fetch(`${BASE}/api/v1/returns/${id}/sync-tracking`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await res.json();
  if (!res.ok) throw new Error((data as { message?: string }).message ?? 'Erro');
  return data as ReturnRequest;
}

async function doRefund(token: string, id: string, amount?: number) {
  const res = await fetch(`${BASE}/api/v1/returns/${id}/refund`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(amount !== undefined ? { amount } : {}),
  });
  const data = await res.json();
  if (!res.ok) throw new Error((data as { message?: string }).message ?? 'Erro');
  return data as ReturnRequest;
}

function fmt(n: number) {
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function ManageModal({
  request: initialRequest,
  token,
  onClose,
  onSuccess,
}: {
  request: ReturnRequest;
  token: string;
  onClose: () => void;
  onSuccess: (updated: ReturnRequest) => void;
}) {
  const [request, setRequest] = useState(initialRequest);
  const [newStatus, setNewStatus] = useState('');
  const [adminNotes, setAdminNotes] = useState(request.adminNotes ?? '');
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [refunding, setRefunding] = useState(false);
  const [refundPartial, setRefundPartial] = useState(false);
  const [refundValue, setRefundValue] = useState('');
  const [error, setError] = useState('');

  const next = NEXT_STATUSES[request.status] ?? [];
  const notesChanged = adminNotes !== (request.adminNotes ?? '');
  const canSave = !!newStatus || notesChanged;
  const isPickup = request.order?.deliveryMethod === 'PICKUP' || !!request.order?.pickupCode;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSave) return;
    setError('');
    setLoading(true);
    try {
      const updated = await patchReturnStatus(
        token,
        request.id,
        newStatus || request.status,
        adminNotes || undefined,
      );
      setRequest(updated);
      setNewStatus('');
      setAdminNotes(updated.adminNotes ?? '');
      onSuccess(updated);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  async function handleRefund() {
    setError('');
    setRefunding(true);
    try {
      const parsedAmount = refundPartial && refundValue ? parseFloat(refundValue) : undefined;
      const updated = await doRefund(token, request.id, parsedAmount);
      setRequest(updated);
      setRefundPartial(false);
      setRefundValue('');
      onSuccess(updated);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setRefunding(false);
    }
  }

  async function handleSyncTracking() {
    setSyncing(true);
    setError('');
    try {
      const updated = await doSyncTracking(token, request.id);
      setRequest(updated);
      onSuccess(updated);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSyncing(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-lg rounded-2xl border bg-card shadow-xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between border-b px-5 py-4">
          <div>
            <h2 className="font-semibold">Gerenciar Devolução</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              #{request.id.slice(-8).toUpperCase()} · {request.user?.name ?? request.user?.email}
            </p>
          </div>
          <button onClick={onClose} className="rounded-lg p-1 hover:bg-muted transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {/* Request details */}
          <div className="grid grid-cols-2 gap-3 rounded-lg bg-muted/40 p-3 text-sm">
            <div>
              <p className="text-xs text-muted-foreground">Pedido</p>
              <Link
                href={`/pedidos/${request.orderId}`}
                className="font-mono text-xs text-primary hover:underline"
              >
                #{request.orderId.slice(-8).toUpperCase()}
              </Link>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Valor do pedido</p>
              <p className="text-xs font-medium">{fmt(request.order.total)}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Motivo</p>
              <p className="text-xs font-medium">
                {REASON_LABEL[request.reason] ?? request.reason}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Status atual</p>
              <span
                className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_COLOR[request.status] ?? 'bg-muted text-foreground'}`}
              >
                {STATUS_OPTIONS.find((s) => s.value === request.status)?.label ?? request.status}
              </span>
            </div>
            {request.notes && (
              <div className="col-span-2">
                <p className="text-xs text-muted-foreground">Observação do cliente</p>
                <p className="text-xs">{request.notes}</p>
              </div>
            )}
          </div>

          {/* Reverse shipping info */}
          {isPickup ? (
            <div className="rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/20 p-3 space-y-1">
              <div className="flex items-center gap-2">
                <Package className="h-3.5 w-3.5 text-amber-600" />
                <p className="text-xs font-medium text-amber-700 dark:text-amber-400">
                  Devolução presencial
                </p>
              </div>
              <p className="text-xs text-amber-700 dark:text-amber-400">
                Pedido de retirada — o cliente deve trazer o item à loja.
              </p>
              <p className="text-xs text-muted-foreground">
                Rua Andorra, 500 — Shopping Jardim Oriente, São José dos Campos/SP
              </p>
              <p className="text-xs text-muted-foreground">
                Marque como <strong>Concluída</strong> ao receber o item para liberar o reembolso.
              </p>
            </div>
          ) : request.meOrderId || request.status === 'APPROVED' ? (
            <div className="rounded-lg border p-3 space-y-2">
              <div className="flex items-center gap-2">
                <Package className="h-3.5 w-3.5 text-muted-foreground" />
                <p className="text-xs font-medium">Logística Reversa</p>
              </div>

              {request.meOrderId ? (
                <div className="space-y-2">
                  {request.trackingCode && (
                    <div>
                      <p className="text-xs text-muted-foreground">Código de rastreio</p>
                      <p className="font-mono text-xs font-semibold">{request.trackingCode}</p>
                    </div>
                  )}

                  {request.labelUrl && (
                    <a
                      href={request.labelUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium hover:bg-muted transition-colors"
                    >
                      <ExternalLink className="h-3 w-3" />
                      Baixar etiqueta de devolução
                    </a>
                  )}

                  {request.postedAt && (
                    <p className="text-xs text-muted-foreground">
                      Postado em: {new Date(request.postedAt).toLocaleDateString('pt-BR')}
                    </p>
                  )}
                  {request.returnDeliveredAt && (
                    <p className="text-xs text-green-600 dark:text-green-400">
                      Recebido em: {new Date(request.returnDeliveredAt).toLocaleDateString('pt-BR')}
                    </p>
                  )}

                  {!request.returnDeliveredAt && (
                    <button
                      type="button"
                      onClick={handleSyncTracking}
                      disabled={syncing}
                      className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground disabled:opacity-50 transition-colors"
                    >
                      <RefreshCw className={`h-3 w-3 ${syncing ? 'animate-spin' : ''}`} />
                      {syncing ? 'Sincronizando...' : 'Sincronizar rastreio'}
                    </button>
                  )}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">
                  A etiqueta será gerada automaticamente ao aprovar a solicitação.
                </p>
              )}
            </div>
          ) : null}

          {/* Refund panel */}
          {request.status === 'COMPLETED' && (
            <div className="rounded-lg border p-3 space-y-3">
              <div className="flex items-center gap-2">
                <RotateCcw className="h-3.5 w-3.5 text-muted-foreground" />
                <p className="text-xs font-medium">Reembolso</p>
              </div>

              {request.refundedAt ? (
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">Valor reembolsado</span>
                    <span className="text-sm font-semibold text-green-600">
                      {(request.refundAmount ?? 0).toLocaleString('pt-BR', {
                        style: 'currency',
                        currency: 'BRL',
                      })}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Processado em {new Date(request.refundedAt).toLocaleDateString('pt-BR')} · ID:{' '}
                    {request.refundId}
                  </p>
                  <span className="inline-flex items-center rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">
                    {request.refundStatus === 'approved'
                      ? 'Aprovado'
                      : (request.refundStatus ?? 'Processado')}
                  </span>
                </div>
              ) : (
                <div className="space-y-3">
                  <p className="text-xs text-muted-foreground">
                    Valor do pedido: <strong>{fmt(request.order.total)}</strong>
                  </p>

                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setRefundPartial(false)}
                      className={`flex-1 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
                        !refundPartial
                          ? 'border-primary bg-primary text-primary-foreground'
                          : 'hover:bg-muted'
                      }`}
                    >
                      Reembolso total
                    </button>
                    <button
                      type="button"
                      onClick={() => setRefundPartial(true)}
                      className={`flex-1 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
                        refundPartial
                          ? 'border-primary bg-primary text-primary-foreground'
                          : 'hover:bg-muted'
                      }`}
                    >
                      Reembolso parcial
                    </button>
                  </div>

                  {refundPartial && (
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
                        R$
                      </span>
                      <input
                        type="number"
                        step="0.01"
                        min="0.01"
                        max={request.order.total}
                        value={refundValue}
                        onChange={(e) => setRefundValue(e.target.value)}
                        placeholder="0,00"
                        className="w-full rounded-lg border bg-background pl-8 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                      />
                    </div>
                  )}

                  <button
                    type="button"
                    onClick={handleRefund}
                    disabled={refunding || (refundPartial && !refundValue)}
                    className="w-full rounded-lg bg-blue-600 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-40 transition-colors"
                  >
                    {refunding
                      ? 'Processando...'
                      : refundPartial
                        ? 'Confirmar reembolso parcial'
                        : 'Processar reembolso total'}
                  </button>
                </div>
              )}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {next.length > 0 && (
              <div>
                <p className="mb-2 text-xs font-medium text-muted-foreground">Alterar status</p>
                <div className="flex flex-wrap gap-2">
                  {next.map((n) => (
                    <button
                      key={n.value}
                      type="button"
                      onClick={() => setNewStatus(newStatus === n.value ? '' : n.value)}
                      className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
                        newStatus === n.value
                          ? VARIANT_CLASS[n.variant]
                          : 'border-border hover:bg-muted'
                      }`}
                    >
                      {n.label}
                    </button>
                  ))}
                </div>
                {newStatus === 'APPROVED' && !request.meOrderId && (
                  <p className="mt-2 text-xs text-muted-foreground">
                    {isPickup
                      ? 'O cliente será notificado para trazer o item à loja.'
                      : 'A etiqueta reversa será gerada automaticamente via Melhor Envio.'}
                  </p>
                )}
              </div>
            )}

            <div>
              <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
                Observações para o cliente (opcional)
              </label>
              <textarea
                value={adminNotes}
                onChange={(e) => setAdminNotes(e.target.value)}
                rows={3}
                maxLength={1000}
                placeholder="Instruções ou informações sobre a análise..."
                className="w-full rounded-lg border bg-background px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>

            {error && <p className="text-xs text-destructive">{error}</p>}

            <div className="flex gap-2 pt-1">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 rounded-lg border py-2 text-sm hover:bg-muted transition-colors"
              >
                Fechar
              </button>
              <button
                type="submit"
                disabled={loading || !canSave}
                className="flex-1 rounded-lg bg-primary py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-40 transition-opacity"
              >
                {loading ? 'Salvando...' : 'Salvar'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

export default function AdminDevolucoes() {
  const { token } = useAuth();
  const qc = useQueryClient();
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState('');
  const [managing, setManaging] = useState<ReturnRequest | null>(null);

  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: ['admin-returns', page, statusFilter],
    queryFn: () => fetchReturns(token!, page, statusFilter),
    enabled: !!token,
  });

  function handleSuccess(updated: ReturnRequest) {
    setManaging(updated);
    qc.invalidateQueries({ queryKey: ['admin-returns'] });
  }

  function handleStatusFilter(value: string) {
    setStatusFilter(value);
    setPage(1);
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Devoluções</h1>
        <button
          onClick={() => refetch()}
          disabled={isFetching}
          className="flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs hover:bg-muted disabled:opacity-50"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${isFetching ? 'animate-spin' : ''}`} />
          Atualizar
        </button>
      </div>

      <div className="flex flex-wrap gap-2">
        {STATUS_OPTIONS.map((o) => (
          <button
            key={o.value}
            onClick={() => handleStatusFilter(o.value)}
            className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
              statusFilter === o.value
                ? 'border-primary bg-primary text-primary-foreground'
                : 'border-border text-muted-foreground hover:bg-muted'
            }`}
          >
            {o.label}
          </button>
        ))}
      </div>

      <div className="rounded-xl border bg-card shadow-sm overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <div className="h-7 w-7 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          </div>
        ) : !data?.data.length ? (
          <p className="py-16 text-center text-sm text-muted-foreground">
            Nenhuma solicitação encontrada
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b bg-muted/40">
                <tr className="text-left text-xs text-muted-foreground">
                  <th className="px-4 py-3 font-medium">ID</th>
                  <th className="px-4 py-3 font-medium">Cliente</th>
                  <th className="px-4 py-3 font-medium">Pedido</th>
                  <th className="px-4 py-3 font-medium">Motivo</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Rastreio</th>
                  <th className="px-4 py-3 font-medium">Data</th>
                  <th className="px-4 py-3 font-medium">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {data.data.map((r) => (
                  <tr key={r.id} className="hover:bg-muted/20 transition-colors">
                    <td className="px-4 py-3">
                      <span className="font-mono text-xs text-muted-foreground">
                        #{r.id.slice(-8).toUpperCase()}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <p className="font-medium leading-tight">{r.user?.name ?? '—'}</p>
                      <p className="text-xs text-muted-foreground">{r.user?.email}</p>
                    </td>
                    <td className="px-4 py-3">
                      <Link
                        href={`/pedidos/${r.orderId}`}
                        className="font-mono text-xs text-primary hover:underline"
                      >
                        #{r.orderId.slice(-8).toUpperCase()}
                      </Link>
                      <p className="text-xs text-muted-foreground mt-0.5">{fmt(r.order.total)}</p>
                    </td>
                    <td className="px-4 py-3 text-xs">{REASON_LABEL[r.reason] ?? r.reason}</td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_COLOR[r.status] ?? 'bg-muted text-foreground'}`}
                      >
                        {STATUS_OPTIONS.find((s) => s.value === r.status)?.label ?? r.status}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {r.trackingCode ? (
                        <span className="font-mono text-xs">{r.trackingCode}</span>
                      ) : r.labelUrl ? (
                        <a
                          href={r.labelUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-1 text-xs text-primary hover:underline"
                        >
                          <ExternalLink className="h-3 w-3" /> Etiqueta
                        </a>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">
                      {new Date(r.createdAt).toLocaleDateString('pt-BR')}
                    </td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => setManaging(r)}
                        className="rounded border px-2 py-1 text-xs hover:bg-muted transition-colors"
                      >
                        Gerenciar
                      </button>
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
              {data.total} solicitações · página {data.page} de {data.pages}
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

      {managing && (
        <ManageModal
          request={managing}
          token={token!}
          onClose={() => setManaging(null)}
          onSuccess={handleSuccess}
        />
      )}
    </div>
  );
}
