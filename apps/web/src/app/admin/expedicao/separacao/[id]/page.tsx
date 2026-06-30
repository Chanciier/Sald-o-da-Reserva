'use client';

import { useState, useCallback, useEffect } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useQuery, useMutation } from '@tanstack/react-query';
import { ArrowLeft, CheckCircle2, Truck, Store, Phone, MessageCircle, Printer } from 'lucide-react';
import { useAuth } from '@/contexts/auth-context';
import {
  fetchExpedicaoOrder,
  atualizarItensSeparados,
  finalizarSeparacao,
  cancelarPedido,
  salvarObservacao,
  abrirEtiquetaMl,
} from '@/actions/expedicao';
import type { ExpedicaoOrderDetail, OrderDetailItem, TimelineEvent } from '@/actions/expedicao';
import { ChannelBadge } from '../../_components/channel-badge';

const STATUS_LABEL: Record<string, string> = {
  PENDING: 'Pendente',
  PAID: 'Pago',
  SEPARATING: 'Em Separação',
  SEPARATED: 'Separado',
  READY_TO_SHIP: 'Pronto',
  SHIPPED: 'Enviado',
  DELIVERED: 'Entregue',
  CANCELLED: 'Cancelado',
  REFUNDED: 'Reembolsado',
};

const STATUS_COLOR: Record<string, string> = {
  PAID: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300',
  SEPARATING: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300',
  SEPARATED: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
  READY_TO_SHIP: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300',
};

