'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Sparkles, Loader2 } from 'lucide-react';
import type { Product } from '@/types/product';
import { clientGetProducts } from '@/lib/discovery';
import { DiscoveryProductCard } from '@/components/products/discovery/discovery-product-card';

export function DiscoveryFeed({
  initial,
  initialPage,
  totalPages,
}: {
  initial: Product[];
  initialPage: number;
  totalPages: number;
}) {
  const [items, setItems] = useState<Product[]>(initial);
  const [page, setPage] = useState(initialPage);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(initialPage >= totalPages);
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  const loadMore = useCallback(async () => {
    const nextPage = page + 1;
    if (nextPage > totalPages) {
      setDone(true);
      return;
    }
    setLoading(true);
    try {
      const res = await clientGetProducts({
        page: nextPage,
        limit: 8,
        status: 'ACTIVE',
      });
      setItems((prev) => [...prev, ...res.data]);
      setPage(nextPage);
      if (nextPage >= res.totalPages) setDone(true);
    } catch {
      setDone(true);
    } finally {
      setLoading(false);
    }
  }, [page, totalPages]);

  useEffect(() => {
    const node = sentinelRef.current;
    if (!node || done) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && !loading) {
          void loadMore();
        }
      },
      { rootMargin: '400px' },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [loadMore, loading, done]);

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

      <div ref={sentinelRef} className="flex h-20 items-center justify-center" aria-hidden="true">
        {loading && (
          <span className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
            Garimpando mais achados...
          </span>
        )}
      </div>
    </section>
  );
}
