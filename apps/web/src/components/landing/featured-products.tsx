'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { motion } from 'motion/react';
import { ShoppingCart, Zap } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface ApiProduct {
  id: string;
  name: string;
  slug: string;
  price: number;
  salePrice: number | null;
  stock: number;
  status: string;
  brand?: string;
  category: { name: string; slug: string } | string;
  images?: { url: string }[];
}

const DEFAULT_CATEGORIES = ['Todos'];

function formatBRL(value: number) {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function discountPct(price: number, salePrice: number) {
  return Math.round((1 - salePrice / price) * 100);
}

function getCategoryName(category: ApiProduct['category']): string {
  if (typeof category === 'string') return category;
  return category?.name ?? '';
}

function ProductCard({ product, index = 0 }: { product: ApiProduct; index?: number }) {
  const hasDiscount = product.salePrice !== null && product.salePrice < product.price;
  const price = hasDiscount ? product.salePrice! : product.price;
  const off = hasDiscount ? discountPct(product.price, product.salePrice!) : 0;
  const savings = hasDiscount ? product.price - product.salePrice! : 0;
  const lowStock = product.stock <= 5;
  const image = product.images?.[0]?.url ?? '/placeholder.svg';
  const installment = price / 12;

  return (
    <motion.article
      initial={{ opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.4, delay: (index % 4) * 0.08 }}
      className="group flex flex-col overflow-hidden rounded-2xl border border-border bg-card transition-all hover:-translate-y-1 hover:shadow-xl"
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
        <img
          src={image}
          alt={product.name}
          loading="lazy"
          className="size-full object-contain transition-transform duration-300 group-hover:scale-105"
        />
      </div>

      <div className="flex flex-1 flex-col p-4">
        <p className="text-xs font-medium uppercase tracking-wide text-accent">
          {getCategoryName(product.category)}
        </p>
        <h3 className="mt-1 line-clamp-2 min-h-[2.5rem] text-sm font-semibold leading-snug text-card-foreground">
          {product.name}
        </h3>

        <div className="mt-3">
          {hasDiscount && (
            <p className="text-xs text-muted-foreground line-through">{formatBRL(product.price)}</p>
          )}
          <p className="text-2xl font-extrabold leading-tight text-card-foreground">
            {formatBRL(price)}
          </p>
          {savings > 0 && (
            <p className="text-xs font-medium text-success">Você economiza {formatBRL(savings)}</p>
          )}
          <p className="mt-0.5 text-xs text-muted-foreground">
            ou 12x de{' '}
            <span className="font-semibold text-card-foreground">{formatBRL(installment)}</span>
          </p>
        </div>

        <div className="mt-3 flex items-center gap-1.5 text-xs">
          <Zap className={cn('size-3.5', lowStock ? 'text-accent' : 'text-muted-foreground')} />
          <span className={cn(lowStock ? 'font-semibold text-accent' : 'text-muted-foreground')}>
            {lowStock ? `Últimas ${product.stock} unidades!` : `${product.stock} em estoque`}
          </span>
        </div>

        <Link href={`/produtos/${product.slug}`} className="mt-4">
          <Button className="w-full font-bold" aria-label={`Comprar ${product.name}`}>
            <ShoppingCart className="size-4" />
            Comprar agora
          </Button>
        </Link>
      </div>
    </motion.article>
  );
}

export function FeaturedProducts() {
  const [products, setProducts] = useState<ApiProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [active, setActive] = useState('Todos');
  const [categories, setCategories] = useState<string[]>(DEFAULT_CATEGORIES);

  useEffect(() => {
    const apiUrl = process.env.NEXT_PUBLIC_API_URL;
    if (!apiUrl) {
      setLoading(false);
      return;
    }

    Promise.all([
      fetch(`${apiUrl}/api/v1/products?limit=12&status=ACTIVE`)
        .then((r) => r.json())
        .then((d) => d.data ?? d ?? [])
        .catch(() => []),
      fetch(`${apiUrl}/api/v1/categories?showOnHome=true&limit=50`)
        .then((r) => r.json())
        .then((d) => (d.data ?? []).map((c: { name: string }) => c.name))
        .catch(() => []),
    ])
      .then(([prods, cats]) => {
        setProducts(prods as ApiProduct[]);
        if ((cats as string[]).length > 0) {
          setCategories(['Todos', ...(cats as string[])]);
        }
      })
      .finally(() => setLoading(false));
  }, []);

  const filtered =
    active === 'Todos' ? products : products.filter((p) => getCategoryName(p.category) === active);

  return (
    <section id="produtos" className="scroll-mt-24 border-b border-border bg-muted/30">
      <div className="mx-auto max-w-7xl px-4 py-16">
        <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-end">
          <div className="max-w-xl">
            <h2 className="text-balance font-heading text-3xl font-extrabold tracking-tight text-foreground sm:text-4xl">
              Ofertas em destaque
            </h2>
            <p className="mt-2 text-pretty text-muted-foreground">
              Selecionados a dedo com os maiores descontos do dia. Estoque limitado.
            </p>
          </div>
        </div>

        <div
          className="mt-6 flex flex-wrap gap-2"
          role="tablist"
          aria-label="Filtrar por categoria"
        >
          {categories.map((cat) => (
            <button
              key={cat}
              role="tab"
              aria-selected={active === cat}
              onClick={() => setActive(cat)}
              className={cn(
                'rounded-full border px-4 py-1.5 text-sm font-medium transition-colors',
                active === cat
                  ? 'border-secondary bg-secondary text-secondary-foreground'
                  : 'border-border bg-background text-muted-foreground hover:border-secondary hover:text-foreground',
              )}
            >
              {cat}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="mt-8 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <div
                key={i}
                className="h-80 animate-pulse rounded-2xl border border-border bg-muted"
              />
            ))}
          </div>
        ) : filtered.length > 0 ? (
          <div className="mt-8 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {filtered.map((product, i) => (
              <ProductCard key={product.id} product={product} index={i} />
            ))}
          </div>
        ) : (
          <div className="mt-8 py-12 text-center text-muted-foreground">
            Nenhum produto encontrado nesta categoria.
          </div>
        )}

        <div className="mt-10 text-center">
          <Link href="/produtos">
            <Button
              size="lg"
              variant="outline"
              className="border-secondary font-bold text-foreground"
            >
              Ver todos os produtos
            </Button>
          </Link>
        </div>
      </div>
    </section>
  );
}
