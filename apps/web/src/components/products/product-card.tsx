'use client';

import { useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { ShoppingCart, Zap } from 'lucide-react';
import { useCart } from '@/contexts/cart-context';
import type { Product } from '@/types/product';

function formatPrice(value: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
}

function discountPercent(price: number, salePrice: number) {
  return Math.round(((price - salePrice) / price) * 100);
}

function AddToCartBtn({ productId, stock }: { productId: string; stock: number }) {
  const { addItem, loading } = useCart();
  const [feedback, setFeedback] = useState('');

  async function handleAdd(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    setFeedback('');
    try {
      await addItem(productId, 1);
      setFeedback('Adicionado!');
      setTimeout(() => setFeedback(''), 2000);
    } catch (err) {
      setFeedback((err as Error).message);
    }
  }

  if (stock === 0) {
    return (
      <button
        disabled
        className="w-full rounded-xl bg-muted py-2.5 text-sm font-bold text-muted-foreground cursor-not-allowed"
      >
        Sem estoque
      </button>
    );
  }

  return (
    <div>
      <button
        onClick={handleAdd}
        disabled={loading}
        className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary py-2.5 text-sm font-bold text-primary-foreground hover:bg-primary/90 disabled:opacity-60 transition-colors"
      >
        <ShoppingCart className="size-4" />
        Colocar no carrinho
      </button>
      {feedback && (
        <p
          className={`mt-1 text-center text-xs font-medium ${
            feedback === 'Adicionado!' ? 'text-green-600 dark:text-green-400' : 'text-destructive'
          }`}
        >
          {feedback}
        </p>
      )}
    </div>
  );
}

export function ProductCard({ product }: { product: Product }) {
  const hasDiscount = product.salePrice !== null && product.salePrice < product.price;
  const price = hasDiscount ? product.salePrice! : product.price;
  const off = hasDiscount ? discountPercent(product.price, product.salePrice!) : 0;
  const savings = hasDiscount ? product.price - product.salePrice! : 0;
  const lowStock = product.stock > 0 && product.stock <= 5;
  const image = product.images?.[0]?.url ?? '/placeholder.svg';
  const installment = price / 12;

  return (
    <Link
      href={`/produtos/${product.slug}`}
      className="group flex h-full flex-col overflow-hidden rounded-2xl border border-border bg-card transition-all hover:-translate-y-1 hover:shadow-xl"
    >
      <div className="relative aspect-square overflow-hidden bg-muted/40 p-4">
        {off > 0 && (
          <span className="absolute left-3 top-3 z-10 rounded-md bg-accent px-2 py-1 text-xs font-bold text-accent-foreground shadow">
            -{off}%
          </span>
        )}
        {product.brand && (
          <span className="absolute right-3 top-3 z-10 rounded-md bg-secondary/90 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-secondary-foreground">
            {product.brand}
          </span>
        )}
        <Image
          src={image}
          alt={product.name}
          fill
          sizes="(max-width: 768px) 50vw, 25vw"
          className="object-contain transition-transform duration-300 group-hover:scale-105"
        />
      </div>

      <div className="flex flex-1 flex-col p-4">
        {product.category && (
          <p className="text-xs font-medium uppercase tracking-wide text-accent">
            {product.category.name}
          </p>
        )}
        <h3 className="mt-1 line-clamp-2 min-h-[2.5rem] text-sm font-semibold leading-snug text-card-foreground group-hover:text-primary">
          {product.name}
        </h3>

        <div className="mt-3">
          {hasDiscount && (
            <p className="text-xs text-muted-foreground line-through">
              {formatPrice(product.price)}
            </p>
          )}
          <p className="text-2xl font-extrabold leading-tight text-card-foreground">
            {formatPrice(price)}
          </p>
          {savings > 0 && (
            <p className="text-xs font-medium text-success">
              Você economiza {formatPrice(savings)}
            </p>
          )}
          <p className="mt-0.5 text-xs text-muted-foreground">
            ou 12x de{' '}
            <span className="font-semibold text-card-foreground">{formatPrice(installment)}</span>
          </p>
        </div>

        <div className="mt-3 flex items-center gap-1.5 text-xs">
          <Zap className={`size-3.5 ${lowStock ? 'text-accent' : 'text-muted-foreground'}`} />
          <span className={lowStock ? 'font-semibold text-accent' : 'text-muted-foreground'}>
            {lowStock ? `Últimas ${product.stock} unidades!` : `${product.stock} em estoque`}
          </span>
        </div>

        <div className="mt-auto pt-4">
          <AddToCartBtn productId={product.id} stock={product.stock} />
        </div>
      </div>
    </Link>
  );
}
