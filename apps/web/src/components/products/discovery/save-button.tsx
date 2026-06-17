'use client';

import { Bookmark } from 'lucide-react';
import { useSavedProducts } from '@/hooks/use-saved-products';
import { cn } from '@/lib/utils';

export function SaveButton({ id }: { id: string }) {
  const { isSaved, toggleSaved } = useSavedProducts();
  const saved = isSaved(id);

  return (
    <button
      type="button"
      onClick={() => toggleSaved(id)}
      aria-pressed={saved}
      className="flex w-full items-center justify-center gap-2 rounded-full border border-border bg-card px-6 py-3 text-sm font-semibold text-card-foreground transition-colors hover:bg-muted"
    >
      <Bookmark className={cn('size-4', saved && 'fill-primary text-primary')} aria-hidden="true" />
      {saved ? 'Salvo nos seus achados' : 'Salvar para depois'}
    </button>
  );
}
