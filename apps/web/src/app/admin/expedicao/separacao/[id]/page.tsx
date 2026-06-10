'use client';

import { useState, useCallback, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useQuery, useMutation } from '@tanstack/react-query';
import { ArrowLeft, CheckCircle2 } from 'lucide-react';
import { useAuth } from '@/contexts/auth-context';
import { getOrder } from '@/lib/cart-api';
import { atualizarItensSeparados, finalizarSeparacao, cancelarPedido } from '@/actions/expedicao';
import type { Order, OrderItem } from '@/types/order';

const STATUS_LABEL: Record<string, string> = {
  PAID: 'Pago',
  SEPARATING: 'Em Separação',
  SEPARATED: 'Separado',
  READY_TO_SHIP: 'Pronto p/ Envio',
  SHIPPED: 'Enviado',
  DELIVERED: 'Entregue',
};

const STATUS_COLOR: Record<string, string> = {
  PAID: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300',
  SEPARATING: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300',
  SEPARATED: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
  READY_TO_SHIP: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300',
};

interface ItemRowProps {
  item: OrderItem;
  checked: boolean;
  onToggle: (id: string) => void;
}

function ItemRow({ item, checked, onToggle }: ItemRowProps) {
  const imageUrl = item.product?.images?.[0]?.url;

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

      {imageUrl ? (
        <img
          src={imageUrl}
          alt={item.name}
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
        <p className="text-xs text-muted-foreground">Qtd: {item.quantity}</p>
      </div>
    </div>
  );
}

export default function SeparacaoItemPage({ params }: { params: { id: string } }) {
  const { token } = useAuth();
  const router = useRouter();
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [initialized, setInitialized] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [cancelError, setCancelError] = useState('');
  const [refundWarning, setRefundWarning] = useState('');

  const { data: order, isLoading } = useQuery<Order>({
    queryKey: ['order', params.id],
    queryFn: () => getOrder(token!, params.id),
    enabled: !!token,
  });

  useEffect(() => {
    if (!initialized && order?.items) {
      const existing = (order as Order & { separatedItems?: string[] }).separatedItems ?? [];
      const validIds = new Set(order.items.map((i) => i.id));
      const preChecked = existing.filter((id: string) => validIds.has(id));
      setChecked(new Set(preChecked));
      setInitialized(true);
    }
  }, [order, initialized]);

  const saveMutation = useMutation({
    mutationFn: (ids: string[]) => atualizarItensSeparados(token!, params.id, ids),
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
        if (next.has(itemId)) {
          next.delete(itemId);
        } else {
          next.add(itemId);
        }
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

  return (
    <div className="space-y-5 max-w-2xl">
      <div className="flex items-center gap-3">
        <Link
          href="/admin/expedicao/separacao"
          className="flex items-center gap-1 rounded-lg border px-3 py-1.5 text-xs hover:bg-muted transition-colors"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Voltar à Fila
        </Link>
        <h1 className="text-xl font-bold">Separação — #{params.id.slice(-8).toUpperCase()}</h1>
        <span
          className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_COLOR[order.status] ?? 'bg-muted text-foreground'}`}
        >
          {STATUS_LABEL[order.status] ?? order.status}
        </span>
      </div>

      <div className="rounded-xl border bg-card p-4 text-sm">
        <p className="font-medium">
          {(order as Order & { user?: { name?: string | null; email?: string } }).user?.name ?? '—'}
        </p>
        <p className="text-muted-foreground text-xs">
          {(order as Order & { user?: { name?: string | null; email?: string } }).user?.email}
        </p>
      </div>

      <div className="flex items-center justify-between rounded-xl border bg-card px-4 py-3">
        <p className="text-sm font-medium">
          Progresso: <span className="text-primary">{checkedCount}</span> de {total} itens separados
        </p>
        {saveMutation.isPending && (
          <span className="text-xs text-muted-foreground">Salvando...</span>
        )}
      </div>

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

      <div className="pt-2 space-y-3">
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
            Pedido cancelado, mas o estorno automático falhou: {refundWarning}. Realize o estorno
            manualmente no Mercado Pago.
          </div>
        )}

        {confirmCancel ? (
          <div className="flex items-center justify-center gap-3 rounded-xl border border-destructive/40 bg-destructive/5 py-3 px-4">
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
  );
}
