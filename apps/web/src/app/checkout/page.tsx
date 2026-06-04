'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/auth-context';
import { useCart } from '@/contexts/cart-context';
import { createOrder, getShippingOptions } from '@/lib/cart-api';
import type { ShippingOption } from '@/types/cart';
import type { PaymentMethod } from '@/types/payment';

function formatBRL(n: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(n);
}

interface AddressForm {
  name: string;
  cep: string;
  street: string;
  number: string;
  complement: string;
  neighborhood: string;
  city: string;
  state: string;
}

const EMPTY_ADDRESS: AddressForm = {
  name: '',
  cep: '',
  street: '',
  number: '',
  complement: '',
  neighborhood: '',
  city: '',
  state: '',
};

const STATES = [
  'AC',
  'AL',
  'AP',
  'AM',
  'BA',
  'CE',
  'DF',
  'ES',
  'GO',
  'MA',
  'MT',
  'MS',
  'MG',
  'PA',
  'PB',
  'PR',
  'PE',
  'PI',
  'RJ',
  'RN',
  'RS',
  'RO',
  'RR',
  'SC',
  'SP',
  'SE',
  'TO',
];

const PAYMENT_METHODS: {
  method: PaymentMethod;
  label: string;
  description: string;
  icon: string;
}[] = [
  {
    method: 'PIX',
    label: 'PIX',
    description: 'Aprovação imediata • 24h',
    icon: '⚡',
  },
  {
    method: 'CREDIT_CARD',
    label: 'Cartão de crédito',
    description: 'Visa, Mastercard, Elo e outros',
    icon: '💳',
  },
  {
    method: 'BOLETO',
    label: 'Boleto bancário',
    description: 'Vence em 3 dias úteis',
    icon: '🏦',
  },
];