function fmt(n: number) {
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function formatPhone(d: string | null) {
  if (!d) return '—';
  const c = d.replace(/\D/g, '');
  if (c.length === 11) return `(${c.slice(0, 2)}) ${c.slice(2, 7)}-${c.slice(7)}`;
  if (c.length === 10) return `(${c.slice(0, 2)}) ${c.slice(2, 6)}-${c.slice(6)}`;
  return d;
}

function waLink(d: string | null) {
  if (!d) return null;
  const c = d.replace(/\D/g, '');
  if (c.length < 10) return null;
  return `https://wa.me/55${c}`;
}

interface ItemRowProps {
  item: OrderDetailItem;
  checked: boolean;
  onToggle: (id: string) => void;
}

function ItemRow({ item, checked, onToggle }: ItemRowProps) {
  function handleKey(e: React.KeyboardEvent) {
    if (e.key === ' ' || e.key === 'Enter') {
      e.preventDefault();
      onToggle(item.id);
    }
  }

  return (
    <div
      role="checkbox"
      aria-checked={checked}
      tabIndex={0}
      onKeyDown={handleKey}
      onClick={() => onToggle(item.id)}
      className={`flex cursor-pointer items-center gap-4 rounded-xl border p-4 transition-colors focus:outline-none focus:ring-2 focus:ring-ring ${
        checked
          ? 'border-green-400 bg-green-50 dark:bg-green-900/10'
          : 'border-border bg-card hover:bg-muted/30'
      }`}
    >
      <div
        className={`flex h-6 w-6 shrink-0 items-center justify-center rounded border-2 transition-colors ${
          checked ? 'border-green-500 bg-green-500' : 'border-muted-foreground'
        }`}
      >
        {checked && <CheckCircle2 className="h-4 w-4 text-white" />}
      </div>

      {item.image ? (
        <Image
          src={item.image}
          alt={item.name}
          width={56}
          height={56}
          className="h-14 w-14 rounded-lg object-cover shrink-0 border"
        />
      ) : (
        <div className="h-14 w-14 shrink-0 rounded-lg bg-muted flex items-center justify-center text-muted-foreground text-xs">
          Sem img
        </div>
      )}

      <div className="flex-1 min-w-0">
        <p
          className={`font-medium leading-snug ${checked ? 'line-through text-muted-foreground' : ''}`}
        >
          {item.name}
        </p>
        <p className="text-xs text-muted-foreground mt-0.5">SKU: {item.sku}</p>
        <p className="text-xs text-muted-foreground">
          Qtd: <span className="font-medium text-foreground">{item.quantity}</span> ·{' '}
          {fmt(item.price)}
        </p>
      </div>
    </div>
  );
}

function Timeline({ events }: { events: TimelineEvent[] }) {
  if (!events.length) {
    return <p className="text-xs text-muted-foreground">Sem eventos registrados.</p>;
  }
  return (
    <ol className="space-y-4">
      {events.map((ev, i) => (
        <li key={ev.id} className="flex gap-3">
          <div className="flex flex-col items-center">
            <span
              className={`mt-0.5 h-2.5 w-2.5 rounded-full ${
                i === events.length - 1 ? 'bg-primary' : 'bg-muted-foreground/40'
              }`}
            />
            {i < events.length - 1 && <span className="w-px flex-1 bg-border" />}
          </div>
          <div className="-mt-1 pb-1">
            <p className="text-sm font-medium leading-tight">{ev.title}</p>
            <p className="text-xs text-muted-foreground">
              {new Date(ev.createdAt).toLocaleString('pt-BR', {
                day: '2-digit',
                month: '2-digit',
                hour: '2-digit',
                minute: '2-digit',
              })}
              {ev.actor ? ` · ${ev.actor}` : ''}
            </p>
            {ev.description && (
              <p className="text-xs text-muted-foreground mt-0.5">{ev.description}</p>
            )}
          </div>
        </li>
      ))}
    </ol>
  );
}

export default function SeparacaoItemPage({ params }: { params: { id: string } }) {
  const { token } = useAuth();
  const router = useRouter();
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [initialized, setInitialized] = useState(false);
  const [notes, setNotes] = useState('');
  const [notesInit, setNotesInit] = useState(false);
  const [notesSaved, setNotesSaved] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [cancelError, setCancelError] = useState('');
  const [refundWarning, setRefundWarning] = useState('');
  const [labelBusy, setLabelBusy] = useState(false);
  const [labelError, setLabelError] = useState('');

  const { data: order, isLoading } = useQuery<ExpedicaoOrderDetail>({
    queryKey: ['expedicao-order', params.id],
    queryFn: () => fetchExpedicaoOrder(token!, params.id),
    enabled: !!token,
  });

  useEffect(() => {
    if (!initialized && order?.items) {
      const existing = order.separatedItems ?? [];
      const validIds = new Set(order.items.map((i) => i.id));
      setChecked(new Set(existing.filter((id) => validIds.has(id))));
      setInitialized(true);
    }
  }, [order, initialized]);

  useEffect(() => {
    if (!notesInit && order) {
      setNotes(order.separationNotes ?? '');
      setNotesInit(true);
    }
  }, [order, notesInit]);

  const saveMutation = useMutation({
    mutationFn: (ids: string[]) => atualizarItensSeparados(token!, params.id, ids),
  });

  const notesMutation = useMutation({
    mutationFn: (value: string) => salvarObservacao(token!, params.id, value),
    onSuccess: () => {
      setNotesSaved(true);
      setTimeout(() => setNotesSaved(false), 2000);
    },
  });

  const finalizeMutation = useMutation({
    mutationFn: () => finalizarSeparacao(token!, params.id),
    onSuccess: () => router.push(`/admin/expedicao/conferencia/${params.id}`),
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

  const handleToggle = useCallback(
    (itemId: string) => {
      setChecked((prev) => {
        const next = new Set(prev);
        if (next.has(itemId)) next.delete(itemId);
        else next.add(itemId);
        saveMutation.mutate(Array.from(next));
        return next;
      });
    },
    [saveMutation],
  );

  if (isLoading || !order) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  const items = order.items ?? [];
  const total = items.length;
  const checkedCount = items.filter((i) => checked.has(i.id)).length;
  const allChecked = total > 0 && checkedCount === total;
  const isPickup = order.deliveryMethod === 'PICKUP';
  const isMl = order.channel === 'MERCADO_LIVRE';
  const wa = waLink(order.customerPhone);

  async function handleMlLabel() {
    if (!token) return;
    setLabelBusy(true);
    setLabelError('');
    try {
      await abrirEtiquetaMl(token, order!.id);
    } catch (err) {
      setLabelError((err as Error).message);
    } finally {
      setLabelBusy(false);
    }
  }
  const addr = order.shippingAddress as {
    street?: string;
    number?: string;
    neighborhood?: string;
    city?: string;
    state?: string;
    cep?: string;
  } | null;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <Link
          href="/admin/expedicao/separacao"
          className="flex items-center gap-1 rounded-lg border px-3 py-1.5 text-xs hover:bg-muted transition-colors"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Voltar
        </Link>
        <h1 className="text-xl font-bold">Separação — #{params.id.slice(-8).toUpperCase()}</h1>
        <span
          className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_COLOR[order.status] ?? 'bg-muted text-foreground'}`}
        >
          {STATUS_LABEL[order.status] ?? order.status}
        </span>
        <span
          className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${
            isPickup
              ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300'
              : 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300'
          }`}
        >
          {isPickup ? <Store className="h-3 w-3" /> : <Truck className="h-3 w-3" />}
          {isPickup ? 'Retirada' : 'Envio'}
        </span>
        <ChannelBadge channel={order.channel} />
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        {/* Coluna principal */}
        <div className="space-y-5 lg:col-span-2">
          {/* Cliente + contato */}
          <div className="rounded-xl border bg-card p-4 space-y-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-medium">{order.buyerName ?? order.user?.name ?? '—'}</p>
                <p className="text-xs text-muted-foreground">{order.user?.email}</p>
                <p className="mt-1 flex items-center gap-1.5 text-sm">
                  <Phone className="h-3.5 w-3.5 text-muted-foreground" />
                  {formatPhone(order.customerPhone)}
                </p>
              </div>
              {wa && (
                <a
                  href={wa}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 rounded-lg bg-green-600 px-3 py-1.5 text-xs font-medium text-white hover:opacity-90"
                >
                  <MessageCircle className="h-3.5 w-3.5" /> WhatsApp
                </a>
              )}
            </div>

            {isPickup ? (
              <div className="rounded-lg border border-emerald-300/60 bg-emerald-50 dark:bg-emerald-900/10 px-4 py-3 flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs text-emerald-700 dark:text-emerald-300">
                    Código de retirada
                  </p>
                  <p className="text-2xl font-bold tracking-widest text-emerald-800 dark:text-emerald-200">
                    {order.pickupCode ?? '—'}
                  </p>
                </div>
                <Link
                  href={`/admin/expedicao/retirada/${order.id}/etiqueta`}
                  className="flex items-center gap-1.5 rounded-lg border border-emerald-400 px-3 py-1.5 text-xs font-medium text-emerald-800 dark:text-emerald-200 hover:bg-emerald-100 dark:hover:bg-emerald-900/30"
                >
                  <Printer className="h-3.5 w-3.5" /> Imprimir
                </Link>
              </div>
            ) : (
              <div className="rounded-lg bg-muted/40 px-4 py-3 text-sm">
                <p className="text-xs text-muted-foreground mb-1">Endereço de entrega</p>
                {addr ? (
                  <p className="leading-snug">
                    {addr.street}, {addr.number}
                    {addr.neighborhood ? ` — ${addr.neighborhood}` : ''}
                    <br />
                    {addr.city}/{addr.state} · CEP {addr.cep}
                  </p>
                ) : (
                  <p className="text-muted-foreground">—</p>
                )}
                <p className="mt-2 text-xs text-muted-foreground">
                  {order.shippingMethod}
                  {order.shipment?.carrier ? ` · ${order.shipment.carrier}` : ''}
                  {order.shipment?.trackingCode ? ` · ${order.shipment.trackingCode}` : ''}
                </p>
              </div>
            )}

            {/* Mercado Livre: etiqueta e fiscal são do próprio canal */}
            {isMl && !isPickup && (
              <div className="rounded-lg border border-yellow-300/60 bg-yellow-50 dark:bg-yellow-900/10 px-4 py-3 space-y-2">
                <p className="text-xs text-yellow-800 dark:text-yellow-300">
                  Pedido do <strong>Mercado Livre</strong>. Use a etiqueta do próprio ML para postar
                  — a NF-e segue o fluxo fiscal do canal.
                </p>
                <button
                  onClick={handleMlLabel}
                  disabled={labelBusy}
                  className="flex items-center gap-1.5 rounded-lg border border-yellow-400 px-3 py-1.5 text-xs font-medium text-yellow-900 dark:text-yellow-200 hover:bg-yellow-100 dark:hover:bg-yellow-900/30 disabled:opacity-50"
                >
                  <Printer className="h-3.5 w-3.5" />
                  {labelBusy ? 'Abrindo...' : 'Baixar etiqueta do Mercado Livre'}
                </button>
                {labelError && <p className="text-xs text-destructive">{labelError}</p>}
              </div>
            )}
          </div>

          {/* Progresso */}
          <div className="flex items-center justify-between rounded-xl border bg-card px-4 py-3">
            <p className="text-sm font-medium">
              Progresso: <span className="text-primary">{checkedCount}</span> de {total} itens
            </p>
            {saveMutation.isPending && (
              <span className="text-xs text-muted-foreground">Salvando...</span>
            )}
          </div>

          {/* Checklist */}
          <div className="space-y-3">
            {items.map((item) => (
              <ItemRow
                key={item.id}
                item={item}
                checked={checked.has(item.id)}
                onToggle={handleToggle}
              />
            ))}
          </div>

          {/* Observação do separador */}
          <div className="rounded-xl border bg-card p-4 space-y-2">
            <label className="text-sm font-medium">Observação da separação</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              onBlur={() => {
                if (notes !== (order.separationNotes ?? '')) notesMutation.mutate(notes);
              }}
              rows={2}
              maxLength={1000}
              placeholder="Ex.: produto avariado, faltou 1 unidade, embalagem especial..."
              className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-none"
            />
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">
                {notesMutation.isPending
                  ? 'Salvando...'
                  : notesSaved
                    ? 'Observação salva ✓'
                    : 'Salva automaticamente ao sair do campo'}
              </span>
            </div>
          </div>

          {/* Ações */}
          <div className="pt-1 space-y-3">
            <button
              onClick={() => finalizeMutation.mutate()}
              disabled={!allChecked || finalizeMutation.isPending}
              className="w-full rounded-xl bg-primary py-3 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition-opacity"
            >
              {finalizeMutation.isPending ? 'Finalizando...' : 'Finalizar Separação'}
            </button>
            {!allChecked && (
              <p className="text-center text-xs text-muted-foreground">
                Marque todos os itens para finalizar
              </p>
            )}

            {cancelError && <p className="text-center text-xs text-destructive">{cancelError}</p>}

            {refundWarning && (
              <div className="rounded-lg border border-yellow-400/60 bg-yellow-50 dark:bg-yellow-900/20 px-4 py-3 text-sm text-yellow-800 dark:text-yellow-300">
                Pedido cancelado, mas o estorno automático falhou: {refundWarning}. Realize o
                estorno manualmente no Mercado Pago.
              </div>
            )}

            {confirmCancel ? (
              <div className="flex flex-wrap items-center justify-center gap-3 rounded-xl border border-destructive/40 bg-destructive/5 py-3 px-4">
                <span className="text-sm text-destructive font-medium">Cancelar este pedido?</span>
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
                className="w-full rounded-xl border border-destructive/50 py-2.5 text-sm text-destructive hover:bg-destructive/10 transition-colors"
              >
                Cancelar Pedido
              </button>
            )}
          </div>
        </div>

        {/* Linha do tempo */}
        <aside className="lg:col-span-1">
          <div className="rounded-xl border bg-card p-4 lg:sticky lg:top-4">
            <h2 className="mb-4 text-sm font-semibold">Linha do tempo</h2>
            <Timeline events={order.statusEvents ?? []} />
          </div>
        </aside>
      </div>
    </div>
  );
}
