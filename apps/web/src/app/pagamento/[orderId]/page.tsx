'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useAuth } from '@/contexts/auth-context';
import { createPayment, getPayment } from '@/lib/payments';
import { PixDisplay } from '@/components/payment/pix-display';
import { BoletoDisplay } from '@/components/payment/boleto-display';
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

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    PENDING: {
      label: 'Aguardando pagamento',
      cls: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300',
    },
    APPROVED: {
      label: 'Pago',
      cls: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300',
    },
    AUTHORIZED: {
      label: 'Autorizado',
      cls: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
    },
    IN_PROCESS: {
      label: 'Em análise',
      cls: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
    },
    IN_MEDIATION: {
      label: 'Em disputa',
      cls: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300',
    },
    REJECTED: {
      label: 'Recusado',
      cls: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300',
    },
    CANCELLED: {
      label: 'Cancelado',
      cls: 'bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300',
    },
    REFUNDED: {
      label: 'Estornado',
      cls: 'bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300',
    },
    CHARGED_BACK: {
      label: 'Chargeback',
      cls: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300',
    },
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

function formatBRL(n: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(n);
}

export default function PaymentPage({ params }: PageProps) {
  const { user, token } = useAuth();
  const searchParams = useSearchParams();
  const method = (searchParams.get('method') ?? 'PIX') as PaymentMethod;
  const { orderId } = params;

  const [payment, setPayment] = useState<Payment | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

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
          const updated = await getPayment(orderId, token!);
          setPayment(updated);
          if (TERMINAL_STATUSES.has(updated.status)) stopPolling();
        } catch {
          // ignore transient errors
        }
      }, POLL_INTERVAL);
    },
    [orderId, token, stopPolling],
  );

  // On mount: try to get existing payment, or auto-create for PIX/Boleto
  useEffect(() => {
    if (!token) return;

    async function init() {
      setLoading(true);
      try {
        // Try fetching existing payment first
        const existing = await getPayment(orderId, token!).catch(() => null);

        if (existing && !['REJECTED', 'CANCELLED'].includes(existing.status)) {
          setPayment(existing);
          startPolling(existing);
          return;
        }

        // Auto-create for PIX and Boleto
        if (method === 'PIX' || method === 'BOLETO') {
          const created = await createPayment(orderId, { method }, token!);
          setPayment(created);
          startPolling(created);
        }
      } catch (err) {
        setError((err as Error).message);
      } finally {
        setLoading(false);
      }
    }

    init();
    return stopPolling;
  }, [orderId, token, method, startPolling, stopPolling]);

  async function handleCardSubmit(data: {
    token: string;
    paymentMethodId: string;
    installments: number;
  }) {
    const created = await createPayment(
      orderId,
      {
        method: 'CREDIT_CARD',
        cardToken: data.token,
        paymentMethodId: data.paymentMethodId,
        installments: data.installments,
      },
      token!,
    );
    setPayment(created);
    startPolling(created);
  }

  async function retryPayment() {
    if (!token) return;
    setError('');
    setLoading(true);
    try {
      const created = await createPayment(orderId, { method }, token);
      setPayment(created);
      startPolling(created);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
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

  const publicKey = process.env.NEXT_PUBLIC_MERCADO_PAGO_PUBLIC_KEY ?? '';

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
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-6 py-4">
          <div>
            <h1 className="font-semibold">Pagamento</h1>
            <p className="text-sm text-muted-foreground">{METHOD_LABELS[method]}</p>
          </div>
          {payment && (
            <div className="flex flex-col items-end gap-1">
              <StatusBadge status={payment.status} />
              <span className="text-xs text-muted-foreground">{formatBRL(payment.amount)}</span>
            </div>
          )}
        </div>

        <div className="px-6 py-6">
          {/* Loading state */}
          {loading && !payment && (
            <div className="flex flex-col items-center gap-3 py-12 text-muted-foreground">
              <svg className="h-6 w-6 animate-spin" viewBox="0 0 24 24" fill="none">
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"
                />
              </svg>
              <p className="text-sm">Gerando pagamento...</p>
            </div>
          )}

          {/* Error state */}
          {error && !payment && (
            <div className="space-y-4 py-8 text-center">
              <p className="text-sm text-destructive">{error}</p>
              <button
                onClick={retryPayment}
                className="rounded-lg border border-border px-4 py-2 text-sm hover:bg-muted transition-colors"
              >
                Tentar novamente
              </button>
            </div>
          )}

          {/* APPROVED */}
          {payment?.status === 'APPROVED' && (
            <div className="flex flex-col items-center gap-4 py-10 text-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-green-100 dark:bg-green-900/30">
                <svg
                  className="h-8 w-8 text-green-600 dark:text-green-400"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M5 13l4 4L19 7"
                  />
                </svg>
              </div>
              <div>
                <p className="font-semibold text-lg">Pagamento confirmado!</p>
                <p className="text-sm text-muted-foreground mt-1">
                  Seu pedido está sendo processado.
                </p>
              </div>
              <Link
                href={`/pedidos/${orderId}`}
                className="rounded-lg bg-primary px-6 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
              >
                Ver pedido
              </Link>
            </div>
          )}

          {/* REJECTED */}
          {payment && ['REJECTED', 'CANCELLED'].includes(payment.status) && (
            <div className="flex flex-col items-center gap-4 py-8 text-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-red-100 dark:bg-red-900/30">
                <svg
                  className="h-8 w-8 text-red-600 dark:text-red-400"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
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
              <div className="flex gap-3">
                <button
                  onClick={retryPayment}
                  className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
                >
                  Tentar novamente
                </button>
                <Link
                  href="/checkout"
                  className="rounded-lg border border-border px-4 py-2 text-sm font-medium hover:bg-muted transition-colors"
                >
                  Alterar método
                </Link>
              </div>
            </div>
          )}

          {/* PIX */}
          {payment && !TERMINAL_STATUSES.has(payment.status) && method === 'PIX' && (
            <PixDisplay payment={payment} />
          )}

          {/* Boleto */}
          {payment && !TERMINAL_STATUSES.has(payment.status) && method === 'BOLETO' && (
            <BoletoDisplay payment={payment} />
          )}

          {/* Card form (no payment yet) */}
          {!payment && !loading && (method === 'CREDIT_CARD' || method === 'DEBIT_CARD') && (
            <CardForm
              amount={0}
              publicKey={publicKey}
              onSubmit={handleCardSubmit}
              disabled={false}
            />
          )}

          {/* Pending card (after submit) */}
          {payment && payment.method === 'CREDIT_CARD' && payment.status === 'IN_PROCESS' && (
            <div className="flex flex-col items-center gap-4 py-10 text-center">
              <svg className="h-6 w-6 animate-spin text-primary" viewBox="0 0 24 24" fill="none">
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"
                />
              </svg>
              <p className="text-sm text-muted-foreground">
                Seu pagamento está em análise. Aguarde...
              </p>
            </div>
          )}

          {/* Polling indicator for PIX/Boleto */}
          {payment &&
            !TERMINAL_STATUSES.has(payment.status) &&
            (method === 'PIX' || method === 'BOLETO') && (
              <div className="mt-4 flex items-center justify-center gap-2 text-xs text-muted-foreground border-t border-border pt-4">
                <svg className="h-3 w-3 animate-spin" viewBox="0 0 24 24" fill="none">
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"
                  />
                </svg>
                Verificando status automaticamente...
              </div>
            )}
        </div>
      </div>

      {/* Footer links */}
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
