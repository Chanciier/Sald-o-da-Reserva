import { Suspense } from 'react';
import { Flame, Zap, Dices, Eye, Hourglass } from 'lucide-react';
import { getProducts, getCategories } from '@/lib/api';
import { shuffleWithSeed, hasDiscount, discountPercent } from '@/lib/discovery';
import { CategorySearchBar } from '@/components/products/discovery/category-search-bar';
import { Hero } from '@/components/products/discovery/hero';
import { LiveActivity } from '@/components/products/discovery/live-activity';
import { ProductSection } from '@/components/products/discovery/product-section';
import { DiscoveryFeed } from '@/components/products/discovery/discovery-feed';
import { RandomButton } from '@/components/products/discovery/random-button';
import { DiscoveryProductCard } from '@/components/products/discovery/discovery-product-card';
import { Pagination } from '@/components/ui/pagination';
import type { ProductQuery } from '@/types/product';

interface PageProps {
  searchParams: Record<string, string | string[] | undefined>;
}

function param(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

export default async function ProdutosPage({ searchParams }: PageProps) {
  const search = param(searchParams.search);
  const categorySlug = param(searchParams.categorySlug);
  const isFiltered = !!(search || categorySlug);

  const [productsResult, categoriesResult] = await Promise.all([
    getProducts(
      isFiltered
        ? ({
            page: Number(param(searchParams.page) ?? 1),
            limit: 24,
            search,
            categorySlug,
            sortBy: param(searchParams.sortBy) as ProductQuery['sortBy'],
            sortOrder: param(searchParams.sortOrder) as ProductQuery['sortOrder'],
            status: 'ACTIVE',
          } satisfies ProductQuery)
        : { limit: 60, status: 'ACTIVE' },
    ).catch(() => ({ data: [], total: 0, page: 1, limit: 24, totalPages: 0 })),
    getCategories().catch(() => ({ data: [], total: 0, page: 1, limit: 100, totalPages: 0 })),
  ]);

  const products = productsResult.data;
  const categories = categoriesResult.data;
  const slugs = products.map((p) => p.slug);

  /* ── FILTERED MODE ─────────────────────────────────────────────────── */
  if (isFiltered) {
    const heading = search
      ? `Resultados para "${search}"`
      : (categories.find((c) => c.slug === categorySlug)?.name ?? categorySlug ?? 'Categoria');

    return (
      <main className="mx-auto max-w-7xl px-4 py-8">
        <Suspense>
          <CategorySearchBar
            categories={categories}
            activeSlug={categorySlug}
            defaultSearch={search}
          />
        </Suspense>

        <h1 className="mb-6 mt-6 text-2xl font-bold tracking-tight">{heading}</h1>

        {products.length === 0 ? (
          <div className="flex h-64 items-center justify-center rounded-xl border border-dashed border-border">
            <p className="text-muted-foreground">Nenhum produto encontrado.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {products.map((product) => (
              <DiscoveryProductCard key={product.id} product={product} />
            ))}
          </div>
        )}

        <div className="mt-8">
          <Suspense>
            <Pagination page={productsResult.page} totalPages={productsResult.totalPages} />
          </Suspense>
        </div>
      </main>
    );
  }

  /* ── DISCOVERY MODE ─────────────────────────────────────────────────── */
  const novos = products
    .slice()
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 8);

  const ofertas = products
    .filter(hasDiscount)
    .sort((a, b) => discountPercent(b) - discountPercent(a))
    .slice(0, 8);

  const ofertasFallback =
    ofertas.length > 0
      ? ofertas
      : products
          .slice()
          .sort((a, b) => a.price - b.price)
          .slice(0, 8);

  const aleatorios = shuffleWithSeed(products, 99).slice(0, 8);

  const visualizados = shuffleWithSeed(products, 7).slice(0, 8);

  const ultimas = products
    .filter((p) => p.stock > 0 && p.stock <= 4)
    .sort((a, b) => a.stock - b.stock);

  return (
    <main className="flex-1">
      <Suspense>
        <CategorySearchBar categories={categories} />
      </Suspense>

      <Hero slugs={slugs} />
      <LiveActivity products={products} />

      {novos.length > 0 && (
        <ProductSection
          title="Acabou de chegar"
          subtitle="Produtos recém-cadastrados no estoque"
          icon={<Flame className="size-5" aria-hidden="true" />}
          products={novos}
          priority
        />
      )}

      {ofertasFallback.length > 0 && (
        <ProductSection
          title="Oportunidades do dia"
          subtitle="O melhor custo-benefício de hoje"
          icon={<Zap className="size-5" aria-hidden="true" />}
          products={ofertasFallback}
        />
      )}

      <div className="mx-auto max-w-7xl px-4 py-2">
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-border bg-card px-6 py-8 text-center">
          <Dices className="size-8 text-accent" aria-hidden="true" />
          <h2 className="text-lg font-bold tracking-tight">Não sabe o que procurar?</h2>
          <p className="max-w-sm text-sm text-muted-foreground">
            Deixe a sorte escolher. A gente abre um achado aleatório do estoque pra você.
          </p>
          <RandomButton variant="hero" slugs={slugs} />
        </div>
      </div>

      {aleatorios.length > 0 && (
        <ProductSection
          title="Achados aleatórios"
          subtitle="Categorias misturadas, do jeito que a descoberta gosta"
          icon={<Dices className="size-5" aria-hidden="true" />}
          products={aleatorios}
        />
      )}

      {visualizados.length > 0 && (
        <ProductSection
          title="Pessoas estão vendo"
          subtitle="Os itens com mais movimentação agora"
          icon={<Eye className="size-5" aria-hidden="true" />}
          products={visualizados}
        />
      )}

      {ultimas.length > 0 && (
        <ProductSection
          title="Últimas unidades"
          subtitle="Estoque baixo — quem vê, leva"
          icon={<Hourglass className="size-5" aria-hidden="true" />}
          products={ultimas}
        />
      )}

      <div id="descobrir" className="scroll-mt-24" />

      <DiscoveryFeed
        initial={products.slice(0, 8)}
        initialPage={1}
        totalPages={productsResult.totalPages}
      />

      <RandomButton slugs={slugs} />
    </main>
  );
}
