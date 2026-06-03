import Link from 'next/link';
import { getCategories } from '@/lib/api';

export default async function CategoriasPage() {
  const result = await getCategories().catch(() => ({
    data: [],
    total: 0,
    page: 1,
    limit: 100,
    totalPages: 0,
  }));

  return (
    <main className="mx-auto max-w-5xl px-4 py-8">
      <h1 className="mb-6 text-2xl font-bold tracking-tight">Categorias</h1>

      {result.data.length === 0 ? (
        <div className="flex h-48 items-center justify-center rounded-xl border border-dashed border-border">
          <p className="text-muted-foreground">Nenhuma categoria cadastrada.</p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
          {result.data.map((category) => (
            <Link
              key={category.id}
              href={`/produtos?categorySlug=${category.slug}`}
              className="group flex flex-col gap-1 rounded-xl border border-border bg-card p-5 shadow-sm transition-shadow hover:shadow-md"
            >
              <h2 className="font-semibold group-hover:text-primary">{category.name}</h2>
              {category.description && (
                <p className="line-clamp-2 text-sm text-muted-foreground">{category.description}</p>
              )}
              {category._count !== undefined && (
                <p className="mt-2 text-xs text-muted-foreground">
                  {category._count.products} produto{category._count.products !== 1 ? 's' : ''}
                </p>
              )}
            </Link>
          ))}
        </div>
      )}
    </main>
  );
}
