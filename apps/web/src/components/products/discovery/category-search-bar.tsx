'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Search, Menu, X } from 'lucide-react';
import type { Category } from '@/types/product';
import { cn } from '@/lib/utils';

export function CategorySearchBar({
  categories,
  activeSlug,
  defaultSearch = '',
}: {
  categories: Category[];
  activeSlug?: string;
  defaultSearch?: string;
}) {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div className="border-b border-border bg-background/85 backdrop-blur-lg">
      <div className="mx-auto flex max-w-7xl items-center gap-3 px-4 py-3 sm:gap-4">
        {/* Busca */}
        <form
          action="/produtos"
          method="get"
          className="flex flex-1 items-center gap-2 rounded-full border border-border bg-muted px-4 py-2 text-sm"
        >
          <Search className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          <input
            type="search"
            name="search"
            defaultValue={defaultSearch}
            placeholder="Buscar achados, marcas, categorias..."
            aria-label="Buscar produtos"
            className="w-full bg-transparent text-foreground outline-none placeholder:text-muted-foreground"
          />
        </form>

        {/* Toggle de categorias (mobile) */}
        <button
          type="button"
          onClick={() => setMenuOpen((o) => !o)}
          aria-label="Abrir menu de categorias"
          aria-expanded={menuOpen}
          className="flex size-10 shrink-0 items-center justify-center rounded-full text-foreground transition-colors hover:bg-muted md:hidden"
        >
          {menuOpen ? <X className="size-5" /> : <Menu className="size-5" />}
        </button>
      </div>

      {/* Navegação de categorias */}
      <nav
        className={cn('border-t border-border md:block', menuOpen ? 'block' : 'hidden')}
        aria-label="Categorias"
      >
        <ul className="mx-auto flex max-w-7xl flex-col gap-1 px-4 py-2 text-sm font-medium md:flex-row md:items-center md:gap-6 md:overflow-x-auto">
          <li>
            <Link
              href="/produtos"
              onClick={() => setMenuOpen(false)}
              className={cn(
                'block whitespace-nowrap rounded-lg px-2 py-1.5 transition-colors hover:bg-muted hover:text-foreground',
                !activeSlug ? 'font-bold text-foreground' : 'text-muted-foreground',
              )}
            >
              Todos
            </Link>
          </li>
          {categories.map((c) => (
            <li key={c.id}>
              <Link
                href={`/produtos?categorySlug=${c.slug}`}
                onClick={() => setMenuOpen(false)}
                className={cn(
                  'block whitespace-nowrap rounded-lg px-2 py-1.5 transition-colors hover:bg-muted hover:text-foreground',
                  activeSlug === c.slug ? 'font-bold text-foreground' : 'text-muted-foreground',
                )}
              >
                {c.name}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
}
