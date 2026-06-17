'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { Product } from '@/types/product';
import { DiscoveryProductCard } from '@/components/products/discovery/discovery-product-card';

const DEFAULT_CATEGORIES = ['Todos'];

export function FeaturedProducts() {
  const [products, setProducts] = useState<Product[]>([]);
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
        setProducts(prods as Product[]);
        if ((cats as string[]).length > 0) {
          setCategories(['Todos', ...(cats as string[])]);
        }
      })
      .finally(() => setLoading(false));
  }, []);

  const filtered =
    active === 'Todos' ? products : products.filter((p) => (p.category?.name ?? '') === active);

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
          <div className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <div
                key={i}
                className="h-80 animate-pulse rounded-2xl border border-border bg-muted"
              />
            ))}
          </div>
        ) : filtered.length > 0 ? (
          <div className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {filtered.map((product, i) => (
              <DiscoveryProductCard key={product.id} product={product} priority={i < 4} />
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
