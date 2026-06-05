'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { CreditCard, RefreshCw } from 'lucide-react';
import { useAuth } from '@/contexts/auth-context';

const BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

const METHOD_LABEL: Record<string, string> = {
  PIX: 'PIX',
  CREDIT_CARD: 'Cartão de Crédito',
  DEBIT_CARD: 'Cartão de Débito',
  BOLETO: 'Boleto',
};

const STATUS_COLOR: Record<string, string> = {
  PENDING: 'bg-yellow-100 text-yellow-800',
  APPROVED: 'bg-green-100 text-green-800',
  AUTHORIZED: 'bg-blue-100 text-blue-800',
  REJECTED: 'bg-red-100 text-red-800',
  CANCELLED: 'bg-gray-100 text-gray-700',
  REFUNDED: 'bg-orange-100 text-orange-800',
};

const STATUS_LABEL: Record<string, string> = {
  PENDING: 'Aguardando',
  APPROVED: 'Aprovado',
  AUTHORIZED: 'Autorizado',
  REJECTED: 'Recusado',
  CANCELLED: 'Cancelado',
  REFUNDED: 'Estornado',
};

function fmt(n: number) {
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

async function fetchOrders(token: string) {
  const res = await fetch(`${BASE}/api/v1/orders`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: 'no-store',
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message ?? 'Erro');
  return Array.isArray(data) ? data : [];
}

export default function ClientePagamentos() {
  const { token } = useAuth();

  const {
    data: orders = [],
    isLoading,
    isFetching,
    refetch,
  } = useQuery({
    queryKey: ['cliente-payments'],
    queryFn: () => fetchOrders(token!),
    enabled: !!token,
  });

  const ordersWithPayment = orders.filter((o: { payment: unknown }) => o.payment !== null);

  const totalPaid = ordersWithPayment
    .filter((o: { payment: { status: string } }) => o.payment.status === 'APPROVED')
    .reduce((sum: number, o: { total: number }) => sum + o.total, 0);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Meus Pagamentos</h1>
        <button
          onClick={() => refetch()}
          disabled={isFetching}
          className="flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs hover:bg-muted disabled:opacity-50"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${isFetching ? 'animate-spin' : ''}`} />
          Atualizar
        </button>
      </div>

      {totalPaid > 0 && (
        <div className="rounded-xl border bg-card p-5 shadow-sm">
          <p className="text-sm text-muted-foreground">Total investido</p>
          <p className="text-3xl font-bold text-primary">{fmt(totalPaid)}</p>
        </div>
      )}

      <div className="rounded-xl border bg-card shadow-sm overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <div className="h-7 w-7 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          </div>
        ) : !ordersWithPayment.length ? (
          <div className="flex flex-col items-center gap-3 py-16 text-center">
            <CreditCard className="h-12 w-12 text-muted-foreground/40" />
            <p className="font-medium">Nenhum pagamento encontrado</p>
            <p className="text-sm text-muted-foreground">
              Seus pagamentos aparecerão aqui após realizar um pedido.
            </p>
            <Link
              href="/produtos"
              className="mt-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
            >
              Ver produtos
            </Link>
          </div>
        ) : (
          <div className="divide-y">
            {ordersWithPayment.map(
              (o: {
                id: string;
                total: number;
                createdAt: string;
                payment: {
                  method: string;
                  status: string;
                  amount: number;
                  cardBrand?: string;
                  cardLast4?: string;
                };
              }) => (
                <div
                  key={o.id}
                  className="flex items-center justify-between px-5 py-4 hover:bg-muted/20 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted">
                      <CreditCard className="h-5 w-5 text-muted-foreground" />
                    </div>
                    <div>
                      <p className="font-medium text-sm">
                        {METHOD_LABEL[o.payment.method] ?? o.payment.method}
                        {o.payment.cardLast4 && (
                          <span className="text-muted-foreground font-normal">
                            {' '}
                            · •••• {o.payment.cardLast4}
                          </span>
                        )}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Pedido{' '}
                        <Link
                          href={`/pedidos/${o.id}`}
                          className="font-medium text-primary hover:underline"
                        >
                          #{o.id.slice(-8).toUpperCase()}
                        </Link>{' '}
                        · {new Date(o.createdAt).toLocaleDateString('pt-BR')}
                      </p>
                    </div>
                  </div>
                  <div className="text-right shrink-0 ml-4">
                    <p className="font-semibold">{fmt(o.total)}</p>
                    <span
                      className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_COLOR[o.payment.status] ?? 'bg-muted'}`}
                    >
                      {STATUS_LABEL[o.payment.status] ?? o.payment.status}
                    </span>
                  </div>
                </div>
              ),
            )}
          </div>
        )}
      </div>
    </div>
  );
}
