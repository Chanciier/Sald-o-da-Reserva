'use client';

import { useState } from 'react';
import { Check, Copy, Star } from 'lucide-react';
import type { CommunityGroup } from './types';

export const DEFAULT_CATEGORY = 'geral';

/** Caminho público do link de uma categoria: "geral" → /grupos. */
export function categoryPath(category: string): string {
  return category === DEFAULT_CATEGORY ? '/grupos' : `/grupos/${category}`;
}

/** "Sex Shop" / "sex shop!" → "sex-shop" (o formato aceito pela API). */
export function toCategorySlug(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+/, '');
}

export function categoryLabel(category: string): string {
  if (category === DEFAULT_CATEGORY) return 'Geral';
  return category
    .split('-')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

/**
 * Um link de divulgação por categoria. Cada link só distribui novos membros
 * entre os grupos da própria categoria.
 */
export function CategoryLinks({
  categories,
  groups,
  recommendedByCategory,
}: {
  categories: string[];
  groups: CommunityGroup[];
  recommendedByCategory: Record<string, string | null>;
}) {
  const [copied, setCopied] = useState<string | null>(null);

  async function copy(category: string) {
    const url = `${window.location.origin}${categoryPath(category)}`;
    await navigator.clipboard.writeText(url).catch(() => undefined);
    setCopied(category);
    setTimeout(() => setCopied(null), 2000);
  }

  return (
    <div className="rounded-xl border bg-white p-4">
      <p className="text-sm font-semibold">Links de divulgação</p>
      <p className="mb-3 text-xs text-gray-500">
        Cada link leva só para os grupos da própria categoria. Para criar uma categoria nova,
        escolha-a no cadastro do grupo.
      </p>
      <ul className="divide-y rounded-lg border">
        {categories.map((category) => {
          const inCategory = groups.filter((g) => g.category === category);
          const active = inCategory.filter((g) => g.active).length;
          const recommended = inCategory.find((g) => g.id === recommendedByCategory[category]);
          return (
            <li key={category} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2.5">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">
                  {categoryLabel(category)}{' '}
                  <span className="font-mono text-xs font-normal text-gray-500">
                    {categoryPath(category)}
                  </span>
                </p>
                <p className="text-xs text-gray-500">
                  {active} {active === 1 ? 'grupo ativo' : 'grupos ativos'}
                  {recommended ? (
                    <>
                      {' · '}
                      <Star className="inline h-3 w-3 text-emerald-600" /> próximo membro vai para{' '}
                      {recommended.name}
                    </>
                  ) : (
                    <span className="text-amber-600"> · sem grupo com vaga</span>
                  )}
                </p>
              </div>
              <button
                onClick={() => void copy(category)}
                className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium hover:bg-gray-50"
              >
                {copied === category ? (
                  <Check className="h-3.5 w-3.5 text-emerald-600" />
                ) : (
                  <Copy className="h-3.5 w-3.5" />
                )}
                {copied === category ? 'Copiado!' : 'Copiar link'}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
