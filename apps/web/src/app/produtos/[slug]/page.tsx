import { notFound } from 'next/navigation';
import Link from 'next/link';
import { getProduct } from '@/lib/api';
import { Badge } from '@/components/ui/badge';
import { AddToCartButton } from '@/components/products/add-to-cart-button';
import { ProductImages } from '@/components/products/product-images';
import { ProductReviews } from '@/components/products/product-reviews';
import { ShareButton } from '@/components/products/share-button';
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

  const description =
    product.shortDescription ??
    product.description?.replace(/<[^>]+>/g, '').slice(0, 160) ??
    undefined;
  const image = product.images?.[0]?.url;

  return {
    title: product.name,
    description,
    openGraph: {
      title: product.name,
      description,
      type: 'website',
      url: `/produtos/${params.slug}`,
      ...(image && { images: [{ url: image, alt: product.name }] }),
    },
    twitter: {
      card: image ? 'summary_large_image' : 'summary',
      title: product.name,
      description,
      ...(image && { images: [image] }),
    },
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
      {/* Breadcrumb */}
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

      {/* Main grid: image + info */}
      <div className="grid gap-8 md:grid-cols-2">
        <ProductImages images={product.images ?? []} name={product.name} />

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

          <div className="flex items-start justify-between gap-3">
            <h1 className="text-2xl font-bold leading-tight">{product.name}</h1>
            <ShareButton title={product.name} text={product.shortDescription} />
          </div>

          {/* Price */}
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

          {/* Short description */}
          {product.shortDescription && (
            <p className="text-sm leading-relaxed text-muted-foreground">
              {product.shortDescription}
            </p>
          )}

          {/* Details table */}
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

          {product.status === 'ACTIVE' && (
            <AddToCartButton productId={product.id} stock={product.stock} />
          )}
        </div>
      </div>

      {/* Full description — below the grid */}
      {product.description && (
        <section className="mt-10 border-t border-border pt-8">
          <h2 className="mb-4 text-lg font-semibold">Descrição completa</h2>
          <div
            className="prose prose-sm max-w-none text-foreground/80
              [&_h2]:mt-6 [&_h2]:mb-2 [&_h2]:text-base [&_h2]:font-semibold [&_h2]:text-foreground
              [&_h3]:mt-4 [&_h3]:mb-1 [&_h3]:font-medium [&_h3]:text-foreground
              [&_p]:mb-3 [&_p]:leading-relaxed
              [&_ul]:mb-3 [&_ul]:list-disc [&_ul]:pl-5
              [&_ol]:mb-3 [&_ol]:list-decimal [&_ol]:pl-5
              [&_li]:mb-1 [&_strong]:font-semibold [&_em]:italic"
            dangerouslySetInnerHTML={{ __html: product.description }}
          />
        </section>
      )}

      {/* Reviews */}
      <ProductReviews productId={product.id} />
    </main>
  );
}
