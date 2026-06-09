'use client';

import { motion } from 'motion/react';
import { ArrowRight, Zap } from 'lucide-react';
import { buttonVariants } from '@/components/ui/button';
import { useCountdown, pad } from '@/hooks/use-countdown';

export function FinalCta() {
  const { hours, minutes, seconds } = useCountdown(5);

  return (
    <section className="bg-secondary">
      <div className="mx-auto max-w-4xl px-4 py-16 text-center sm:py-20">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
        >
          <div className="inline-flex items-center gap-2 rounded-full bg-primary px-4 py-1.5 text-sm font-bold text-secondary">
            <Zap className="size-4" />
            Última chamada
          </div>
          <h2 className="mt-5 text-balance font-heading text-3xl font-extrabold tracking-tight text-secondary-foreground sm:text-5xl">
            Não deixe a economia de até <span className="text-primary">80%</span> passar
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-pretty text-base leading-relaxed text-secondary-foreground/70 sm:text-lg">
            Os estoques são limitados e cada produto é único. Quando acabar, acabou. Garanta o seu
            agora.
          </p>

          <div className="mt-8 flex items-center justify-center gap-3 font-mono text-secondary-foreground">
            <span className="text-sm font-sans font-semibold text-secondary-foreground/70">
              Encerra em
            </span>
            <span className="rounded-md bg-primary px-2.5 py-1 text-lg font-bold tabular-nums text-secondary">
              {pad(hours)}
            </span>
            <span className="text-lg font-bold text-primary">:</span>
            <span className="rounded-md bg-primary px-2.5 py-1 text-lg font-bold tabular-nums text-secondary">
              {pad(minutes)}
            </span>
            <span className="text-lg font-bold text-primary">:</span>
            <span className="rounded-md bg-primary px-2.5 py-1 text-lg font-bold tabular-nums text-secondary">
              {pad(seconds)}
            </span>
          </div>

          <a
            href="#produtos"
            className={buttonVariants({
              size: 'lg',
              className: 'mt-8 h-14 px-8 text-base font-extrabold shadow-xl shadow-primary/30',
            })}
          >
            VER OFERTAS E COMPRAR
            <ArrowRight className="size-5" />
          </a>
          <p className="mt-4 text-sm text-secondary-foreground/60">
            Frete grátis acima de R$ 199 • Garantia inclusa
          </p>
        </motion.div>
      </div>
    </section>
  );
}
