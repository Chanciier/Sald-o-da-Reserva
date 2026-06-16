'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useAuth } from '@/contexts/auth-context';
import { getOrder } from '@/lib/cart-api';
import { purchaseLabel } from '@/lib/shipping';
import { fetchInvoices, type Invoice } from '@/actions/invoices';
import { TrackingDisplay } from '@/components/shipping/tracking-display';
import { ReturnModal } from '@/components/orders/return-modal';
import {
  getReturnsByOrder,
  RETURN_STATUS_LABEL,
  RETURN_REASON_LABEL,
  type ReturnRequest,
} from '@/actions/returns';
import type { Order, Shipment } from '@/types/order';
import { STORE } from '@/lib/store';

function formatBRL(n: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(n);
}

const STATUS_LABEL: Record<string, { label: string; color: string }> = {
  PENDING: {
    label: 'Aguardando confirmação',
    color: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-950 dark:text-yellow-300',
  },
  CONFIRMED: {
    label: 'Confirmado',
    color: 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300',
  },
  PAID: {
    label: 'Pago',
    color: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300',
  },
  SHIPPED: {
    label: 'Enviado',
    color: 'bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-300',
  },
  DELIVERED: {
    label: 'Entregue',
    color: 'bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300',
  },
  CANCELLED: {
    label: 'Cancelado',
    color: 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300',
  },
  REFUNDED: {
    label: 'Reembolsado',
    color: 'bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300',
  },
};

