'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useAuth } from '@/contexts/auth-context';
import { useCart } from '@/contexts/cart-context';

function formatBRL(n: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(n);
}

export default function CartPage() {
  const { user } = useAuth();
  const { cart, loading, updateItem, removeItem, applyCoupon, removeCoupon } = useCart();
  const router = useRouter();
  const [couponInput, setCouponInput] = useState('');
  const [couponError, setCouponError] = useState('');
  const [couponLoading, setCouponLoading] = useState(false);

  if (!user) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-16 text-center">
        <p className="mb-4 text-muted-foreground">Faça login para ver seu carrinho.</p>
        <Link
          href="/login"
          className="rounded-lg bg-primary px-6 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          Entrar
        </Link>
      </main>
    );
  }

  async function handleApplyCoupon() {
    if (!couponInput.trim()) return;
    setCouponError('');
    setCouponLoading(true);
    try {
      await applyCoupon(couponInput.trim());
      setCouponInput('');
    } catch (e) {
      setCouponError((e as Error).message);
    } finally {
      setCouponLoading(false);
    }
  }

  if (!cart?.items.length) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-16 text-center">
        <p className="mb-4 text-muted-foreground">Seu carrinho está vazio.</p>
        <Link href="/produtos" className="text-sm font-medium text-primary hover:underline">
          Continuar comprando
        </Link>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-5xl px-4 py-8">
      <h1 className="mb-6 text-2xl font-bold">Meu Carrinho</h1>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-3 lg:col-span-2">
          {cart.items.map((item) => (
            <div key={item.productId} className="flex gap-4 rounded-xl border border-border p-4">
              {item.image ? (
                <Image
                  src={item.image}
                  alt={item.name}
                  width={80}
                  height={80}
                  className="h-20 w-20 shrink-0 rounded-lg object-cover"
                />
              ) : (
                <div className="h-20 w-20 shrink-0 rounded-lg bg-muted" />
              )}

              <div className="flex min-w-0 flex-1 flex-col gap-2">
                <div className="flex items-start justify-between gap-2">
                  <Link
                    href={`/produtos/${item.slug}`}
                    className="font-medium hover:text-primary leading-tight"
                  >
                    {item.name}
                  </Link>
                  <button
                    disabled={loading}
                    onClick={() => removeItem(item.productId)}
                    className="shrink-0 text-muted-foreground hover:text-destructive disabled:opacity-50"
                  >
                    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M6 18L18 6M6 6l12 12"
                      />
                    </svg>
                  </button>
                </div>

                <p className="text-xs text-muted-foreground">SKU: {item.sku}</p>

                {item.salePrice !== null && item.salePrice < item.price && (
                  <p className="text-xs text-muted-foreground line-through">
                    {formatBRL(item.price)}
                  </p>
                )}

                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <button
                      disabled={loading}
                      onClick={() => updateItem(item.productId, item.quantity - 1)}
                      className="flex h-7 w-7 items-center justify-center rounded-lg border border-border hover:bg-muted disabled:opacity-50"
                    >
                      -
                    </button>
                    <span className="w-8 text-center text-sm font-medium">{item.quantity}</span>
                    <button
                      disabled={loading || item.quantity >= item.stock}
                      onClick={() => updateItem(item.productId, item.quantity + 1)}
                      className="flex h-7 w-7 items-center justify-center rounded-lg border border-border hover:bg-muted disabled:opacity-50"
                    >
                      +
                    </button>
                    <span className="text-xs text-muted-foreground">
                      ({item.stock} disponíveis)
                    </span>
                  </div>
                  <span className="font-semibold text-primary">
                    {formatBRL((item.salePrice ?? item.price) * item.quantity)}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="space-y-4">
          <div className="rounded-xl border border-border p-4 space-y-3">
            <h2 className="font-semibold">Resumo do pedido</h2>

            {cart.coupon ? (
              <div className="flex items-center justify-between rounded-lg bg-green-50 px-3 py-2 text-sm dark:bg-green-950">
                <span className="font-medium text-green-700 dark:text-green-400">
                  {cart.coupon.code}
                </span>
                <button
                  onClick={() => removeCoupon()}
                  className="text-xs text-green-600 hover:underline dark:text-green-400"
                >
                  Remover
                </button>
              </div>
            ) : (
              <div className="space-y-1.5">
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={couponInput}
                    onChange={(e) => setCouponInput(e.target.value.toUpperCase())}
                    onKeyDown={(e) => e.key === 'Enter' && handleApplyCoupon()}
                    placeholder="Cupom de desconto"
                    className="flex-1 rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                  <button
                    onClick={handleApplyCoupon}
                    disabled={couponLoading || !couponInput.trim()}
                    className="rounded-lg bg-secondary px-3 py-2 text-sm font-medium hover:bg-secondary/80 disabled:opacity-50"
                  >
                    {couponLoading ? '...' : 'OK'}
                  </button>
                </div>
                {couponError && <p className="text-xs text-destructive">{couponError}</p>}
              </div>
            )}

            <div className="space-y-1.5 border-t border-border pt-3 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Subtotal</span>
                <span>{formatBRL(cart.subtotal)}</span>
              </div>
              {cart.discount > 0 && (
                <div className="flex justify-between text-green-600 dark:text-green-400">
                  <span>Desconto</span>
                  <span>- {formatBRL(cart.discount)}</span>
                </div>
              )}
              <div className="flex justify-between text-muted-foreground">
                <span>Frete</span>
                <span>calculado no checkout</span>
              </div>
              <div className="flex justify-between border-t border-border pt-1.5 font-semibold">
                <span>Total estimado</span>
                <span className="text-primary">{formatBRL(cart.total)}</span>
              </div>
            </div>

            <button
              onClick={() => router.push('/checkout')}
              className="w-full rounded-lg bg-primary py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 transition-colors"
            >
              Finalizar compra
            </button>
          </div>

          <Link
            href="/produtos"
            className="block text-center text-sm text-muted-foreground hover:text-foreground"
          >
            Continuar comprando
          </Link>
        </div>
      </div>
    </main>
  );
}
