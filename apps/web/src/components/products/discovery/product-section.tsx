import type { Product } from '@/types/product';
import { DiscoveryProductCard } from '@/components/products/discovery/discovery-product-card';

export function ProductSection({
  title,
  subtitle,
  icon,
  products,
  priority = false,
}: {
  title: string;
  subtitle: string;
  icon: React.ReactNode;
  products: Product[];
  priority?: boolean;
}) {
  return (
    <section className="mx-auto max-w-7xl px-4 py-6">
      <div className="mb-4 flex items-end justify-between gap-4">
        <div className="flex items-center gap-2.5">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground">
            {icon}
          </span>
          <div>
            <h2 className="text-lg font-bold leading-tight tracking-tight sm:text-xl">{title}</h2>
            <p className="text-xs text-muted-foreground">{subtitle}</p>
          </div>
        </div>
      </div>

      {/* Scroll horizontal no mobile, grid no desktop */}
      <div className="-mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-2 md:mx-0 md:grid md:grid-cols-3 md:overflow-visible md:px-0 lg:grid-cols-4">
        {products.map((p, i) => (
          <div key={p.id} className="w-[44vw] shrink-0 snap-start sm:w-[30vw] md:w-auto">
            <DiscoveryProductCard product={p} priority={priority && i < 4} />
          </div>
        ))}
      </div>
    </section>
  );
}
