'use client';

import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { cn } from '@/lib/utils';

interface PaginationProps {
  page: number;
  totalPages: number;
}

export function Pagination({ page, totalPages }: PaginationProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  if (totalPages <= 1) return null;

  function go(p: number) {
    const params = new URLSearchParams(searchParams.toString());
    params.set('page', String(p));
    router.push(`${pathname}?${params.toString()}`);
  }

  const pages = Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
    if (totalPages <= 7) return i + 1;
    if (page <= 4) return i + 1;
    if (page >= totalPages - 3) return totalPages - 6 + i;
    return page - 3 + i;
  });

  return (
    <nav className="flex items-center justify-center gap-1">
      <button
        onClick={() => go(page - 1)}
        disabled={page === 1}
        className="rounded-md border border-border px-3 py-1.5 text-sm disabled:opacity-40 hover:bg-accent"
      >
        ‹
      </button>

      {pages[0] > 1 && (
        <>
          <button
            onClick={() => go(1)}
            className="rounded-md border border-border px-3 py-1.5 text-sm hover:bg-accent"
          >
            1
          </button>
          {pages[0] > 2 && <span className="px-1 text-muted-foreground">…</span>}
        </>
      )}

      {pages.map((p) => (
        <button
          key={p}
          onClick={() => go(p)}
          className={cn(
            'rounded-md border px-3 py-1.5 text-sm',
            p === page
              ? 'border-primary bg-primary text-primary-foreground'
              : 'border-border hover:bg-accent',
          )}
        >
          {p}
        </button>
      ))}

      {pages[pages.length - 1] < totalPages && (
        <>
          {pages[pages.length - 1] < totalPages - 1 && (
            <span className="px-1 text-muted-foreground">…</span>
          )}
          <button
            onClick={() => go(totalPages)}
            className="rounded-md border border-border px-3 py-1.5 text-sm hover:bg-accent"
          >
            {totalPages}
          </button>
        </>
      )}

      <button
        onClick={() => go(page + 1)}
        disabled={page === totalPages}
        className="rounded-md border border-border px-3 py-1.5 text-sm disabled:opacity-40 hover:bg-accent"
      >
        ›
      </button>
    </nav>
  );
}
