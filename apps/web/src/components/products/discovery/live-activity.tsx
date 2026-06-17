import { Eye } from 'lucide-react';
import type { Product } from '@/types/product';

export function LiveActivity({ products }: { products: Product[] }) {
  if (!products.length) return null;

  // Safely pick a product by index, wrapping around when the list is short.
  const at = (i: number) => products[i % products.length];

  const items = [
    `12 pessoas estão vendo ${at(5).name} agora`,
    `${at(1).name} — só restam ${at(1).stock} unidades`,
    `3 pessoas salvaram ${at(9).name} nos últimos minutos`,
    `${at(2).name} acabou de baixar de preço`,
    `8 pessoas visualizaram ${at(11).name} hoje`,
    `${at(0).name} chegou ao estoque há instantes`,
  ];
  const loop = [...items, ...items];

  return (
    <div className="overflow-hidden border-y border-border bg-card py-2.5">
      <div className="flex w-max animate-marquee items-center gap-8">
        {loop.map((text, i) => (
          <span
            key={i}
            className="flex shrink-0 items-center gap-2 text-xs font-medium text-muted-foreground"
          >
            <Eye className="size-3.5 text-accent" aria-hidden="true" />
            {text}
          </span>
        ))}
      </div>
    </div>
  );
}
