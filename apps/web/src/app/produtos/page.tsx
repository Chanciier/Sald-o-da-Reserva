import { Suspense } from 'react';
import { getProducts, getCategories } from '@/lib/api';
import { ProductCard } from '@/components/products/product-card';
import { ProductFilters } from '@/components/products/product-filters';
import { FilterableProductLayout } from '@/components/products/filterable-product-layout';
import { Pagination } from '@/components/ui/pagination';
import type { ProductQuery } from '@/types/product';

interface PageProps {
  searchParams: Record<string, string | string[] | undefined>;
}

function param(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

export default async function ProdutosPage({ searchParams }: PageProps) {
  const query: ProductQuery = {
    page: Number(param(searchParams.page) ?? 1),
    limit: 24,
    search: param(searchParams.search),
    categorySlug: param(searchParams.categorySlug),
    status: param(searchParams.status) as ProductQuery['status'],
    minPrice: searchParams.minPrice ? Number(searchParams.minPrice) : undefined,
    maxPrice: searchParams.maxPrice ? Number(searchParams.maxPrice) : undefined,
    brand: param(searchParams.brand),
    inStock: searchParams.inStock === 'true' ? true : undefined,
    sortBy: param(searchParams.sortBy) as ProductQuery['sortBy'],
    sortOrder: param(searchParams.sortOrder) as ProductQuery['sortOrder'],
  };

  const [productsResult, categoriesResult] = await Promise.all([
    getProducts(query).catch(() => ({ data: [], total: 0, page: 1, limit: 24, totalPages: 0 })),
    getCategories().catch(() => ({ data: [], total: 0, page: 1, limit: 100, totalPages: 0 })),
  ]);

  return (
    <main className="mx-auto max-w-7xl px-4 py-8">
      <h1 className="mb-6 text-2xl font-bold tracking-tight">Produtos</h1>

      <FilterableProductLayout
        sidebar={
          <Suspense>
            <ProductFilters categories={categoriesResult.data} />
          </Suspense>
        }
      >
        <div className="mb-4 flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            {productsResult.total} produto{productsResult.total !== 1 ? 's' : ''} encontrado
            {productsResult.total !== 1 ? 's' : ''}
          </p>
        </div>

        {productsResult.data.length === 0 ? (
          <div className="flex h-64 items-center justify-center rounded-xl border border-dashed border-border">
            <p className="text-muted-foreground">Nenhum produto encontrado.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {productsResult.data.map((product) => (
              <ProductCard key={product.id} product={product} />
            ))}
          </div>
        )}

        <div className="mt-8">
          <Suspense>
            <Pagination page={productsResult.page} totalPages={productsResult.totalPages} />
          </Suspense>
        </div>
      </FilterableProductLayout>
    </main>
  );
}