export default function OrderDetailPage() {
  const { user, token } = useAuth();
  const params = useParams();
  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [labelLoading, setLabelLoading] = useState(false);
  const [labelError, setLabelError] = useState('');
  const [cancelling, setCancelling] = useState(false);
  const [cancelError, setCancelError] = useState('');
  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [returnRequests, setReturnRequests] = useState<ReturnRequest[]>([]);
  const [showReturnModal, setShowReturnModal] = useState(false);

  const isAdmin = user?.role === 'ADMIN';
  const isStaff = user?.role === 'ADMIN' || user?.role === 'VENDEDOR';

  useEffect(() => {
    if (!token || !params.id) return;
    getOrder(token, params.id as string)
      .then(setOrder)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [token, params.id]);

  useEffect(() => {
    if (!token || !params.id) return;
    getReturnsByOrder(token, params.id as string)
      .then(setReturnRequests)
      .catch(() => {});
  }, [token, params.id]);

  useEffect(() => {
    if (!token || !isStaff || !params.id) return;
    fetchInvoices(token, { orderId: params.id as string, limit: '1' })
      .then((res) => setInvoice(res.data[0] ?? null))
      .catch(() => null);
  }, [token, isStaff, params.id]);

  async function handleCancelOrder() {
    if (!token || !order) return;
    if (!window.confirm('Tem certeza que deseja cancelar este pedido?')) return;
    setCancelling(true);
    setCancelError('');
    const BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';
    try {
      const res = await fetch(`${BASE}/api/v1/orders/${order.id}/cancel`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error((data as { message?: string }).message ?? 'Erro ao cancelar pedido');
      }
      const updated = await getOrder(token, order.id);
      setOrder(updated);
    } catch (e) {
      setCancelError((e as Error).message);
    } finally {
      setCancelling(false);
    }
  }

  async function handlePurchaseLabel() {
    if (!token || !order) return;
    setLabelError('');
    setLabelLoading(true);
    try {
      const result = await purchaseLabel(order.id, token);
      // Refresh order to get updated shipment
      const updated = await getOrder(token, order.id);
      setOrder(updated);
      if (result.labelUrl) {
        window.open(result.labelUrl, '_blank');
      }
    } catch (e) {
      setLabelError((e as Error).message);
    } finally {
      setLabelLoading(false);
    }
  }

  if (!user) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-16 text-center">
        <p className="mb-4 text-muted-foreground">Faça login para ver seus pedidos.</p>
        <Link
          href="/login"
          className="rounded-lg bg-primary px-6 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          Entrar
        </Link>
      </main>
    );
  }

  if (loading) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-8">
        <div className="space-y-4">
          <div className="h-8 w-48 animate-pulse rounded bg-muted" />
          <div className="h-40 animate-pulse rounded-xl bg-muted" />
        </div>
      </main>
    );
  }

  if (error || !order) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-16 text-center">
        <p className="mb-4 text-destructive">{error || 'Pedido não encontrado.'}</p>
        <Link href="/pedidos" className="text-sm font-medium text-primary hover:underline">
          Voltar aos pedidos
        </Link>
      </main>
    );
  }

  const status = STATUS_LABEL[order.status] ?? STATUS_LABEL.PENDING;
  const address = order.shippingAddress;
  const shipment = order.shipment as Shipment | null | undefined;
  const isPickup = order.deliveryMethod === 'PICKUP' || !!order.pickupCode;

  const pickupSteps = [
    { key: 'PAID', label: 'Pagamento confirmado' },
    { key: 'SEPARATING', label: 'Em separação' },
    { key: 'SEPARATED', label: 'Separado' },
    { key: 'READY_TO_SHIP', label: 'Pronto para retirada' },
    { key: 'DELIVERED', label: 'Retirado' },
  ];
  const pickupStepIndex = pickupSteps.findIndex((s) => s.key === order.status);

  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      <nav className="no-print mb-6 flex items-center gap-2 text-sm text-muted-foreground">
        <Link href="/pedidos" className="hover:text-foreground">
          Pedidos
        </Link>
        <span>/</span>
        <span className="text-foreground">#{order.id.slice(-8).toUpperCase()}</span>
      </nav>

      <div className="mb-6 flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold">Pedido #{order.id.slice(-8).toUpperCase()}</h1>
          <p className="text-sm text-muted-foreground">
            {new Date(order.createdAt).toLocaleDateString('pt-BR', { dateStyle: 'long' })}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {isStaff && (
            <button
              onClick={() => window.print()}
              className="no-print rounded-lg border px-3 py-1.5 text-xs font-medium hover:bg-muted transition-colors"
            >
              Imprimir pedido
            </button>
          )}
          <span className={`rounded-full px-3 py-1 text-xs font-semibold ${status.color}`}>
            {status.label}
          </span>
        </div>
      </div>

      {order.status === 'PENDING' && (
        <div className="mb-4 rounded-xl border border-yellow-200 bg-yellow-50 dark:border-yellow-900 dark:bg-yellow-950/30 p-4">
          <p className="text-sm font-medium text-yellow-800 dark:text-yellow-300 mb-3">
            Seu pedido aguarda pagamento. Escolha como deseja pagar:
          </p>
          <div className="flex flex-wrap gap-2">
            <Link
              href={`/pagamento/${order.id}?method=PIX`}
              className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
            >
              Pagar com PIX
            </Link>
            <Link
              href={`/pagamento/${order.id}?method=CREDIT_CARD`}
              className="rounded-lg border px-4 py-2 text-sm font-medium hover:bg-muted transition-colors"
            >
              Pagar com Cartão
            </Link>
            <button
              onClick={handleCancelOrder}
              disabled={cancelling}
              className="rounded-lg border border-destructive/40 px-4 py-2 text-sm font-medium text-destructive hover:bg-destructive/5 disabled:opacity-50 transition-colors"
            >
              {cancelling ? 'Cancelando...' : 'Cancelar pedido'}
            </button>
          </div>
          {cancelError && <p className="mt-2 text-xs text-destructive">{cancelError}</p>}
        </div>
      )}

      {/* Devolução */}
      {(() => {
        const activeReturn = returnRequests.find((r) => r.status !== 'REJECTED');
        const deliveredAt =
          (order.shipment as Shipment | null | undefined)?.deliveredAt ?? order.updatedAt;
        const withinWindow =
          order.status === 'DELIVERED' && deliveredAt
            ? (Date.now() - new Date(deliveredAt).getTime()) / (1000 * 60 * 60 * 24) <= 7
            : false;
        const canRequest = order.status === 'DELIVERED' && withinWindow && !activeReturn;

        return (
          <>
            {canRequest && (
              <div className="mb-4 rounded-xl border border-border p-4 flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-medium">Precisa devolver algum item?</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Você tem até 7 dias após a entrega para solicitar a devolução.
                  </p>
                </div>
                <button
                  onClick={() => setShowReturnModal(true)}
                  className="shrink-0 rounded-lg border border-destructive/50 px-4 py-2 text-sm font-medium text-destructive hover:bg-destructive/5 transition-colors"
                >
                  Solicitar devolução
                </button>
              </div>
            )}

            {activeReturn && (
              <div
                className={`mb-4 rounded-xl border p-4 ${
                  activeReturn.status === 'APPROVED'
                    ? 'border-green-200 bg-green-50 dark:border-green-900 dark:bg-green-950/20'
                    : activeReturn.status === 'COMPLETED'
                      ? 'border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900/20'
                      : 'border-blue-200 bg-blue-50 dark:border-blue-900 dark:bg-blue-950/20'
                }`}
              >
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div>
                    <p className="text-sm font-semibold">Solicitação de devolução</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Motivo: {RETURN_REASON_LABEL[activeReturn.reason]} ·{' '}
                      {new Date(activeReturn.createdAt).toLocaleDateString('pt-BR')}
                    </p>
                  </div>
                  <span
                    className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                      activeReturn.status === 'APPROVED'
                        ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300'
                        : activeReturn.status === 'COMPLETED'
                          ? 'bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300'
                          : 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300'
                    }`}
                  >
                    {RETURN_STATUS_LABEL[activeReturn.status]}
                  </span>
                </div>
                {activeReturn.adminNotes && (
                  <p className="mt-2 text-sm text-muted-foreground border-t border-border pt-2">
                    {activeReturn.adminNotes}
                  </p>
                )}
                {activeReturn.status === 'APPROVED' && isPickup && !activeReturn.labelUrl && (
                  <div className="mt-3 border-t border-border pt-3 space-y-0.5">
                    <p className="text-xs font-medium mb-1">Devolução na loja</p>
                    <p className="text-xs text-muted-foreground">
                      Traga o item à nossa loja. O reembolso será processado após recebermos o
                      produto.
                    </p>
                    <p className="text-xs font-medium text-foreground">{STORE.mall}</p>
                    <p className="text-xs text-muted-foreground">
                      {STORE.address} — {STORE.neighborhood}, {STORE.city}/{STORE.state}
                    </p>
                    <p className="text-xs text-muted-foreground">CEP {STORE.cep}</p>
                  </div>
                )}

                {activeReturn.status === 'APPROVED' && activeReturn.labelUrl && (
                  <div className="mt-3 border-t border-border pt-3 space-y-2">
                    <p className="text-xs font-medium">Envio de devolução</p>
                    {activeReturn.trackingCode ? (
                      <div className="rounded-lg bg-background/70 border px-3 py-2">
                        <p className="text-xs text-muted-foreground">Código de rastreio</p>
                        <p className="font-mono text-sm font-semibold mt-0.5">
                          {activeReturn.trackingCode}
                        </p>
                      </div>
                    ) : (
                      <p className="text-xs text-muted-foreground">
                        Imprima a etiqueta e leve o pacote à agência dos Correios.
                      </p>
                    )}
                    <a
                      href={activeReturn.labelUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium hover:bg-muted/60 transition-colors"
                    >
                      Imprimir etiqueta de devolução →
                    </a>
                    {activeReturn.postedAt && (
                      <p className="text-xs text-muted-foreground">
                        Postado em {new Date(activeReturn.postedAt).toLocaleDateString('pt-BR')}
                      </p>
                    )}
                  </div>
                )}
              </div>
            )}
          </>
        );
      })()}

      <div className="space-y-4">
        {/* Items */}
        <section className="rounded-xl border border-border p-5">
          <h2 className="mb-3 font-semibold">Itens</h2>
          <div className="space-y-3">
            {order.items.map((item) => {
              const img = item.product?.images?.[0]?.url;
              return (
                <div key={item.id} className="flex gap-3">
                  {img ? (
                    <img
                      src={img}
                      alt={item.name}
                      className="h-14 w-14 shrink-0 rounded-lg object-cover"
                    />
                  ) : (
                    <div className="h-14 w-14 shrink-0 rounded-lg bg-muted" />
                  )}
                  <div className="flex flex-1 items-center justify-between gap-2">
                    <div>
                      <p className="text-sm font-medium">{item.name}</p>
                      <p className="text-xs text-muted-foreground">
                        SKU: {item.sku} · Qtd: {item.quantity}
                      </p>
                    </div>
                    <span className="text-sm font-semibold">{formatBRL(item.subtotal)}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* Shipment / Tracking */}
        {shipment && (
          <section className="rounded-xl border border-border p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold">Envio e Rastreamento</h2>
              {isAdmin && shipment.status === 'PENDING' && shipment.serviceId > 0 && (
                <div className="flex flex-col items-end gap-1">
                  <button
                    onClick={handlePurchaseLabel}
                    disabled={labelLoading}
                    className="rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60 transition-colors"
                  >
                    {labelLoading ? 'Processando...' : 'Comprar etiqueta'}
                  </button>
                  {labelError && (
                    <p className="text-xs text-destructive max-w-[200px] text-right">
                      {labelError}
                    </p>
                  )}
                </div>
              )}
            </div>
            <TrackingDisplay shipment={shipment} />
          </section>
        )}

        {/* NF-e — staff only */}
        {isStaff && (
          <section className="rounded-xl border border-border p-5">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold">Nota Fiscal</h2>
              <Link
                href={`/admin/financeiro/notas-fiscais${invoice ? `/${invoice.id}` : `?search=${order.id}`}`}
                className="text-xs text-primary hover:underline"
              >
                {invoice ? 'Ver detalhes' : 'Gerenciar NF-e'}
              </Link>
            </div>
            {invoice ? (
              <div className="mt-3 flex flex-wrap items-center gap-3">
                <span
                  className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
                    invoice.status === 'AUTHORIZED'
                      ? 'bg-green-100 text-green-800'
                      : invoice.status === 'REJECTED'
                        ? 'bg-red-100 text-red-800'
                        : invoice.status === 'CANCELLED'
                          ? 'bg-gray-100 text-gray-700'
                          : 'bg-blue-100 text-blue-800'
                  }`}
                >
                  {invoice.status === 'AUTHORIZED'
                    ? 'Autorizada'
                    : invoice.status === 'REJECTED'
                      ? 'Rejeitada'
                      : invoice.status === 'CANCELLED'
                        ? 'Cancelada'
                        : invoice.status === 'PROCESSING'
                          ? 'Processando'
                          : 'Pendente'}
                </span>
                {invoice.invoiceNumber && (
                  <span className="text-sm text-muted-foreground">
                    NF-e #{invoice.invoiceNumber}
                  </span>
                )}
                {invoice.status === 'AUTHORIZED' && (
                  <a
                    href={
                      invoice.danfeUrl ?? `/admin/financeiro/notas-fiscais/${invoice.id}/imprimir`
                    }
                    target="_blank"
                    rel="noopener noreferrer"
                    className="rounded-lg border px-3 py-1.5 text-xs font-medium hover:bg-muted transition-colors"
                  >
                    Imprimir DANFE
                  </a>
                )}
              </div>
            ) : (
              <p className="mt-2 text-sm text-muted-foreground">
                Nenhuma nota emitida para este pedido.
              </p>
            )}
          </section>
        )}

        {/* Pickup card */}
        {isPickup && (
          <section className="rounded-xl border-2 border-primary bg-primary/5 p-5 space-y-4">
            <div className="flex items-center gap-2">
              <svg
                className="h-5 w-5 text-primary"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M3 3h18l-2 13H5L3 3zM3 3L2 1M8 21a1 1 0 100-2 1 1 0 000 2zm10 0a1 1 0 100-2 1 1 0 000 2z"
                />
              </svg>
              <h2 className="font-semibold">Retirada na Loja</h2>
            </div>

            {order.pickupCode ? (
              <div className="flex flex-col items-center gap-1 rounded-xl border-2 border-dashed border-primary/40 bg-background py-5">
                <p className="text-xs text-muted-foreground uppercase tracking-widest">
                  Código de Retirada
                </p>
                <p className="font-mono text-4xl font-extrabold tracking-widest text-primary">
                  {order.pickupCode}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Apresente este código ao retirar seu pedido
                </p>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                Seu código de retirada será gerado em breve.
              </p>
            )}

            {/* Progress */}
            <div className="space-y-2">
              {pickupSteps.map((step, i) => {
                const done = pickupStepIndex >= i;
                const current = pickupStepIndex === i;
                return (
                  <div key={step.key} className="flex items-center gap-3">
                    <div
                      className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ${done ? 'bg-primary text-primary-foreground' : 'border-2 border-muted text-muted-foreground'}`}
                    >
                      {done && pickupStepIndex > i ? '✓' : i + 1}
                    </div>
                    <span
                      className={`text-sm ${current ? 'font-semibold text-foreground' : done ? 'text-foreground' : 'text-muted-foreground'}`}
                    >
                      {step.label}
                      {current && (
                        <span className="ml-2 text-xs text-primary font-normal">← agora</span>
                      )}
                    </span>
                  </div>
                );
              })}
            </div>

            {order.status === 'READY_TO_SHIP' && (
              <div className="rounded-lg bg-primary/10 px-4 py-3 text-sm font-medium text-primary">
                Seu pedido está pronto! Venha retirar na loja com o código acima.
              </div>
            )}

            <div className="rounded-lg border border-border px-4 py-3 space-y-0.5">
              <p className="text-xs font-semibold">{STORE.mall}</p>
              <p className="text-xs text-muted-foreground">
                {STORE.address} — {STORE.neighborhood}, {STORE.city}/{STORE.state}
              </p>
              <p className="text-xs text-muted-foreground">CEP {STORE.cep}</p>
            </div>
          </section>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          {/* Address */}
          <section className="rounded-xl border border-border p-5">
            <h2 className="mb-3 font-semibold">
              {isPickup ? 'Local de retirada' : 'Endereço de entrega'}
            </h2>
            {isPickup ? (
              <div className="space-y-0.5 text-sm text-muted-foreground">
                <p className="font-medium text-foreground">{STORE.mall}</p>
                <p>
                  {STORE.address} — {STORE.neighborhood}
                </p>
                <p>
                  {STORE.city}/{STORE.state}
                </p>
                <p>CEP: {STORE.cep}</p>
              </div>
            ) : address ? (
              <div className="space-y-0.5 text-sm text-muted-foreground">
                <p className="font-medium text-foreground">{address.name}</p>
                <p>
                  {address.street}, {address.number}
                  {address.complement ? `, ${address.complement}` : ''}
                </p>
                <p>
                  {address.neighborhood} — {address.city}/{address.state}
                </p>
                <p>CEP: {address.cep.replace(/(\d{5})(\d{3})/, '$1-$2')}</p>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">Endereço não disponível.</p>
            )}
          </section>

          {/* Financial summary */}
          <section className="rounded-xl border border-border p-5">
            <h2 className="mb-3 font-semibold">Resumo financeiro</h2>
            <div className="space-y-1 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Subtotal</span>
                <span>{formatBRL(order.subtotal)}</span>
              </div>
              {order.discount > 0 && (
                <div className="flex justify-between text-green-600 dark:text-green-400">
                  <span>Desconto{order.coupon ? ` (${order.coupon.code})` : ''}</span>
                  <span>- {formatBRL(order.discount)}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-muted-foreground">Frete ({order.shippingMethod})</span>
                <span>{order.shipping === 0 ? 'Grátis' : formatBRL(order.shipping)}</span>
              </div>
              <div className="flex justify-between border-t border-border pt-1.5 font-semibold">
                <span>Total</span>
                <span className="text-primary">{formatBRL(order.total)}</span>
              </div>
            </div>
          </section>
        </div>
      </div>

      <div className="no-print mt-6">
        <Link href="/pedidos" className="text-sm text-muted-foreground hover:text-foreground">
          ← Voltar aos pedidos
        </Link>
      </div>

      {showReturnModal && token && (
        <ReturnModal
          orderId={order.id}
          token={token}
          isPickup={isPickup}
          onClose={() => setShowReturnModal(false)}
          onSuccess={() => {
            setShowReturnModal(false);
            getReturnsByOrder(token, order.id)
              .then(setReturnRequests)
              .catch(() => {});
          }}
        />
      )}
    </main>
  );
}
