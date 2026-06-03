'use client';

import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { useCallback } from 'react';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import type { Category } from '@/types/product';

interface ProductFiltersProps {
  categories: Category[];
}

export function ProductFilters({ categories }: ProductFiltersProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const update = useCallback(
    (key: string, value: string) => {
      const params = new URLSearchParams(searchParams.toString());
      if (value) {
        params.set(key, value);
      } else {
        params.delete(key);
      }
      params.delete('page');
      router.push(`${pathname}?${params.toString()}`);
    },
    [router, pathname, searchParams],
  );

  return (
    <aside className="flex flex-col gap-4">
      <div>
        <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Busca
        </label>
        <Input
          placeholder="Nome, SKU, marca..."
          defaultValue={searchParams.get('search') ?? ''}
          onChange={(e) => update('search', e.target.value)}
        />
      </div>

      <div>
        <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Categoria
        </label>
        <Select
          value={searchParams.get('categorySlug') ?? ''}
          onChange={(e) => update('categorySlug', e.target.value)}
        >
          <option value="">Todas</option>
          {categories.map((c) => (
            <option key={c.id} value={c.slug}>
              {c.name}
            </option>
          ))}
        </Select>
      </div>

      <div>
        <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Preço
        </label>
        <div className="flex gap-2">
          <Input
            type="number"
            placeholder="Mín."
            min={0}
            defaultValue={searchParams.get('minPrice') ?? ''}
            onChange={(e) => update('minPrice', e.target.value)}
          />
          <Input
            type="number"
            placeholder="Máx."
            min={0}
            defaultValue={searchParams.get('maxPrice') ?? ''}
            onChange={(e) => update('maxPrice', e.target.value)}
          />
        </div>
      </div>

      <div>
        <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Disponibilidade
        </label>
        <Select
          value={searchParams.get('inStock') ?? ''}
          onChange={(e) => update('inStock', e.target.value)}
        >
          <option value="">Todos</option>
          <option value="true">Em estoque</option>
        </Select>
      </div>

      <div>
        <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Status
        </label>
        <Select
          value={searchParams.get('status') ?? ''}
          onChange={(e) => update('status', e.target.value)}
        >
          <option value="">Todos</option>
          <option value="ACTIVE">Disponível</option>
          <option value="OUT_OF_STOCK">Sem estoque</option>
          <option value="INACTIVE">Inativo</option>
        </Select>
      </div>

      <div>
        <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Ordenar por
        </label>
        <Select
          value={`${searchParams.get('sortBy') ?? 'createdAt'}:${searchParams.get('sortOrder') ?? 'desc'}`}
          onChange={(e) => {
            const [sortBy, sortOrder] = e.target.value.split(':');
            const params = new URLSearchParams(searchParams.toString());
            params.set('sortBy', sortBy);
            params.set('sortOrder', sortOrder);
            params.delete('page');
            router.push(`${pathname}?${params.toString()}`);
          }}
        >
          <option value="createdAt:desc">Mais recentes</option>
          <option value="createdAt:asc">Mais antigos</option>
          <option value="price:asc">Menor preço</option>
          <option value="price:desc">Maior preço</option>
          <option value="name:asc">Nome A-Z</option>
          <option value="name:desc">Nome Z-A</option>
          <option value="stock:desc">Mais em estoque</option>
        </Select>
      </div>
    </aside>
  );
}
