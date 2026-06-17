'use client';

import Link from 'next/link';
import type { Category } from '@/types/product';
import { cn } from '@/lib/utils';

/**
 * Faixa de categorias (vindas do painel admin) com rolagem horizontal
 * quando não couberem na largura. A busca fica no header global.
 */
export function CategoryNav({
  categories,
  activeSlug,
}: {
  categories: Category[];
  activeSlug?: string;
}) {
  if (categories.length === 0) return null;

  const chip =
    'block shrink-0 whitespace-nowrap rounded-full border px-3 py-1.5 text-sm font-medium transition-colors';

  return (
    <nav
      aria-label="Categorias"
      className="border-b border-border bg-background/85 backdrop-blur-lg"
    >
      <ul className="mx-auto flex max-w-7xl items-center gap-2 overflow-x-auto px-4 py-2.5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <li className="shrink-0">
          <Link
            href="/produtos"
            className={cn(
              chip,
              !activeSlug
                ? 'border-accent bg-accent text-accent-foreground'
                : 'border-border text-muted-foreground hover:bg-muted hover:text-foreground',
            )}
          >
            Todos
          </Link>
        </li>
        {categories.map((c) => (
          <li key={c.id} className="shrink-0">
            <Link
              href={`/produtos?categorySlug=${c.slug}`}
              className={cn(
                chip,
                activeSlug === c.slug
                  ? 'border-accent bg-accent text-accent-foreground'
                  : 'border-border text-muted-foreground hover:bg-muted hover:text-foreground',
              )}
            >
              {c.name}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
