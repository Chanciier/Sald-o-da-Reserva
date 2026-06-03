import { notFound } from 'next/navigation';
import Link from 'next/link';
import { getProduct } from '@/lib/api';
import { Badge } from '@/components/ui/badge';
import { AddToCartButton } from '@/components/products/add-to-cart-button';
import type { Metadata } from 'next';

interface PageProps {
  params: { slug: string };
}

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

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const product = await getProduct(params.slug).catch(() => null);
  if (!product) return { title: 'Produto não encontrado' };
  return {
    title: `${product.name} | Saldão da Reserva`,
    description: product.description ?? undefined,
  };
}

export default async function ProductPage({ params }: PageProps) {
  const product = await getProduct(params.slug).catch(() => null);
  if (!product) notFound();

  const status = statusLabel[product.status] ?? statusLabel.ACTIVE;
  const hasDiscount = product.salePrice !== null && product.salePrice < product.price;
  const discount = hasDiscount
    ? Math.round(((product.price - product.salePrice!) / product.price) * 100)
    : 0;

  return (
    <main className="mx-auto max-w-5xl px-4 py-8">
      <nav className="mb-6 flex items-center gap-2 text-sm text-muted-foreground">
        <Link href="/produtos" className="hover:text-foreground">
          Produtos
        </Link>
        {product.category && (
          <>
            <span>/</span>
            <Link
              href={`/produtos?categorySlug=${product.category.slug}`}
              className="hover:text-foreground"
            >
              {product.category.name}
            </Link>
          </>
        )}
        <span>/</span>
        <span className="text-foreground">{product.name}</span>
      </nav>

      <div className="grid gap-8 md:grid-cols-2">
        {product.images?.length > 0 ? (
          <div className="overflow-hidden rounded-xl border border-border bg-muted">
            <img
              src={product.images[0].url}
              alt={product.name}
              className="h-80 w-full object-contain"
            />
            {product.images.length > 1 && (
              <div className="flex gap-2 overflow-x-auto p-2">
                {product.images.slice(1).map((img) => (
                  <img
                    key={img.id}
                    src={img.url}
                    alt=""
                    className="h-16 w-16 shrink-0 rounded-lg object-cover opacity-70 hover:opacity-100"
                  />
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="flex h-80 items-center justify-center rounded-xl border border-dashed border-border bg-muted text-muted-foreground">
            Sem imagem
          </div>
        )}

        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap gap-2">
            <Badge variant={status.variant}>{status.label}</Badge>
            {hasDiscount && <Badge variant="destructive">-{discount}% OFF</Badge>}
            {product.category && <Badge variant="secondary">{product.category.name}</Badge>}
          </div>

          {product.brand && (
            <p className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
              {product.brand}
            </p>
          )}

          <h1 className="text-2xl font-bold leading-tight">{product.name}</h1>

          <div>
            {hasDiscount ? (
              <div className="flex items-baseline gap-3">
                <span className="text-3xl font-bold text-primary">
                  {formatPrice(product.salePrice!)}
                </span>
                <span className="text-lg text-muted-foreground line-through">
                  {formatPrice(product.price)}
                </span>
              </div>
            ) : (
              <span className="text-3xl font-bold">{formatPrice(product.price)}</span>
            )}
          </div>

          <div className="grid grid-cols-2 gap-2 rounded-lg border border-border p-3 text-sm">
            <div>
              <span className="text-muted-foreground">SKU</span>
              <p className="font-medium">{product.sku}</p>
            </div>
            <div>
              <span className="text-muted-foreground">Estoque</span>
              <p className="font-medium">{product.stock} unidades</p>
            </div>
            {product.weight && (
              <div>
                <span className="text-muted-foreground">Peso</span>
                <p className="font-medium">{product.weight} kg</p>
              </div>
            )}
            {product.dimensions && (
              <div>
                <span className="text-muted-foreground">Dimensões</span>
                <p className="font-medium">
                  {product.dimensions.width} × {product.dimensions.height} ×{' '}
                  {product.dimensions.depth} {product.dimensions.unit}
                </p>
              </div>
            )}
          </div>

          {product.description && (
            <div>
              <h2 className="mb-1 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                Descrição
              </h2>
              <p className="whitespace-pre-line text-sm leading-relaxed">{product.description}</p>
            </div>
          )}

          {product.status === 'ACTIVE' && (
            <AddToCartButton productId={product.id} stock={product.stock} />
          )}
        </div>
      </div>
    </main>
  );
}
