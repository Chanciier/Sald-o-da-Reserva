'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useCart } from '@/contexts/cart-context';
import { useAuth } from '@/contexts/auth-context';

function formatBRL(n: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(n);
}

export function CartDrawer() {
  const { cart, open, setOpen, updateItem, removeItem, applyCoupon, removeCoupon, loading } =
    useCart();
  const { user } = useAuth();
  const [couponInput, setCouponInput] = useState('');
  const [couponError, setCouponError] = useState('');
  const [couponLoading, setCouponLoading] = useState(false);

  if (!open) return null;

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

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/40" onClick={() => setOpen(false)} />

      <aside className="fixed right-0 top-0 z-50 flex h-full w-full max-w-md flex-col bg-background shadow-xl">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <h2 className="text-base font-semibold">
            Carrinho {cart?.itemCount ? `(${cart.itemCount})` : ''}
          </h2>
          <button
            onClick={() => setOpen(false)}
            className="rounded-lg p-1.5 hover:bg-muted transition-colors"
          >
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        {!user ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-4 p-6 text-center">
            <p className="text-muted-foreground">Faça login para usar o carrinho.</p>
            <Link
              href="/login"
              onClick={() => setOpen(false)}
              className="rounded-lg bg-primary px-6 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
            >
              Entrar
            </Link>
          </div>
        ) : !cart?.items.length ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
            <svg
              className="h-12 w-12 text-muted-foreground/40"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z"
              />
            </svg>
            <p className="text-sm text-muted-foreground">Seu carrinho está vazio.</p>
            <Link
              href="/produtos"
              onClick={() => setOpen(false)}
              className="text-sm font-medium text-primary hover:underline"
            >
              Ver produtos
            </Link>
          </div>
        ) : (
          <>
            <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
              {cart.items.map((item) => (
                <div
                  key={item.productId}
                  className="flex gap-3 rounded-lg border border-border p-3"
                >
                  {item.image ? (
                    <img
                      src={item.image}
                      alt={item.name}
                      className="h-16 w-16 shrink-0 rounded-md object-cover"
                    />
                  ) : (
                    <div className="h-16 w-16 shrink-0 rounded-md bg-muted" />
                  )}

                  <div className="flex min-w-0 flex-1 flex-col gap-1">
                    <Link
                      href={`/produtos/${item.slug}`}
                      onClick={() => setOpen(false)}
                      className="truncate text-sm font-medium hover:text-primary"
                    >
                      {item.name}
                    </Link>
                    <p className="text-xs text-muted-foreground">SKU: {item.sku}</p>
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-semibold text-primary">
                        {formatBRL((item.salePrice ?? item.price) * item.quantity)}
                      </span>
                      <div className="flex items-center gap-1">
                        <button
                          disabled={loading}
                          onClick={() => updateItem(item.productId, item.quantity - 1)}
                          className="flex h-6 w-6 items-center justify-center rounded border border-border text-xs hover:bg-muted disabled:opacity-50"
                        >
                          -
                        </button>
                        <span className="w-6 text-center text-sm">{item.quantity}</span>
                        <button
                          disabled={loading || item.quantity >= item.stock}
                          onClick={() => updateItem(item.productId, item.quantity + 1)}
                          className="flex h-6 w-6 items-center justify-center rounded border border-border text-xs hover:bg-muted disabled:opacity-50"
                        >
                          +
                        </button>
                        <button
                          disabled={loading}
                          onClick={() => removeItem(item.productId)}
                          className="ml-1 flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:text-destructive disabled:opacity-50"
                        >
                          <svg
                            className="h-3.5 w-3.5"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                            />
                          </svg>
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="border-t border-border px-4 py-4 space-y-3">
              {cart.coupon ? (
                <div className="flex items-center justify-between rounded-lg bg-green-50 px-3 py-2 text-sm dark:bg-green-950">
                  <span className="font-medium text-green-700 dark:text-green-400">
                    Cupom <strong>{cart.coupon.code}</strong> aplicado
                  </span>
                  <button
                    onClick={() => removeCoupon()}
                    className="text-xs text-green-600 hover:underline dark:text-green-400"
                  >
                    Remover
                  </button>
                </div>
              ) : (
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={couponInput}
                    onChange={(e) => setCouponInput(e.target.value.toUpperCase())}
                    placeholder="Cupom de desconto"
                    className="flex-1 rounded-lg border border-input bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                  <button
                    onClick={handleApplyCoupon}
                    disabled={couponLoading || !couponInput.trim()}
                    className="rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
                  >
                    {couponLoading ? '...' : 'Aplicar'}
                  </button>
                </div>
              )}
              {couponError && <p className="text-xs text-destructive">{couponError}</p>}

              <div className="space-y-1 text-sm">
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
                <div className="flex justify-between border-t border-border pt-1 font-semibold">
                  <span>Total</span>
                  <span className="text-primary">{formatBRL(cart.total)}</span>
                </div>
              </div>

              <Link
                href="/checkout"
                onClick={() => setOpen(false)}
                className="flex w-full items-center justify-center rounded-lg bg-primary py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 transition-colors"
              >
                Finalizar compra
              </Link>

              <Link
                href="/carrinho"
                onClick={() => setOpen(false)}
                className="flex w-full items-center justify-center rounded-lg border border-border py-2 text-sm hover:bg-muted transition-colors"
              >
                Ver carrinho completo
              </Link>
            </div>
          </>
        )}
      </aside>
    </>
  );
}
