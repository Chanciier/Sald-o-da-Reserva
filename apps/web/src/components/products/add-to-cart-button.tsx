'use client';

import { useState } from 'react';
import { useAuth } from '@/contexts/auth-context';
import { useCart } from '@/contexts/cart-context';

interface Props {
  productId: string;
  stock: number;
}

export function AddToCartButton({ productId, stock }: Props) {
  const { user } = useAuth();
  const { addItem, loading } = useCart();
  const [qty, setQty] = useState(1);
  const [feedback, setFeedback] = useState('');

  if (stock === 0) {
    return (
      <button
        disabled
        className="w-full rounded-lg bg-muted py-2.5 text-sm font-semibold text-muted-foreground cursor-not-allowed"
      >
        Sem estoque
      </button>
    );
  }

  if (!user) {
    return (
      <a
        href="/login"
        className="flex w-full items-center justify-center rounded-lg bg-primary py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 transition-colors"
      >
        Entrar para comprar
      </a>
    );
  }

  async function handleAdd() {
    setFeedback('');
    try {
      await addItem(productId, qty);
      setFeedback('Adicionado!');
      setTimeout(() => setFeedback(''), 2000);
    } catch (e) {
      setFeedback((e as Error).message);
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <button
          onClick={() => setQty((q) => Math.max(1, q - 1))}
          className="flex h-9 w-9 items-center justify-center rounded-lg border border-border hover:bg-muted transition-colors"
        >
          -
        </button>
        <span className="w-10 text-center text-sm font-medium">{qty}</span>
        <button
          onClick={() => setQty((q) => Math.min(stock, q + 1))}
          className="flex h-9 w-9 items-center justify-center rounded-lg border border-border hover:bg-muted transition-colors"
        >
          +
        </button>
        <span className="text-xs text-muted-foreground">{stock} disponíveis</span>
      </div>

      <button
        onClick={handleAdd}
        disabled={loading}
        className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-60 transition-colors"
      >
        {loading ? (
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
        ) : (
          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z"
            />
          </svg>
        )}
        Adicionar ao carrinho
      </button>

      {feedback && (
        <p
          className={`text-center text-xs font-medium ${feedback === 'Adicionado!' ? 'text-green-600 dark:text-green-400' : 'text-destructive'}`}
        >
          {feedback}
        </p>
      )}
    </div>
  );
}
