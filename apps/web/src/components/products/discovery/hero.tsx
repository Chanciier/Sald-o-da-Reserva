import Image from 'next/image';
import { Flame, Tag, Package, Clock, ShieldCheck } from 'lucide-react';
import { RandomButton } from '@/components/products/discovery/random-button';

const FEATURES = [
  { icon: Tag, label: 'Ofertas\nreais' },
  { icon: Package, label: 'Produtos\núnicos' },
  { icon: Clock, label: 'Acabou,\nacabou' },
  { icon: ShieldCheck, label: 'Compra\nsegura' },
];

export function Hero({ slugs }: { slugs: string[] }) {
  return (
    <section className="relative overflow-hidden border-b border-border bg-primary">
      <div className="mx-auto grid max-w-7xl grid-cols-1 items-center gap-8 px-4 py-10 sm:py-14 lg:grid-cols-2 lg:gap-6">
        {/* Copy */}
        <div className="flex flex-col gap-5">
          <span className="inline-flex w-fit items-center gap-1.5 rounded-full bg-foreground/10 px-3 py-1.5 text-xs font-bold uppercase tracking-wide text-foreground">
            <Flame className="size-3.5 text-accent" aria-hidden="true" />
            Estoque limitado, oportunidades reais
          </span>

          <h1 className="text-pretty text-4xl font-extrabold leading-[1.02] tracking-tight text-foreground sm:text-5xl lg:text-6xl">
            Achados que podem sumir hoje
          </h1>

          <p className="max-w-md text-pretty text-base leading-relaxed text-foreground/70">
            Estoque limitado, últimas unidades e oportunidades que não voltam.
          </p>

          <div className="mt-1 flex flex-wrap items-center gap-3">
            <a
              href="#destaques"
              className="inline-flex items-center gap-2 rounded-full bg-foreground px-6 py-3 text-sm font-bold text-background transition-transform hover:scale-[1.03] active:scale-95"
            >
              <Flame className="size-4" aria-hidden="true" />
              Ver destaques
            </a>
            <RandomButton slugs={slugs} variant="hero-outline" label="Me surpreenda" />
          </div>

          {/* Features */}
          <ul className="mt-3 flex flex-wrap gap-x-7 gap-y-3">
            {FEATURES.map(({ icon: Icon, label }) => (
              <li key={label} className="flex items-center gap-2 text-foreground">
                <Icon className="size-5 shrink-0" strokeWidth={1.75} aria-hidden="true" />
                <span className="whitespace-pre-line text-xs font-semibold leading-tight">
                  {label}
                </span>
              </li>
            ))}
          </ul>
        </div>

        {/* Image */}
        <div className="relative">
          <div
            className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(255,255,255,0.55),rgba(255,255,255,0)_65%)] blur-2xl"
            aria-hidden="true"
          />
          <div className="relative mx-auto aspect-[3/2] w-full max-w-xl">
            <Image
              src="/banner-produtos.png"
              alt="Caixa do Saldão da Reserva cheia de achados"
              fill
              priority
              sizes="(max-width: 1024px) 100vw, 50vw"
              className="object-contain"
            />
          </div>
        </div>
      </div>
    </section>
  );
}
