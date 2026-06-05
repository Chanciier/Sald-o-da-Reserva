'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useAuth } from '@/contexts/auth-context';
import { getOrder } from '@/lib/cart-api';
import {
  createCardPayment,
  createPixPayment,
  getPaymentById,
  getPaymentByOrder,
} from '@/lib/payments';
import { PixDisplay } from '@/components/payment/pix-display';
import { CardForm } from '@/components/payment/card-form';
import type { Payment, PaymentMethod } from '@/types/payment';

interface PageProps {
  params: { orderId: string };
}

const METHOD_LABELS: Record<PaymentMethod, string> = {
  PIX: 'PIX',
  BOLETO: 'Boleto',
  CREDIT_CARD: 'Cartão de crédito',
  DEBIT_CARD: 'Cartão de débito',
};

const TERMINAL_STATUSES = new Set([
  'APPROVED',
  'REJECTED',
  'CANCELLED',
  'REFUNDED',
  'CHARGED_BACK',
]);
const POLL_INTERVAL = 5000;

function formatBRL(n: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(n);
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    PENDING: { label: 'Aguardando pagamento', cls: 'bg-yellow-100 text-yellow-800' },
    IN_PROCESS: { label: 'Processando', cls: 'bg-yellow-100 text-yellow-800' },
    APPROVED: { label: 'Pago', cls: 'bg-green-100 text-green-800' },
    AUTHORIZED: { label: 'Autorizado', cls: 'bg-blue-100 text-blue-800' },
    REJECTED: { label: 'Recusado', cls: 'bg-red-100 text-red-800' },
    CANCELLED: { label: 'Cancelado', cls: 'bg-zinc-100 text-zinc-700' },
    REFUNDED: { label: 'Estornado', cls: 'bg-zinc-100 text-zinc-700' },
    CHARGED_BACK: { label: 'Contestado', cls: 'bg-red-100 text-red-800' },
  };
  const s = map[status] ?? { label: status, cls: 'bg-muted text-muted-foreground' };
  return (
    <span
      className={`inline-flex items-center rounded-full px-3 py-1 text-sm font-medium ${s.cls}`}
    >
      {s.label}
    </span>
  );
}

