'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/contexts/auth-context';
import { getOrders } from '@/lib/cart-api';
import type { Order } from '@/types/order';

function formatBRL(n: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(n);
}

const STATUS_LABEL: Record<string, { label: string; color: string }> = {
  PENDING: {
    label: 'Aguardando',
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

export default function OrdersPage() {
  const { user, token } = useAuth();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!token) {
      setLoading(false);
      return;
    }
    getOrders(token)
      .then(setOrders)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [token]);

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

  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      <h1 className="mb-6 text-2xl font-bold">Meus Pedidos</h1>

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-24 animate-pulse rounded-xl bg-muted" />
          ))}
        </div>
      ) : orders.length === 0 ? (
        <div className="py-16 text-center">
          <p className="mb-4 text-muted-foreground">Você ainda não fez nenhum pedido.</p>
          <Link href="/produtos" className="text-sm font-medium text-primary hover:underline">
            Ver produtos
          </Link>
        </div>
      ) : (
        <div className="space-y-3">
          {orders.map((order) => {
            const status = STATUS_LABEL[order.status] ?? STATUS_LABEL.PENDING;
            const date = new Date(order.createdAt).toLocaleDateString('pt-BR');
            return (
              <Link
                key={order.id}
                href={`/pedidos/${order.id}`}
                className="block rounded-xl border border-border p-4 hover:bg-muted/50 transition-colors"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="space-y-0.5">
                    <p className="text-sm font-medium">
                      Pedido #{order.id.slice(-8).toUpperCase()}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {date} · {order.items.length} {order.items.length === 1 ? 'item' : 'itens'} ·{' '}
                      {order.shippingMethod}
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <span
                      className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${status.color}`}
                    >
                      {status.label}
                    </span>
                    <span className="text-sm font-semibold">{formatBRL(order.total)}</span>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </main>
  );
}
