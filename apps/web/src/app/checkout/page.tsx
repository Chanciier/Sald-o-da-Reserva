'use client';

import { useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/contexts/auth-context';
import { useCart } from '@/contexts/cart-context';
import { createOrder } from '@/lib/cart-api';
import { getShippingQuote } from '@/lib/shipping';
import type { ShippingOption } from '@/types/cart';
import type { PaymentMethod } from '@/types/payment';

import { STORE } from '@/lib/store';

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

async function fetchOrders(token: string) {
  const res = await fetch(`${API}/api/v1/orders`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: 'no-store',
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message ?? 'Erro');
  return Array.isArray(data) ? data : [];
}

type DeliveryMethod = 'SHIPPING' | 'PICKUP';

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

function formatPhone(v: string) {
  const d = v.replace(/\D/g, '').slice(0, 11);
  if (d.length <= 2) return d.length ? `(${d}` : '';
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
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

// Cartão de crédito temporariamente removido do checkout: a Public Key de
// produção (Vercel) e o Access Token de produção (Railway) estão de contas
// Mercado Pago diferentes, então o dinheiro cairia na conta errada. Reativar
// assim que as duas credenciais forem sincronizadas na mesma conta.
const PAYMENT_METHODS: {
  method: PaymentMethod;
  label: string;
  description: string;
  icon: string;
}[] = [{ method: 'PIX', label: 'PIX', description: 'Aprovação imediata', icon: '⚡' }];

export default function CheckoutPage() {
  const { user, token } = useAuth();
  const { cart, refresh } = useCart();
  const router = useRouter();

  const [deliveryMethod, setDeliveryMethod] = useState<DeliveryMethod>('SHIPPING');
  const [address, setAddress] = useState<AddressForm>(EMPTY_ADDRESS);
  const [shippingOptions, setShippingOptions] = useState<ShippingOption[]>([]);
  const [selectedShipping, setSelectedShipping] = useState<ShippingOption | null>(null);
  const [selectedPayment, setSelectedPayment] = useState<PaymentMethod>('PIX');
  const [cepLoading, setCepLoading] = useState(false);
  const [shippingLoading, setShippingLoading] = useState(false);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [returnsAccepted, setReturnsAccepted] = useState(false);
  const [cpf, setCpf] = useState('');
  const [phone, setPhone] = useState('');
  const [buyerName, setBuyerName] = useState(user?.name ?? '');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const lastQuotedCep = useRef('');

  const isPickup = deliveryMethod === 'PICKUP';

  const { data: orders = [] } = useQuery({
    queryKey: ['checkout-saved-addresses'],
    queryFn: () => fetchOrders(token!),
    enabled: !!token,
  });

  const savedAddresses = useMemo(() => {
    const seen = new Set<string>();
    const list: AddressForm[] = [];
    for (const o of orders) {
      const a = o.shippingAddress as Partial<AddressForm> | undefined;
      if (!a?.cep) continue;
      const key = `${a.cep}-${a.street}-${a.number}`;
      if (seen.has(key)) continue;
      seen.add(key);
      list.push({
        name: a.name ?? '',
        cep: a.cep ?? '',
        street: a.street ?? '',
        number: a.number ?? '',
        complement: a.complement ?? '',
        neighborhood: a.neighborhood ?? '',
        city: a.city ?? '',
        state: a.state ?? '',
      });
    }
    return list;
  }, [orders]);

  function set(field: keyof AddressForm, value: string) {
    setAddress((prev) => ({ ...prev, [field]: value }));
  }

  function selectSavedAddress(a: AddressForm) {
    setAddress(a);
    void fetchShippingQuotes(a.cep);
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
    await fetchShippingQuotes(cleaned);
  }

  async function fetchShippingQuotes(cep: string) {
    const cleaned = cep.replace(/\D/g, '');
    if (cleaned.length !== 8 || cleaned === lastQuotedCep.current) return;
    lastQuotedCep.current = cleaned;
    setShippingLoading(true);
    setSelectedShipping(null);
    try {
      const options = await getShippingQuote(cleaned, token ?? '');
      setShippingOptions(options);
      if (options.length) setSelectedShipping(options[0]);
    } catch {
      setShippingOptions([]);
    } finally {
      setShippingLoading(false);
    }
  }

  const shippingCost = isPickup ? 0 : (selectedShipping?.price ?? 0);
  const total = (cart?.total ?? 0) + shippingCost;

  const canSubmit = (isPickup ? true : !!selectedShipping) && termsAccepted && returnsAccepted;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!token || !cart || !canSubmit) return;
    setError('');
    setSubmitting(true);
    try {
      const cleanCpf = cpf.replace(/\D/g, '');
      if (cleanCpf.length !== 11) {
        setError('Informe um CPF válido.');
        setSubmitting(false);
        return;
      }

      const cleanPhone = phone.replace(/\D/g, '');
      if (cleanPhone.length < 10 || cleanPhone.length > 11) {
        setError('Informe um telefone válido com DDD.');
        setSubmitting(false);
        return;
      }

      const order = await createOrder(token, {
        deliveryMethod,
        cpf: cleanCpf,
        customerPhone: cleanPhone,
        buyerName: buyerName.trim() || undefined,
        ...(isPickup
          ? {}
          : {
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
              shippingMethod: selectedShipping!.name,
              shippingPrice: selectedShipping!.price,
              meServiceId: selectedShipping!.serviceId || undefined,
              meCarrier: selectedShipping!.carrier || undefined,
              deliveryMin: selectedShipping!.deliveryMin,
              deliveryMax: selectedShipping!.deliveryMax,
            }),
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
            {/* Delivery method selector */}
            <section className="rounded-xl border border-border p-5 space-y-3">
              <h2 className="font-semibold">Forma de recebimento</h2>
              <div className="grid grid-cols-2 gap-3">
                <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-border px-4 py-3 hover:bg-muted transition-colors has-[:checked]:border-primary has-[:checked]:bg-primary/5">
                  <input
                    type="radio"
                    name="deliveryMethod"
                    value="SHIPPING"
                    checked={deliveryMethod === 'SHIPPING'}
                    onChange={() => setDeliveryMethod('SHIPPING')}
                    className="accent-primary"
                  />
                  <div>
                    <p className="text-sm font-medium">Entrega</p>
                    <p className="text-xs text-muted-foreground">Receber em casa</p>
                  </div>
                </label>
                <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-border px-4 py-3 hover:bg-muted transition-colors has-[:checked]:border-primary has-[:checked]:bg-primary/5">
                  <input
                    type="radio"
                    name="deliveryMethod"
                    value="PICKUP"
                    checked={deliveryMethod === 'PICKUP'}
                    onChange={() => setDeliveryMethod('PICKUP')}
                    className="accent-primary"
                  />
                  <div>
                    <p className="text-sm font-medium">Retirada na Loja</p>
                    <p className="text-xs text-muted-foreground">Frete grátis</p>
                  </div>
                </label>
              </div>

              {isPickup && (
                <div className="rounded-lg bg-primary/5 border border-primary/20 px-4 py-3 space-y-1.5">
                  <p className="text-sm font-medium text-foreground">Local de retirada</p>
                  <p className="text-sm font-semibold">{STORE.mall}</p>
                  <p className="text-xs text-muted-foreground">
                    {STORE.address} — {STORE.neighborhood}, {STORE.city}/{STORE.state}
                  </p>
                  <p className="text-xs text-muted-foreground">CEP {STORE.cep}</p>
                  <p className="text-xs text-muted-foreground pt-1">
                    Você receberá uma notificação quando seu pedido estiver pronto para retirada.
                  </p>
                </div>
              )}
            </section>

            {/* CPF + Nome — required for NF-e */}
            <section className="rounded-xl border border-border p-5 space-y-3">
              <h2 className="font-semibold">Dados do comprador</h2>
              <div>
                <label className="mb-1 block text-sm font-medium">Nome completo</label>
                <input
                  required
                  value={buyerName}
                  onChange={(e) => setBuyerName(e.target.value)}
                  placeholder="Nome como deve constar na nota fiscal"
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
                  Enviaremos os avisos do seu pedido por aqui.
                </p>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium">CPF do titular da compra</label>
                <input
                  required
                  value={cpf}
                  onChange={(e) => setCpf(formatCpf(e.target.value))}
                  placeholder="000.000.000-00"
                  maxLength={14}
                  inputMode="numeric"
                  className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                />
                <p className="mt-1 text-xs text-muted-foreground">
                  Necessário para emissão de nota fiscal.
                </p>
              </div>
            </section>

            {/* Shipping address — hidden for PICKUP */}
            {!isPickup && (
              <section className="rounded-xl border border-border p-5 space-y-4">
                <h2 className="font-semibold">Endereço de entrega</h2>

                {savedAddresses.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-xs font-medium text-muted-foreground">
                      Usar um endereço salvo
                    </p>
                    <div className="grid gap-2 sm:grid-cols-2">
                      {savedAddresses.map((a, i) => {
                        const active =
                          address.cep.replace(/\D/g, '') === a.cep.replace(/\D/g, '') &&
                          address.number === a.number &&
                          address.street === a.street;
                        return (
                          <button
                            type="button"
                            key={`${a.cep}-${a.number}-${i}`}
                            onClick={() => selectSavedAddress(a)}
                            className={`rounded-lg border px-3 py-2 text-left text-xs transition-colors ${
                              active
                                ? 'border-primary bg-primary/5'
                                : 'border-border hover:bg-muted'
                            }`}
                          >
                            <p className="truncate font-medium text-foreground">{a.name}</p>
                            <p className="truncate text-muted-foreground">
                              {a.street}, {a.number}
                            </p>
                            <p className="truncate text-muted-foreground">
                              {a.neighborhood} · {a.city}/{a.state}
                            </p>
                          </button>
                        );
                      })}
                    </div>
                    <p className="border-t border-border pt-2 text-xs text-muted-foreground">
                      ou preencha um novo endereço abaixo
                    </p>
                  </div>
                )}

                <div>
                  <label className="mb-1 block text-sm font-medium">Nome completo</label>
                  <input
                    required
                    value={address.name}
                    onChange={(e) => set('name', e.target.value)}
                    placeholder="Fulano da Silva"
                    autoComplete="name"
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
                      inputMode="numeric"
                      autoComplete="postal-code"
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
                      autoComplete="address-level1"
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
                    autoComplete="address-line1"
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
                      inputMode="numeric"
                      autoComplete="address-line2"
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
                      autoComplete="address-level3"
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
                      autoComplete="address-level2"
                      className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                    />
                  </div>
                </div>
              </section>
            )}

            {/* Shipping options — hidden for PICKUP */}
            {!isPickup && (
              <section className="rounded-xl border border-border p-5 space-y-3">
                <div className="flex items-center justify-between">
                  <h2 className="font-semibold">Frete</h2>
                  {shippingLoading && (
                    <span className="text-xs text-muted-foreground animate-pulse">
                      Calculando...
                    </span>
                  )}
                </div>

                {shippingOptions.length === 0 && !shippingLoading ? (
                  <p className="text-sm text-muted-foreground">
                    {address.cep.replace(/\D/g, '').length === 8
                      ? 'Nenhuma opção de frete disponível para este CEP. Verifique o CEP ou tente novamente em instantes.'
                      : 'Informe o CEP para ver as opções de frete.'}
                  </p>
                ) : (
                  <div className="space-y-2">
                    {shippingOptions.map((opt) => (
                      <label
                        key={`${opt.method}-${opt.serviceId}`}
                        className="flex cursor-pointer items-center gap-3 rounded-lg border border-border px-4 py-3 hover:bg-muted transition-colors has-[:checked]:border-primary has-[:checked]:bg-primary/5"
                      >
                        <input
                          type="radio"
                          name="shipping"
                          checked={
                            selectedShipping?.method === opt.method &&
                            selectedShipping?.serviceId === opt.serviceId
                          }
                          onChange={() => setSelectedShipping(opt)}
                          className="accent-primary"
                        />
                        <div className="flex-1">
                          <p className="text-sm font-medium">
                            {opt.name}
                            {opt.carrier && opt.carrier !== opt.name ? (
                              <span className="text-muted-foreground font-normal">
                                {' '}
                                · {opt.carrier}
                              </span>
                            ) : null}
                          </p>
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
            )}

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
          <div className="space-y-4 lg:sticky lg:top-8 lg:self-start">
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
                  <span>
                    {isPickup ? (
                      <span className="text-green-600 dark:text-green-400 font-medium">Grátis</span>
                    ) : selectedShipping ? (
                      selectedShipping.price === 0 ? (
                        'Grátis'
                      ) : (
                        formatBRL(selectedShipping.price)
                      )
                    ) : (
                      '—'
                    )}
                  </span>
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

              <div className="space-y-2 border-t border-border pt-3">
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
                    <a
                      href="/termos-de-uso"
                      target="_blank"
                      className="text-primary hover:underline"
                    >
                      Termos de Uso
                    </a>
                  </span>
                </label>
                <label className="flex items-start gap-2 text-xs text-muted-foreground cursor-pointer">
                  <input
                    type="checkbox"
                    required
                    checked={returnsAccepted}
                    onChange={(e) => setReturnsAccepted(e.target.checked)}
                    className="mt-0.5 accent-primary shrink-0"
                  />
                  <span>
                    Li e concordo com a{' '}
                    <a
                      href="/trocas-e-devolucoes"
                      target="_blank"
                      className="text-primary hover:underline"
                    >
                      Política de Trocas e Devoluções
                    </a>
                  </span>
                </label>
              </div>

              {error && (
                <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
                  {error}
                </p>
              )}

              <button
                type="submit"
                disabled={submitting || !canSubmit || !selectedPayment}
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