export default function CheckoutPage() {
  const { user, token } = useAuth();
  const { cart, refresh } = useCart();
  const router = useRouter();

  const [address, setAddress] = useState<AddressForm>(EMPTY_ADDRESS);
  const [shippingOptions, setShippingOptions] = useState<ShippingOption[]>([]);
  const [selectedShipping, setSelectedShipping] = useState<string>('');
  const [selectedPayment, setSelectedPayment] = useState<PaymentMethod>('PIX');
  const [cepLoading, setCepLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!token || !cart) return;
    getShippingOptions(token, cart.subtotal)
      .then(setShippingOptions)
      .catch(() => {});
  }, [token, cart?.subtotal]);

  useEffect(() => {
    if (shippingOptions.length && !selectedShipping) {
      setSelectedShipping(shippingOptions[0].method);
    }
  }, [shippingOptions]);

  function set(field: keyof AddressForm, value: string) {
    setAddress((prev) => ({ ...prev, [field]: value }));
  }

  async function lookupCep(cep: string) {
    const cleaned = cep.replace(/\D/g, '');
    if (cleaned.length !== 8) return;
    setCepLoading(true);
    try {
      const res = await fetch(`https://viacep.com.br/ws/${cleaned}/json/`);
      const data = await res.json();
      if (!data.erro) {
        setAddress((prev) => ({
          ...prev,
          street: data.logradouro || prev.street,
          neighborhood: data.bairro || prev.neighborhood,
          city: data.localidade || prev.city,
          state: data.uf || prev.state,
          cep: cleaned,
        }));
      }
    } catch {
      // ignore
    } finally {
      setCepLoading(false);
    }
  }

  const selectedOption = shippingOptions.find((o) => o.method === selectedShipping);
  const shippingCost = selectedOption?.price ?? 0;
  const total = (cart?.total ?? 0) + shippingCost;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!token || !cart) return;
    setError('');
    setSubmitting(true);
    try {
      const order = await createOrder(token, {
        shippingAddress: {
          name: address.name,
          cep: address.cep.replace(/\D/g, ''),
          street: address.street,
          number: address.number,
          complement: address.complement || undefined,
          neighborhood: address.neighborhood,
          city: address.city,
          state: address.state,
        },
        shippingMethod: selectedShipping,
        couponCode: cart.couponCode ?? undefined,
      });
      await refresh();
      router.push(`/pagamento/${order.id}?method=${selectedPayment}`);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  if (!user) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-16 text-center">
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

  if (!cart?.items.length) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-16 text-center">
        <p className="mb-4 text-muted-foreground">Seu carrinho está vazio.</p>
        <Link href="/produtos" className="text-sm font-medium text-primary hover:underline">
          Ver produtos
        </Link>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-5xl px-4 py-8">
      <nav className="mb-6 flex items-center gap-2 text-sm text-muted-foreground">
        <Link href="/carrinho" className="hover:text-foreground">
          Carrinho
        </Link>
        <span>/</span>
        <span className="text-foreground">Checkout</span>
      </nav>

      <h1 className="mb-6 text-2xl font-bold">Finalizar compra</h1>

      <form onSubmit={handleSubmit}>
        <div className="grid gap-6 lg:grid-cols-3">
          <div className="space-y-6 lg:col-span-2">
            {/* Shipping address */}
            <section className="rounded-xl border border-border p-5 space-y-4">
              <h2 className="font-semibold">Endereço de entrega</h2>

              <div>
                <label className="mb-1 block text-sm font-medium">Nome completo</label>
                <input
                  required
                  value={address.name}
                  onChange={(e) => set('name', e.target.value)}
                  placeholder="Fulano da Silva"
                  className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-sm font-medium">CEP</label>
                  <input
                    required
                    value={address.cep}
                    onChange={(e) => set('cep', e.target.value)}
                    onBlur={(e) => lookupCep(e.target.value)}
                    placeholder="00000-000"
                    maxLength={9}
                    className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                  {cepLoading && (
                    <p className="mt-0.5 text-xs text-muted-foreground">Buscando...</p>
                  )}
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium">Estado</label>
                  <select
                    required
                    value={address.state}
                    onChange={(e) => set('state', e.target.value)}
                    className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  >
                    <option value="">UF</option>
                    {STATES.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium">Rua / Logradouro</label>
                <input
                  required
                  value={address.street}
                  onChange={(e) => set('street', e.target.value)}
                  placeholder="Rua das Flores"
                  className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-sm font-medium">Número</label>
                  <input
                    required
                    value={address.number}
                    onChange={(e) => set('number', e.target.value)}
                    placeholder="123"
                    className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium">Complemento</label>
                  <input
                    value={address.complement}
                    onChange={(e) => set('complement', e.target.value)}
                    placeholder="Apto 42 (opcional)"
                    className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-sm font-medium">Bairro</label>
                  <input
                    required
                    value={address.neighborhood}
                    onChange={(e) => set('neighborhood', e.target.value)}
                    placeholder="Centro"
                    className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium">Cidade</label>
                  <input
                    required
                    value={address.city}
                    onChange={(e) => set('city', e.target.value)}
                    placeholder="São Paulo"
                    className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                </div>
              </div>
            </section>

            {/* Shipping method */}
            <section className="rounded-xl border border-border p-5 space-y-3">
              <h2 className="font-semibold">Frete</h2>
              {shippingOptions.length === 0 ? (
                <p className="text-sm text-muted-foreground">Calculando opções...</p>
              ) : (
                <div className="space-y-2">
                  {shippingOptions.map((opt) => (
                    <label
                      key={opt.method}
                      className="flex cursor-pointer items-center gap-3 rounded-lg border border-border px-4 py-3 hover:bg-muted transition-colors has-[:checked]:border-primary has-[:checked]:bg-primary/5"
                    >
                      <input
                        type="radio"
                        name="shipping"
                        value={opt.method}
                        checked={selectedShipping === opt.method}
                        onChange={() => setSelectedShipping(opt.method)}
                        className="accent-primary"
                      />
                      <div className="flex-1">
                        <p className="text-sm font-medium">{opt.name}</p>
                        <p className="text-xs text-muted-foreground">{opt.description}</p>
                      </div>
                      <span className="text-sm font-semibold">
                        {opt.price === 0 ? 'Grátis' : formatBRL(opt.price)}
                      </span>
                    </label>
                  ))}
                </div>
              )}
            </section>

            {/* Payment method */}
            <section className="rounded-xl border border-border p-5 space-y-3">
              <h2 className="font-semibold">Forma de pagamento</h2>
              <div className="space-y-2">
                {PAYMENT_METHODS.map((pm) => (
                  <label
                    key={pm.method}
                    className="flex cursor-pointer items-center gap-3 rounded-lg border border-border px-4 py-3 hover:bg-muted transition-colors has-[:checked]:border-primary has-[:checked]:bg-primary/5"
                  >
                    <input
                      type="radio"
                      name="payment"
                      value={pm.method}
                      checked={selectedPayment === pm.method}
                      onChange={() => setSelectedPayment(pm.method)}
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
            </section>
          </div>

          {/* Order summary */}
          <div className="space-y-4">
            <div className="rounded-xl border border-border p-5 space-y-3">
              <h2 className="font-semibold">Resumo</h2>

              <div className="space-y-1 text-sm">
                {cart.items.map((item) => (
                  <div key={item.productId} className="flex justify-between gap-2">
                    <span className="truncate text-muted-foreground">
                      {item.name} × {item.quantity}
                    </span>
                    <span className="shrink-0">
                      {formatBRL((item.salePrice ?? item.price) * item.quantity)}
                    </span>
                  </div>
                ))}
              </div>

              <div className="space-y-1 border-t border-border pt-3 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Subtotal</span>
                  <span>{formatBRL(cart.subtotal)}</span>
                </div>
                {cart.discount > 0 && (
                  <div className="flex justify-between text-green-600 dark:text-green-400">
                    <span>Desconto ({cart.coupon?.code})</span>
                    <span>- {formatBRL(cart.discount)}</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Frete</span>
                  <span>{shippingCost === 0 ? 'Grátis' : formatBRL(shippingCost)}</span>
                </div>
                <div className="flex justify-between border-t border-border pt-1.5 font-semibold">
                  <span>Total</span>
                  <span className="text-primary">{formatBRL(total)}</span>
                </div>
              </div>

              {selectedPayment && (
                <div className="rounded-lg bg-muted/60 px-3 py-2 text-xs text-muted-foreground">
                  Pagamento via{' '}
                  <span className="font-medium text-foreground">
                    {PAYMENT_METHODS.find((p) => p.method === selectedPayment)?.label}
                  </span>
                </div>
              )}

              {error && (
                <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
                  {error}
                </p>
              )}

              <button
                type="submit"
                disabled={submitting || !selectedShipping || !selectedPayment}
                className="w-full rounded-lg bg-primary py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-60 transition-colors"
              >
                {submitting ? 'Processando...' : 'Confirmar e ir para pagamento'}
              </button>
            </div>
          </div>
        </div>
      </form>
    </main>
  );
}
