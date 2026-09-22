'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/auth-context';
import { checkClubCpfApi, clubSignupApi } from '@/lib/auth-api';
import { getProduct } from '@/lib/api';
import { TurnstileWidget } from '@/components/auth/turnstile-widget';
import type { Product } from '@/types/product';
import type { PaymentMethod } from '@/types/payment';

function formatCpf(v: string) {
  const d = v.replace(/\D/g, '').slice(0, 11);
  if (d.length <= 3) return d;
  if (d.length <= 6) return `${d.slice(0, 3)}.${d.slice(3)}`;
  if (d.length <= 9) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6)}`;
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
}

function formatPhone(v: string) {
  const d = v.replace(/\D/g, '').slice(0, 11);
  if (d.length <= 2) return d.length ? `(${d}` : '';
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

function formatBRL(n: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(n);
}

function formatDatePtBR(iso: string) {
  return new Date(iso).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
}

const PAYMENT_METHODS: {
  method: PaymentMethod;
  label: string;
  description: string;
  icon: string;
}[] = [
  { method: 'PIX', label: 'PIX', description: 'Aprovação imediata', icon: '⚡' },
  { method: 'CREDIT_CARD', label: 'Cartão de crédito', description: 'Em até 12x', icon: '💳' },
];

// Assinatura do Clube Reversa: sem carrinho, sem escolha de entrega — clica
// pra assinar, preenche nome/telefone/CPF, paga e pronto (ver
// ClubSignupService no backend, que já cria o pedido e dispara o registro no
// Bling + a mensagem de confirmação assim que o pagamento é aprovado).
// Funciona igual pra quem já tem conta e pra quem não tem.
export default function AssinarClubePage() {
  const { user, token, applySession } = useAuth();
  const router = useRouter();

  const [product, setProduct] = useState<Product | null>(null);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [cpf, setCpf] = useState('');
  const [method, setMethod] = useState<PaymentMethod>('PIX');
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [turnstileToken, setTurnstileToken] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [existingMemberUntil, setExistingMemberUntil] = useState<string | null>(null);
  const [checkingCpf, setCheckingCpf] = useState(false);

  const turnstileSiteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;

  useEffect(() => {
    getProduct('clube-reversa')
      .then(setProduct)
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (user?.name) setName(user.name);
  }, [user?.name]);

  async function handleCpfBlur() {
    const cleanCpf = cpf.replace(/\D/g, '');
    if (cleanCpf.length !== 11) return;
    setCheckingCpf(true);
    try {
      const status = await checkClubCpfApi(cleanCpf);
      setExistingMemberUntil(status.isMember ? status.validUntil : null);
    } catch {
      // Fail-open: não deu pra confirmar, não trava a tela — a checagem que
      // realmente importa roda de novo no backend na hora de assinar.
      setExistingMemberUntil(null);
    } finally {
      setCheckingCpf(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');

    const cleanCpf = cpf.replace(/\D/g, '');
    if (cleanCpf.length !== 11) {
      setError('Informe um CPF válido.');
      return;
    }
    const cleanPhone = phone.replace(/\D/g, '');
    if (cleanPhone.length < 10 || cleanPhone.length > 11) {
      setError('Informe um telefone válido com DDD.');
      return;
    }
    if (turnstileSiteKey && !turnstileToken) {
      setError('Complete a verificação de segurança e tente novamente.');
      return;
    }
    if (existingMemberUntil) {
      setError(
        `Este CPF já é sócio do Clube Reversa (válido até ${formatDatePtBR(existingMemberUntil)}).`,
      );
      return;
    }

    setSubmitting(true);
    try {
      const result = await clubSignupApi(
        name.trim(),
        cleanPhone,
        cleanCpf,
        token ?? undefined,
        turnstileToken || undefined,
      );
      if (result.accessToken && result.refreshToken && result.user) {
        applySession({
          accessToken: result.accessToken,
          refreshToken: result.refreshToken,
          user: result.user,
        });
      }
      router.push(`/pagamento/${result.orderId}?method=${method}`);
    } catch (err) {
      setError((err as Error).message);
      setSubmitting(false);
    }
  }

  return (
    <main className="mx-auto max-w-md px-4 py-12">
      <h1 className="mb-1 text-2xl font-bold">Assinar o Clube Reversa</h1>
      <p className="mb-6 text-sm text-muted-foreground">
        {product ? `${formatBRL(product.salePrice ?? product.price)}/ano` : 'Assinatura anual'} —
        preencha seus dados e pague. {!user && 'Sem precisar criar cadastro.'}
      </p>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="mb-1 block text-sm font-medium">Nome completo</label>
          <input
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={150}
            autoComplete="name"
            className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium">Celular / WhatsApp</label>
          <input
            required
            value={phone}
            onChange={(e) => setPhone(formatPhone(e.target.value))}
            placeholder="(11) 91234-5678"
            maxLength={16}
            inputMode="tel"
            autoComplete="tel"
            className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
          <p className="mt-1 text-xs text-muted-foreground">
            É pra esse número que enviaremos a confirmação de sócio ativo.
          </p>
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium">CPF</label>
          <input
            required
            value={cpf}
            onChange={(e) => {
              setCpf(formatCpf(e.target.value));
              setExistingMemberUntil(null);
            }}
            onBlur={handleCpfBlur}
            placeholder="000.000.000-00"
            maxLength={14}
            inputMode="numeric"
            className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
          {checkingCpf && <p className="mt-1 text-xs text-muted-foreground">Verificando CPF...</p>}
          {existingMemberUntil && (
            <p className="mt-1 text-xs text-destructive">
              Este CPF já é sócio do Clube Reversa (válido até {formatDatePtBR(existingMemberUntil)}
              ).
            </p>
          )}
        </div>

        <div className="space-y-2">
          <label className="block text-sm font-medium">Forma de pagamento</label>
          {PAYMENT_METHODS.map((pm) => (
            <label
              key={pm.method}
              className="flex cursor-pointer items-center gap-3 rounded-lg border border-border px-4 py-3 hover:bg-muted transition-colors has-[:checked]:border-primary has-[:checked]:bg-primary/5"
            >
              <input
                type="radio"
                name="method"
                value={pm.method}
                checked={method === pm.method}
                onChange={() => setMethod(pm.method)}
                className="accent-primary"
              />
              <span className="text-lg">{pm.icon}</span>
              <div className="flex-1">
                <p className="text-sm font-medium">{pm.label}</p>
                <p className="text-xs text-muted-foreground">{pm.description}</p>
              </div>
            </label>
          ))}
        </div>

        <label className="flex items-start gap-2 text-xs text-muted-foreground cursor-pointer">
          <input
            type="checkbox"
            required
            checked={termsAccepted}
            onChange={(e) => setTermsAccepted(e.target.checked)}
            className="mt-0.5 accent-primary shrink-0"
          />
          <span>
            Li e concordo com os{' '}
            <a href="/termos-de-uso" target="_blank" className="text-primary hover:underline">
              Termos de Uso
            </a>
          </span>
        </label>

        <TurnstileWidget onToken={setTurnstileToken} />

        {error && (
          <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>
        )}

        <button
          type="submit"
          disabled={submitting || !termsAccepted || !!existingMemberUntil}
          className="w-full rounded-lg bg-primary py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-60 transition-colors"
        >
          {submitting ? 'Processando...' : 'Assinar e pagar'}
        </button>
      </form>

      <p className="mt-4 text-center text-xs text-muted-foreground">
        <Link href="/produtos/clube-reversa" className="hover:underline">
          Ver detalhes do Clube Reversa
        </Link>
      </p>
    </main>
  );
}
