'use client';

import { useState } from 'react';
import { SlidersHorizontal, ChevronLeft, ChevronRight } from 'lucide-react';

interface Props {
  sidebar: React.ReactNode;
  children: React.ReactNode;
}

export function FilterableProductLayout({ sidebar, children }: Props) {
  const [open, setOpen] = useState(true);

  return (
    <div className="flex gap-6">
      {open ? (
        <aside className="w-56 shrink-0">
          <div className="mb-4 flex items-center justify-between">
            <span className="flex items-center gap-1.5 text-sm font-bold uppercase tracking-wide text-foreground">
              <SlidersHorizontal className="size-4" />
              Filtros
            </span>
            <button
              onClick={() => setOpen(false)}
              aria-label="Recolher filtros"
              className="rounded p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <ChevronLeft className="size-4" />
            </button>
          </div>
          {sidebar}
        </aside>
      ) : (
        <div className="shrink-0">
          <button
            onClick={() => setOpen(true)}
            aria-label="Expandir filtros"
            className="flex flex-col items-center gap-2 rounded-lg border border-border px-2 py-3 text-muted-foreground transition-colors hover:border-foreground hover:text-foreground"
          >
            <SlidersHorizontal className="size-4" />
            <ChevronRight className="size-3" />
          </button>
        </div>
      )}

      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
