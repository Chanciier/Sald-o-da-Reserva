'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useAuth } from '@/contexts/auth-context';
import { getOrder } from '@/lib/cart-api';
import { purchaseLabel } from '@/lib/shipping';
import { fetchInvoices, type Invoice } from '@/actions/invoices';
import { TrackingDisplay } from '@/components/shipping/tracking-display';
import type { Order, Shipment } from '@/types/order';

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
  const [invoice, setInvoice] = useState<Invoice | null>(null);

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
    if (!token || !isStaff || !params.id) return;
    fetchInvoices(token, { orderId: params.id as string, limit: '1' })
      .then((res) => setInvoice(res.data[0] ?? null))
      .catch(() => null);
  }, [token, isStaff, params.id]);

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
          </div>
        </div>
      )}

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

        <div className="grid gap-4 sm:grid-cols-2">
          {/* Address */}
          <section className="rounded-xl border border-border p-5">
            <h2 className="mb-3 font-semibold">Endereço de entrega</h2>
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
    </main>
  );
}
