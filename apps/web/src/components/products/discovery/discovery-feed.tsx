'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Sparkles } from 'lucide-react';
import type { Product } from '@/types/product';
import { shuffleWithSeed } from '@/lib/discovery';
import { DiscoveryProductCard } from '@/components/products/discovery/discovery-product-card';

const BATCH = 8;
const MARGIN = 600;

// Ordem de uma rodada: o catálogo inteiro embaralhado com seed própria.
// Na primeira rodada, produtos que ainda não apareceram nas seções acima
// vêm antes dos que o visitante já viu.
function epochOrder(all: Product[], epoch: number, shownIds?: Set<string>): Product[] {
  if (epoch === 1 && shownIds && shownIds.size > 0 && shownIds.size < all.length) {
    const unseen = all.filter((p) => !shownIds.has(p.id));
    const seen = all.filter((p) => shownIds.has(p.id));
    return [...shuffleWithSeed(unseen, 38), ...shuffleWithSeed(seen, 45)];
  }
  return shuffleWithSeed(all, epoch * 31 + 7);
}

interface Queue {
  epoch: number;
  index: number;
  order: Product[];
  lastId: string | null;
}

export function DiscoveryFeed({
  allProducts,
  shownIds,
}: {
  allProducts: Product[];
  shownIds?: string[];
}) {
  // Fila por rodadas: cada rodada percorre o catálogo inteiro embaralhado,
  // então nenhum produto repete antes de todos os outros aparecerem.
  const queueRef = useRef<Queue | null>(null);
  const [items, setItems] = useState<Product[]>(() =>
    epochOrder(allProducts, 1, new Set(shownIds)).slice(0, BATCH),
  );
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  const loadMore = useCallback(() => {
    if (allProducts.length === 0) return;

    let q = queueRef.current;
    if (!q) {
      const order = epochOrder(allProducts, 1, new Set(shownIds));
      const index = Math.min(BATCH, order.length);
      q = queueRef.current = { epoch: 1, index, order, lastId: order[index - 1]?.id ?? null };
    }

    const batch: Product[] = [];
    while (batch.length < BATCH) {
      if (q.index >= q.order.length) {
        q.epoch += 1;
        q.index = 0;
        q.order = epochOrder(allProducts, q.epoch);
        // Evita o mesmo produto duas vezes seguidas na virada da rodada.
        if (q.order.length > 1 && q.order[0].id === q.lastId) {
          [q.order[0], q.order[1]] = [q.order[1], q.order[0]];
        }
      }
      const product = q.order[q.index];
      q.index += 1;
      q.lastId = product.id;
      batch.push(product);
    }
    setItems((prev) => [...prev, ...batch]);
  }, [allProducts, shownIds]);

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
