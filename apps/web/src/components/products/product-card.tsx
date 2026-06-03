import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import type { Product } from '@/types/product';

const statusLabel: Record<
  string,
  { label: string; variant: 'success' | 'warning' | 'destructive' }
> = {
  ACTIVE: { label: 'Disponível', variant: 'success' },
  OUT_OF_STOCK: { label: 'Sem estoque', variant: 'warning' },
  INACTIVE: { label: 'Inativo', variant: 'destructive' },
};

function formatPrice(value: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
}

function discountPercent(price: number, salePrice: number) {
  return Math.round(((price - salePrice) / price) * 100);
}

export function ProductCard({ product }: { product: Product }) {
  const status = statusLabel[product.status] ?? statusLabel.ACTIVE;
  const hasDiscount = product.salePrice !== null && product.salePrice < product.price;

  return (
    <Link
      href={`/produtos/${product.slug}`}
      className="group flex flex-col rounded-xl border border-border bg-card p-4 shadow-sm transition-shadow hover:shadow-md"
    >
      <div className="mb-3 flex items-start justify-between gap-2">
        <Badge variant={status.variant}>{status.label}</Badge>
        {hasDiscount && (
          <Badge variant="destructive">
            -{discountPercent(product.price, product.salePrice!)}%
          </Badge>
        )}
      </div>

      <div className="flex-1">
        {product.brand && (
          <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {product.brand}
          </p>
        )}
        <h3 className="line-clamp-2 text-sm font-semibold leading-snug text-foreground group-hover:text-primary">
          {product.name}
        </h3>
        <p className="mt-1 text-xs text-muted-foreground">SKU: {product.sku}</p>
      </div>

      <div className="mt-4 flex items-end justify-between">
        <div>
          {hasDiscount ? (
            <>
              <p className="text-xs text-muted-foreground line-through">
                {formatPrice(product.price)}
              </p>
              <p className="text-lg font-bold text-primary">{formatPrice(product.salePrice!)}</p>
            </>
          ) : (
            <p className="text-lg font-bold text-foreground">{formatPrice(product.price)}</p>
          )}
        </div>
        <p className="text-xs text-muted-foreground">{product.stock} em estoque</p>
      </div>
    </Link>
  );
}
