'use client';

import Image from 'next/image';
import Link from 'next/link';
import { Eye, Bookmark, Package } from 'lucide-react';
import type { Product } from '@/types/product';
import {
  hasDiscount,
  discountPercent,
  effectivePrice,
  formatBRL,
  deriveBadges,
  pseudoViews,
} from '@/lib/discovery';
import { ProductBadge } from '@/components/products/discovery/product-badge';
import { useSavedProducts } from '@/hooks/use-saved-products';
import { cn } from '@/lib/utils';

export function DiscoveryProductCard({
  product,
  priority = false,
}: {
  product: Product;
  priority?: boolean;
}) {
  const { isSaved, toggleSaved } = useSavedProducts();
  const saved = isSaved(product.id);

  const discounted = hasDiscount(product);
  const discount = discountPercent(product);
  const price = effectivePrice(product);
  const original = product.price;
  const views = pseudoViews(product);
  const badges = deriveBadges(product);
  const lowStock = product.stock <= 3;
  const category = product.category?.name ?? '';
  const image = product.images?.[0]?.url ?? '/placeholder.svg';

  return (
    <article className="group relative flex flex-col overflow-hidden rounded-2xl border border-border bg-card transition-all duration-200 hover:-translate-y-1 hover:shadow-lg hover:shadow-foreground/5">
      <Link href={`/produtos/${product.slug}`} className="relative block">
        <div className="relative aspect-square overflow-hidden bg-muted">
          <Image
            src={image}
            alt={product.name}
            fill
            sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
            priority={priority}
            className="object-cover transition-transform duration-300 group-hover:scale-105"
          />
          {/* Badges */}
          <div className="absolute left-2 top-2 flex flex-col items-start gap-1">
            {badges.map((b) => (
              <ProductBadge key={b} type={b} />
            ))}
          </div>
          {/* Desconto */}
          {discounted && (
            <span className="absolute bottom-2 left-2 rounded-full bg-accent px-2 py-1 text-xs font-bold text-accent-foreground shadow-sm">
              -{discount}%
            </span>
          )}
        </div>
      </Link>

      {/* Botão salvar */}
      <button
        type="button"
        onClick={() => toggleSaved(product)}
        aria-label={saved ? 'Remover dos salvos' : 'Salvar produto'}
        aria-pressed={saved}
        className="absolute right-2 top-2 z-10 flex size-9 items-center justify-center rounded-full border border-border bg-background/80 text-foreground shadow-sm backdrop-blur transition-colors hover:bg-background"
      >
        <Bookmark
          className={cn('size-4', saved && 'fill-primary text-primary')}
          aria-hidden="true"
        />
      </button>

      {/* Conteúdo */}
      <div className="flex flex-1 flex-col gap-2 p-3">
        <span className="text-[0.7rem] font-semibold uppercase tracking-wide text-muted-foreground">
          {category}
        </span>
        <Link
          href={`/produtos/${product.slug}`}
          className="line-clamp-2 text-sm font-semibold leading-snug text-card-foreground hover:underline"
        >
          {product.name}
        </Link>

        <div className="mt-auto flex flex-col gap-2 pt-1">
          <div className="flex items-baseline gap-2">
            <span className="text-lg font-bold text-card-foreground">{formatBRL(price)}</span>
            {discounted && (
              <span className="text-xs text-muted-foreground line-through">
                {formatBRL(original)}
              </span>
            )}
          </div>

          {/* Prova social / urgência */}
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[0.7rem] text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <Eye className="size-3" aria-hidden="true" />
              {views} hoje
            </span>
            <span
              className={cn(
                'inline-flex items-center gap-1 font-semibold',
                lowStock ? 'text-accent' : 'text-muted-foreground',
              )}
            >
              <Package className="size-3" aria-hidden="true" />
              {product.stock === 1 ? 'Última unidade!' : `${product.stock} restantes`}
            </span>
          </div>
        </div>
      </div>
    </article>
  );
}
