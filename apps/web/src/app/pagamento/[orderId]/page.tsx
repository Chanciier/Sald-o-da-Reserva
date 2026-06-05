'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useAuth } from '@/contexts/auth-context';
import { createPayment, getPayment, getPaymentStatus } from '@/lib/payments';
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

const TERMINAL_STATUSES = new Set(['APPROVED', 'REJECTED', 'CANCELLED', 'REFUNDED']);
const POLL_INTERVAL = 5000;

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatBRL(n: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(n);
}

function formatCpf(v: string) {
  const d = v.replace(/\D/g, '').slice(0, 11);
  if (d.length <= 3) return d;
  if (d.length <= 6) return `${d.slice(0, 3)}.${d.slice(3)}`;
  if (d.length <= 9) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6)}`;
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
}

function validateCpf(raw: string): boolean {
  const d = raw.replace(/\D/g, '');
  if (d.length !== 11 || /^(\d)\1+$/.test(d)) return false;
  let sum = 0;
  for (let i = 0; i < 9; i++) sum += parseInt(d[i]) * (10 - i);
  let r = (sum * 10) % 11;
  if (r === 10 || r === 11) r = 0;
  if (r !== parseInt(d[9])) return false;
  sum = 0;
  for (let i = 0; i < 10; i++) sum += parseInt(d[i]) * (11 - i);
  r = (sum * 10) % 11;
  if (r === 10 || r === 11) r = 0;
  return r === parseInt(d[10]);
}

// ── CPF collection step (shown before boleto is created) ──────────────────────

function CpfForm({ onSubmit }: { onSubmit: (cpf: string) => void }) {
  const [value, setValue] = useState('');
  const [touched, setTouched] = useState(false);
  const clean = value.replace(/\D/g, '');
  const valid = validateCpf(clean);
  const showError = touched && value.length > 0 && !valid;

  return (
    <div className="space-y-5 py-4">
      <div className="flex flex-col items-center gap-2 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-2xl">
          🏦
        </div>
        <p className="font-semibold">Informe seu CPF</p>
        <p className="text-sm text-muted-foreground">
          O CPF do pagador é necessário para emitir o boleto.
        </p>
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium">CPF</label>
        <input
          type="text"
          inputMode="numeric"
          placeholder="000.000.000-00"
          value={value}
          onChange={(e) => setValue(formatCpf(e.target.value))}
          onBlur={() => setTouched(true)}
          maxLength={14}
          className={`w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring ${
            showError ? 'border-destructive' : 'border-input bg-background'
          }`}
        />
        {showError && (
          <p className="mt-1 text-xs text-destructive">
            CPF inválido. Verifique e tente novamente.
          </p>
        )}
      </div>

      <button
        onClick={() => {
          setTouched(true);
          if (valid) onSubmit(clean);
        }}
        disabled={!valid}
        className="w-full rounded-lg bg-primary py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-60 transition-colors"
      >
        Gerar boleto
      </button>
    </div>
  );
}

// ── Status badge ──────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    PENDING: { label: 'Aguardando pagamento', cls: 'bg-yellow-100 text-yellow-800' },
    APPROVED: { label: 'Pago', cls: 'bg-green-100 text-green-800' },
    AUTHORIZED: { label: 'Autorizado', cls: 'bg-blue-100 text-blue-800' },
    REJECTED: { label: 'Recusado', cls: 'bg-red-100 text-red-800' },
    CANCELLED: { label: 'Cancelado', cls: 'bg-zinc-100 text-zinc-700' },
    REFUNDED: { label: 'Estornado', cls: 'bg-zinc-100 text-zinc-700' },
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

// ── Page ──────────────────────────────────────────────────────────────────────

export default function PaymentPage({ params }: PageProps) {
  const { user, token } = useAuth();
  const searchParams = useSearchParams();
  const method = (searchParams.get('method') ?? 'CREDIT_CARD') as PaymentMethod;
  const { orderId } = params;

  const [payment, setPayment] = useState<Payment | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [verifying, setVerifying] = useState(false);
  /** CPF collected before boleto creation; null = not yet collected */
  const [taxId, setTaxId] = useState<string | null>(null);
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
          // ignore transient polling errors
        }
      }, POLL_INTERVAL);
    },
    [orderId, token, stopPolling],
  );

  useEffect(() => {
    if (!token) return;

    // BOLETO: wait for CPF before creating
    if (method === 'BOLETO' && taxId === null) {
      setLoading(false);
      return;
    }

    async function init() {
      setLoading(true);
      try {
        const existing = await getPayment(orderId, token!).catch(() => null);

        if (existing && !['REJECTED', 'CANCELLED'].includes(existing.status)) {
          const isCard = method === 'CREDIT_CARD' || method === 'DEBIT_CARD';
          if (isCard && existing.status === 'PENDING') {
            // fall through to show card form again
          } else {
            setPayment(existing);
            startPolling(existing);
            return;
          }
        }

        if (method === 'PIX') {
          const created = await createPayment(orderId, { method }, token!);
          setPayment(created);
          startPolling(created);
        }

        if (method === 'BOLETO' && taxId) {
          const created = await createPayment(orderId, { method, taxId }, token!);
          setPayment(created);
          startPolling(created);
        }
        // CREDIT_CARD: PaymentIntent is created lazily in CardFormWrapper
      } catch (err) {
        setError((err as Error).message);
      } finally {
        setLoading(false);
      }
    }

    init();
    return stopPolling;
  }, [orderId, token, method, taxId, startPolling, stopPolling]);

  async function handleCardInit(): Promise<string> {
    const created = await createPayment(orderId, { method: 'CREDIT_CARD' }, token!);
    setPayment(created);
    return created.clientSecret ?? '';
  }

  /**
   * Chamado após confirmação do pagamento com cartão.
   * Consulta o backend para obter o status atualizado, depois inicia polling.
   */
  async function handleCardSuccess(paymentIntentId: string) {
    setVerifying(true);
    try {
      // Prefer the dedicated status endpoint; fall back to getPayment if paymentId is absent
      const currentPayment = payment;
      let updated: Payment;

      if (currentPayment?.id) {
        updated = await getPaymentStatus(currentPayment.id, token!);
      } else {
        updated = await getPayment(orderId, token!);
      }

      setPayment(updated);

      if (!TERMINAL_STATUSES.has(updated.status)) {
        // Not yet confirmed by webhook — keep polling
        startPolling(updated);
      }
    } catch {
      // Status check failed — fall back to polling
      if (payment) startPolling(payment);
    } finally {
      setVerifying(false);
      // Suppress unused-variable warning for paymentIntentId
      void paymentIntentId;
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
          {payment && (
            <div className="flex flex-col items-end gap-1">
              <StatusBadge status={payment.status} />
              <span className="text-xs text-muted-foreground">{formatBRL(payment.amount)}</span>
            </div>
          )}
        </div>

        <div className="px-6 py-6">
          {/* CPF step — shown before boleto is created */}
          {method === 'BOLETO' && taxId === null && !payment && !error && (
            <CpfForm onSubmit={(cpf) => setTaxId(cpf)} />
          )}

          {/* Loading */}
          {loading && !payment && taxId !== null && (
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

          {/* Error */}
          {error && !payment && (
            <div className="space-y-4 py-8 text-center">
              <p className="text-sm text-destructive">{error}</p>
              <div className="flex flex-col sm:flex-row gap-2 justify-center">
                <button
                  onClick={() => {
                    setError('');
                    setLoading(false);
                    // For boleto, reset CPF step so user can retry
                    if (method === 'BOLETO') setTaxId(null);
                  }}
                  className="rounded-lg border border-border px-4 py-2 text-sm hover:bg-muted transition-colors"
                >
                  Tentar novamente
                </button>
                <Link
                  href="/checkout"
                  className="rounded-lg border px-4 py-2 text-sm text-center hover:bg-muted transition-colors"
                >
                  Alterar método
                </Link>
              </div>
            </div>
          )}

          {/* Verifying card payment with backend */}
          {verifying && (
            <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
              <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
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
              Confirmando pagamento...
            </div>
          )}

          {/* APPROVED / AUTHORIZED */}
          {!verifying && (payment?.status === 'APPROVED' || payment?.status === 'AUTHORIZED') && (
            <div className="flex flex-col items-center gap-4 py-10 text-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-green-100">
                <svg
                  className="h-8 w-8 text-green-600"
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

          {/* REJECTED / CANCELLED */}
          {!verifying && payment && ['REJECTED', 'CANCELLED'].includes(payment.status) && (
            <div className="flex flex-col items-center gap-4 py-8 text-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-red-100">
                <svg
                  className="h-8 w-8 text-red-600"
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
              <Link
                href="/checkout"
                className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
              >
                Alterar método
              </Link>
            </div>
          )}

          {/* PIX */}
          {payment && !TERMINAL_STATUSES.has(payment.status) && method === 'PIX' && (
            <PixDisplay payment={payment} />
          )}

          {/* Boleto */}
          {payment && !TERMINAL_STATUSES.has(payment.status) && method === 'BOLETO' && (
            <BoletoDisplay payment={payment} orderId={orderId} />
          )}

          {/* Card form */}
          {!loading &&
            !verifying &&
            (method === 'CREDIT_CARD' || method === 'DEBIT_CARD') &&
            !['APPROVED', 'AUTHORIZED', 'REJECTED', 'CANCELLED', 'REFUNDED'].includes(
              payment?.status ?? '',
            ) && (
              <CardFormWrapper
                existingClientSecret={payment?.clientSecret ?? null}
                onInit={handleCardInit}
                onSuccess={handleCardSuccess}
                onError={(msg) => setError(msg)}
              />
            )}

          {/* Polling indicator — PIX and BOLETO */}
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

// ── CardFormWrapper ───────────────────────────────────────────────────────────

function CardFormWrapper({
  existingClientSecret,
  onInit,
  onSuccess,
  onError,
}: {
  existingClientSecret: string | null;
  onInit: () => Promise<string>;
  onSuccess: (paymentIntentId: string) => void;
  onError: (msg: string) => void;
}) {
  const [clientSecret, setClientSecret] = useState<string | null>(existingClientSecret);
  const [initializing, setInitializing] = useState(!existingClientSecret);

  useEffect(() => {
    if (clientSecret) return;
    onInit()
      .then((cs) => {
        if (cs) setClientSecret(cs);
      })
      .catch((e) => onError((e as Error).message))
      .finally(() => setInitializing(false));
  }, []); // intentionally empty — runs once on mount

  if (initializing) {
    return (
      <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
        <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
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
        Preparando formulário...
      </div>
    );
  }

  if (!clientSecret) {
    return (
      <p className="py-6 text-center text-sm text-destructive">
        Não foi possível carregar o formulário de pagamento.
      </p>
    );
  }

  return <CardForm clientSecret={clientSecret} onSuccess={onSuccess} onError={onError} />;
}
