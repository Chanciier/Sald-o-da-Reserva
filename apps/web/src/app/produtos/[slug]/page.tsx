import { notFound } from 'next/navigation';
import Link from 'next/link';
import { ChevronLeft, Eye, Bookmark, Package, ShieldCheck, Truck, Zap, Dices } from 'lucide-react';
import type { Metadata } from 'next';

import { getProduct, getProducts } from '@/lib/api';
import {
  effectivePrice,
  hasDiscount,
  discountPercent,
  deriveBadges,
  pseudoViews,
  pseudoSaves,
  formatBRL,
  shuffleWithSeed,
} from '@/lib/discovery';

import { ProductImages } from '@/components/products/product-images';
import { AddToCartButton } from '@/components/products/add-to-cart-button';
import { ProductReviews } from '@/components/products/product-reviews';
import { ShareButton } from '@/components/products/share-button';
import { ProductBadge } from '@/components/products/discovery/product-badge';
import { ProductSection } from '@/components/products/discovery/product-section';
import { SaveButton } from '@/components/products/discovery/save-button';

interface PageProps {
  params: { slug: string };
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

  // Related products — one broad fetch, two slices
  const broadResult = await getProducts({ limit: 24 }).catch(() => ({ data: [] }));
  const broadList = broadResult.data.filter((p) => p.id !== product.id);

  const semelhantes = product.category?.slug
    ? broadList.filter((p) => p.category?.slug === product.category!.slug).slice(0, 8)
    : [];

  const tambemGosta = shuffleWithSeed(broadList, parseInt(product.id, 16) || 0).slice(0, 8);

  const price = effectivePrice(product);
  const discounted = hasDiscount(product);
  const discount = discountPercent(product);
  const economia = discounted ? product.price - price : 0;
  const badges = deriveBadges(product);
  const views = pseudoViews(product);
  const saves = pseudoSaves(product);
  const lowStock = product.stock <= 3;

  return (
    <main className="mx-auto max-w-7xl px-4 py-4">
      {/* Back link */}
      <div className="mb-6">
        <Link
          href="/produtos"
          className="inline-flex items-center gap-1 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          <ChevronLeft className="size-4" aria-hidden="true" />
          Voltar para os produtos
        </Link>
      </div>

      {/* Two-column grid */}
      <div className="grid gap-6 pb-8 md:grid-cols-2 md:gap-10">
        {/* Image gallery */}
        <div className="relative overflow-hidden rounded-2xl border border-border bg-muted">
          <div className="absolute left-3 top-3 z-10 flex flex-col items-start gap-1.5">
            {badges.map((b) => (
              <ProductBadge key={b} type={b} />
            ))}
          </div>
          {discounted && (
            <span className="absolute bottom-3 left-3 z-10 rounded-full bg-accent px-3 py-1.5 text-sm font-bold text-accent-foreground shadow-sm">
              -{discount}%
            </span>
          )}
          <ProductImages images={product.images ?? []} name={product.name} />
        </div>

        {/* Details column */}
        <div className="flex flex-col gap-5">
          {/* Category + title */}
          <div>
            {product.category && (
              <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {product.category.name}
              </span>
            )}
            <div className="mt-1 flex items-start justify-between gap-3">
              <h1 className="text-balance text-2xl font-extrabold leading-tight tracking-tight sm:text-3xl">
                {product.name}
              </h1>
              <ShareButton title={product.name} text={product.shortDescription} />
            </div>
          </div>

          {/* Social proof */}
          <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
            <span className="inline-flex items-center gap-1.5">
              <Eye className="size-4 text-accent" aria-hidden="true" />
              {views} pessoas viram
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Bookmark className="size-4 text-accent" aria-hidden="true" />
              {saves} salvaram
            </span>
          </div>

          {/* Price card */}
          <div className="rounded-2xl border border-border bg-card p-5">
            <div className="flex flex-wrap items-end gap-3">
              <span className="text-3xl font-extrabold text-card-foreground sm:text-4xl">
                {formatBRL(price)}
              </span>
              {discounted && (
                <span className="pb-1 text-base text-muted-foreground line-through">
                  {formatBRL(product.price)}
                </span>
              )}
            </div>
            {discounted && (
              <p className="mt-1 text-sm font-semibold text-accent">
                Você economiza {formatBRL(economia)} ({discount}% off)
              </p>
            )}

            {/* Stock urgency */}
            <div className="mt-4 flex items-center gap-2 rounded-xl bg-muted px-3 py-2.5 text-sm font-medium">
              <Package
                className={lowStock ? 'size-4 text-accent' : 'size-4 text-foreground'}
                aria-hidden="true"
              />
              {product.stock === 1 ? (
                <span className="text-accent">Última unidade disponível!</span>
              ) : lowStock ? (
                <span className="text-accent">Apenas {product.stock} unidades restantes</span>
              ) : (
                <span>{product.stock} unidades disponíveis</span>
              )}
            </div>
          </div>

          {/* CTAs */}
          {product.status === 'ACTIVE' && (
            <AddToCartButton productId={product.id} stock={product.stock} />
          )}
          <SaveButton product={product} />

          {/* Short description */}
          {product.shortDescription && (
            <p className="text-sm leading-relaxed text-muted-foreground">
              {product.shortDescription}
            </p>
          )}

          {/* Guarantees */}
          <div className="grid grid-cols-2 gap-3 border-t border-border pt-4 text-sm">
            <span className="inline-flex items-center gap-2 text-muted-foreground">
              <ShieldCheck className="size-4 text-foreground" aria-hidden="true" />
              Compra segura / NF-e
            </span>
            <span className="inline-flex items-center gap-2 text-muted-foreground">
              <Truck className="size-4 text-foreground" aria-hidden="true" />
              Entrega para todo o Brasil
            </span>
          </div>
        </div>
      </div>

      {/* Full description */}
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

      {/* Related sections */}
      {semelhantes.length > 0 && (
        <ProductSection
          title="Produtos semelhantes"
          subtitle={`Mais achados em ${product.category?.name ?? 'outras categorias'}`}
          icon={<Zap className="size-5" aria-hidden="true" />}
          products={semelhantes}
        />
      )}
      {tambemGosta.length > 0 && (
        <ProductSection
          title="Você também pode gostar"
          subtitle="Misturamos categorias pra te surpreender"
          icon={<Dices className="size-5" aria-hidden="true" />}
          products={tambemGosta}
        />
      )}
    </main>
  );
}
