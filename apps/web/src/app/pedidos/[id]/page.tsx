'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useAuth } from '@/contexts/auth-context';
import { getOrder } from '@/lib/cart-api';
import type { Order } from '@/types/order';

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
};

export default function OrderDetailPage() {
  const { user, token } = useAuth();
  const params = useParams();
  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!token || !params.id) return;
    getOrder(token, params.id as string)
      .then(setOrder)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [token, params.id]);

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

  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      <nav className="mb-6 flex items-center gap-2 text-sm text-muted-foreground">
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
        <span className={`rounded-full px-3 py-1 text-xs font-semibold ${status.color}`}>
          {status.label}
        </span>
      </div>

      <div className="space-y-4">
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

        <div className="grid gap-4 sm:grid-cols-2">
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

      <div className="mt-6">
        <Link href="/pedidos" className="text-sm text-muted-foreground hover:text-foreground">
          ← Voltar aos pedidos
        </Link>
      </div>
    </main>
  );
}
