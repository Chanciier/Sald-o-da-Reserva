'use client';

import Link from 'next/link';
import { ArrowLeft, Bookmark } from 'lucide-react';
import { useSavedProducts } from '@/hooks/use-saved-products';
import { DiscoveryProductCard } from '@/components/products/discovery/discovery-product-card';

export default function SalvosPage() {
  const { savedProducts } = useSavedProducts();

  // Mais recém-salvos primeiro.
  const items = [...savedProducts].reverse();

  return (
    <main className="flex-1">
      <div className="mx-auto max-w-7xl px-4 py-8">
        <Link
          href="/produtos"
          className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="size-4" aria-hidden="true" />
          Voltar para produtos
        </Link>

        <div className="mb-6 flex items-center gap-2.5">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground">
            <Bookmark className="size-5" aria-hidden="true" />
          </span>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Salvos</h1>
            <p className="text-sm text-muted-foreground">
              {items.length > 0
                ? `${items.length} ${items.length === 1 ? 'item guardado' : 'itens guardados'}`
                : 'Seus achados guardados ficam aqui'}
            </p>
          </div>
        </div>

        {items.length === 0 ? (
          <div className="flex h-64 flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border text-center">
            <Bookmark className="size-8 text-muted-foreground" aria-hidden="true" />
            <p className="text-muted-foreground">Você ainda não salvou nenhum produto.</p>
            <Link
              href="/produtos"
              className="rounded-full bg-accent px-4 py-2 text-sm font-semibold text-accent-foreground transition-colors hover:bg-accent/90"
            >
              Explorar produtos
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">
            {items.map((p) => (
              <DiscoveryProductCard key={p.id} product={p} />
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
