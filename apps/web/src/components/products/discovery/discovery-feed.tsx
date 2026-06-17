'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Sparkles } from 'lucide-react';
import type { Product } from '@/types/product';
import { shuffleWithSeed } from '@/lib/discovery';
import { DiscoveryProductCard } from '@/components/products/discovery/discovery-product-card';

const BATCH = 8;
const MARGIN = 600;

function nextBatch(all: Product[], cycle: number): Product[] {
  return shuffleWithSeed(all, cycle * 31 + 7).slice(0, BATCH);
}

export function DiscoveryFeed({ allProducts }: { allProducts: Product[] }) {
  const cycleRef = useRef(1);
  const [items, setItems] = useState<Product[]>(() => allProducts.slice(0, BATCH));
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  const loadMore = useCallback(() => {
    if (allProducts.length === 0) return;
    const batch = nextBatch(allProducts, cycleRef.current);
    cycleRef.current += 1;
    setItems((prev) => [...prev, ...batch]);
  }, [allProducts]);

  // Gatilho por rolagem: quando o sentinel entra na zona de MARGIN, carrega.
  useEffect(() => {
    const node = sentinelRef.current;
    if (!node || allProducts.length === 0) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) loadMore();
      },
      { rootMargin: `${MARGIN}px` },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [loadMore, allProducts.length]);

  // Preenchimento contínuo: após cada lote, se o sentinel ainda estiver na zona
  // (tela alta, rolagem rápida ou conteúdo curto), agenda outro lote no próximo
  // frame. Isso garante que o footer nunca seja alcançado enquanto há produtos.
  useEffect(() => {
    const node = sentinelRef.current;
    if (!node || allProducts.length === 0) return;
    const rect = node.getBoundingClientRect();
    if (rect.top <= window.innerHeight + MARGIN) {
      const id = requestAnimationFrame(() => loadMore());
      return () => cancelAnimationFrame(id);
    }
  }, [items.length, loadMore, allProducts.length]);

  if (allProducts.length === 0) return null;

  return (
    <section className="mx-auto max-w-7xl px-4 py-6">
      <div className="mb-4 flex items-center gap-2.5">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground">
          <Sparkles className="size-5" aria-hidden="true" />
        </span>
        <div>
          <h2 className="text-lg font-bold leading-tight tracking-tight sm:text-xl">
            Continue descobrindo
          </h2>
          <p className="text-xs text-muted-foreground">
            Um fluxo sem fim de oportunidades misturadas
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">
        {items.map((p, i) => (
          <DiscoveryProductCard key={`${p.id}-${i}`} product={p} />
        ))}
      </div>

      <div ref={sentinelRef} className="h-20" aria-hidden="true" />
    </section>
  );
}
