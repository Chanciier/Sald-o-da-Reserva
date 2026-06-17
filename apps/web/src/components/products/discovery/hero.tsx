import { Flame } from 'lucide-react';
import { RandomButton } from '@/components/products/discovery/random-button';

export function Hero({ slugs }: { slugs: string[] }) {
  return (
    <section className="relative overflow-hidden border-b border-border bg-primary">
      <div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-10 sm:py-14">
        <span className="inline-flex w-fit items-center gap-1.5 rounded-full bg-primary-foreground/10 px-3 py-1 text-xs font-bold uppercase tracking-wide text-primary-foreground">
          <Flame className="size-3.5" aria-hidden="true" />
          Estoque vivo, atualizado a cada hora
        </span>

        <h1 className="max-w-2xl text-pretty text-3xl font-extrabold leading-[1.05] tracking-tight text-primary-foreground sm:text-5xl">
          Você nunca sabe o que vai encontrar no Saldão da Reserva hoje.
        </h1>

        <p className="max-w-xl text-pretty text-sm leading-relaxed text-primary-foreground/80 sm:text-base">
          Achados aleatórios, últimas unidades e oportunidades reais misturadas em um só lugar.
          Entra pra dar uma olhada rápida e fica garimpando.
        </p>

        <div className="mt-2 flex flex-wrap items-center gap-3">
          <RandomButton slugs={slugs} variant="hero" />
          <a
            href="#descobrir"
            className="inline-flex items-center gap-2 rounded-full border border-primary-foreground/30 px-6 py-3 text-sm font-bold text-primary-foreground transition-colors hover:bg-primary-foreground/10"
          >
            Explorar achados
          </a>
        </div>
      </div>
    </section>
  );
}
