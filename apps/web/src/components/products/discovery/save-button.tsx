'use client';

import { Bookmark } from 'lucide-react';
import type { Product } from '@/types/product';
import { useSavedProducts } from '@/hooks/use-saved-products';
import { cn } from '@/lib/utils';

export function SaveButton({ product }: { product: Product }) {
  const { isSaved, toggleSaved } = useSavedProducts();
  const saved = isSaved(product.id);

  return (
    <button
      type="button"
      onClick={() => toggleSaved(product)}
      aria-pressed={saved}
      className="flex w-full items-center justify-center gap-2 rounded-full border border-border bg-card px-6 py-3 text-sm font-semibold text-card-foreground transition-colors hover:bg-muted"
    >
      <Bookmark className={cn('size-4', saved && 'fill-primary text-primary')} aria-hidden="true" />
      {saved ? 'Salvo nos seus achados' : 'Salvar para depois'}
    </button>
  );
}