export default function PaymentPage({ params }: PageProps) {
  const { user, token } = useAuth();
  const searchParams = useSearchParams();
  const method = (searchParams.get('method') ?? 'PIX') as PaymentMethod;
  const { orderId } = params;

  const [payment, setPayment] = useState<Payment | null>(null);
  const [orderTotal, setOrderTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const publicKey = process.env.NEXT_PUBLIC_MERCADOPAGO_PUBLIC_KEY ?? '';
  const isCard = method === 'CREDIT_CARD' || method === 'DEBIT_CARD';

  const stopPolling = useCallback(() => {
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
  }, []);

  const startPolling = useCallback(
    (current: Payment) => {
      if (TERMINAL_STATUSES.has(current.status)) return;
      stopPolling();
      pollingRef.current = setInterval(async () => {
        try {
          const updated = await getPaymentById(current.id, token!);
          setPayment(updated);
          if (TERMINAL_STATUSES.has(updated.status)) stopPolling();
        } catch {
          // ignore transient polling errors
        }
      }, POLL_INTERVAL);
    },
    [token, stopPolling],
  );

  useEffect(() => {
    if (!token) return;

    async function init() {
      setLoading(true);
      try {
        const order = await getOrder(token!, orderId);
        setOrderTotal(order.total);

        if (isCard) {
          const existing = await getPaymentByOrder(orderId, token!).catch(() => null);
          if (existing?.method === 'CREDIT_CARD') {
            setPayment(existing);
            if (!TERMINAL_STATUSES.has(existing.status)) startPolling(existing);
          }
          return;
        }

        const existing = await getPaymentByOrder(orderId, token!).catch(() => null);
        if (existing?.method === 'PIX' && !TERMINAL_STATUSES.has(existing.status)) {
          setPayment(existing);
          startPolling(existing);
          return;
        }

        const created = await createPixPayment({ orderId }, token!);
        setPayment(created);
        startPolling(created);
      } catch (err) {
        setError((err as Error).message);
      } finally {
        setLoading(false);
      }
    }

    init();
    return stopPolling;
  }, [orderId, token, isCard, startPolling, stopPolling]);

  async function handleCardSubmit(data: {
    token: string;
    installments: number;
    paymentMethodId: string;
    issuerId?: string;
    identificationNumber: string;
  }) {
    setError('');
    const result = await createCardPayment(
      {
        orderId,
        token: data.token,
        installments: data.installments,
        paymentMethodId: data.paymentMethodId,
        issuerId: data.issuerId,
        identificationNumber: data.identificationNumber,
      },
      token!,
    );
    setPayment(result);
    if (!TERMINAL_STATUSES.has(result.status)) startPolling(result);
  }

  if (!user) {
    return (
      <main className="mx-auto max-w-lg px-4 py-16 text-center">
        <p className="mb-4 text-muted-foreground">Faça login para continuar.</p>
        <Link
          href="/login"
          className="rounded-lg bg-primary px-6 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          Entrar
        </Link>
      </main>
    );
  }

  const showSuccess = payment?.status === 'APPROVED' || payment?.status === 'AUTHORIZED';
  const showRejected = payment && ['REJECTED', 'CANCELLED'].includes(payment.status);
  const showPix = payment && !TERMINAL_STATUSES.has(payment.status) && method === 'PIX';
  const showCard = isCard && !showSuccess && !showRejected;

  return (
    <main className="mx-auto max-w-lg px-4 py-8">
      <nav className="mb-6 flex items-center gap-2 text-sm text-muted-foreground">
        <Link href="/pedidos" className="hover:text-foreground">
          Pedidos
        </Link>
        <span>/</span>
        <Link href={`/pedidos/${orderId}`} className="hover:text-foreground">
          #{orderId.slice(-8).toUpperCase()}
        </Link>
        <span>/</span>
        <span className="text-foreground">Pagamento</span>
      </nav>

      <div className="rounded-2xl border border-border bg-card">
        <div className="flex items-center justify-between border-b border-border px-6 py-4">
          <div>
            <h1 className="font-semibold">Pagamento</h1>
            <p className="text-sm text-muted-foreground">{METHOD_LABELS[method]}</p>
          </div>
          <div className="flex flex-col items-end gap-1">
            {payment && <StatusBadge status={payment.status} />}
            <span className="text-xs text-muted-foreground">
              {formatBRL(payment?.amount ?? orderTotal)}
            </span>
          </div>
        </div>

        <div className="px-6 py-6">
          {loading && (
            <div className="flex flex-col items-center gap-3 py-12 text-muted-foreground">
              <Spinner />
              <p className="text-sm">{isCard ? 'Carregando...' : 'Gerando PIX...'}</p>
            </div>
          )}

          {error && (
            <div className="mb-4 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
              {error}
            </div>
          )}

          {!loading && showSuccess && <SuccessBlock orderId={orderId} />}

          {!loading && showRejected && <RejectedBlock payment={payment!} />}

          {!loading && showPix && <PixDisplay payment={payment!} />}

          {!loading && showCard && (
            <CardForm
              amount={payment?.amount ?? orderTotal}
              publicKey={publicKey}
              onSubmit={handleCardSubmit}
              onError={setError}
            />
          )}

          {!loading && showPix && !TERMINAL_STATUSES.has(payment!.status) && <PollingIndicator />}
        </div>
      </div>

      <div className="mt-4 flex justify-center gap-6 text-sm text-muted-foreground">
        <Link href={`/pedidos/${orderId}`} className="hover:text-foreground transition-colors">
          Ver detalhes do pedido
        </Link>
        <Link href="/pedidos" className="hover:text-foreground transition-colors">
          Meus pedidos
        </Link>
      </div>
    </main>
  );
}

function SuccessBlock({ orderId }: { orderId: string }) {
  return (
    <div className="flex flex-col items-center gap-4 py-10 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-green-100">
        <svg
          className="h-8 w-8 text-green-600"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
        </svg>
      </div>
      <div>
        <p className="font-semibold text-lg">Pagamento confirmado!</p>
        <p className="text-sm text-muted-foreground mt-1">Seu pedido está sendo processado.</p>
      </div>
      <Link
        href={`/pedidos/${orderId}`}
        className="rounded-lg bg-primary px-6 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
      >
        Ver pedido
      </Link>
    </div>
  );
}

function RejectedBlock({ payment }: { payment: Payment }) {
  return (
    <div className="flex flex-col items-center gap-4 py-8 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-red-100">
        <svg className="h-8 w-8 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M6 18L18 6M6 6l12 12"
          />
        </svg>
      </div>
      <div>
        <p className="font-semibold">Pagamento recusado</p>
        {payment.statusDetail && (
          <p className="text-sm text-muted-foreground mt-1">{payment.statusDetail}</p>
        )}
      </div>
      <Link
        href="/checkout"
        className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
      >
        Alterar método
      </Link>
    </div>
  );
}

function PollingIndicator() {
  return (
    <div className="mt-4 flex items-center justify-center gap-2 text-xs text-muted-foreground border-t border-border pt-4">
      <Spinner />
      Verificando status automaticamente...
    </div>
  );
}

function Spinner() {
  return (
    <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
    </svg>
  );
}
