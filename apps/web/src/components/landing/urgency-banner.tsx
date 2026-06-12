'use client';

import { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { Flame, Clock, TrendingUp, AlertTriangle } from 'lucide-react';
import { buttonVariants } from '@/components/ui/button';
import { useCountdown, pad } from '@/hooks/use-countdown';

function TimeUnit({ value, label }: { value: number; label: string }) {
  return (
    <div className="flex flex-col items-center">
      <span className="flex min-w-[3.5rem] items-center justify-center rounded-lg bg-secondary px-3 py-2 font-mono text-3xl font-black tabular-nums text-primary sm:min-w-[4rem] sm:text-4xl">
        {pad(value)}
      </span>
      <span className="mt-1.5 text-xs font-semibold uppercase tracking-wide text-secondary-foreground/70">
        {label}
      </span>
    </div>
  );
}

export function UrgencyBanner() {
  const { hours, minutes, seconds } = useCountdown(5);
  const [viewers, setViewers] = useState(284);

  useEffect(() => {
    const interval = setInterval(() => {
      setViewers((v) => {
        const next = v + Math.floor(Math.random() * 11) - 5;
        return Math.min(420, Math.max(180, next));
      });
    }, 3000);
    return () => clearInterval(interval);
  }, []);

  return (
    <section className="bg-secondary text-secondary-foreground">
      <div className="mx-auto max-w-7xl px-4 py-14">
        <motion.div
          initial={{ opacity: 0, scale: 0.97 }}
          whileInView={{ opacity: 1, scale: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="overflow-hidden rounded-3xl border border-primary/40 bg-gradient-to-br from-secondary to-[hsl(0,0%,14%)] p-8 sm:p-10"
        >
          <div className="flex flex-col items-center gap-8 lg:flex-row lg:justify-between">
            <div className="max-w-lg text-center lg:text-left">
              <span className="inline-flex items-center gap-2 rounded-full bg-accent px-3 py-1 text-sm font-bold text-accent-foreground">
                <Flame className="size-4" />
                Flash Sale
              </span>
              <h2 className="mt-4 text-balance font-heading text-3xl font-extrabold leading-tight sm:text-4xl">
                As maiores ofertas do dia somem em poucas horas
              </h2>
              <p className="mt-3 text-pretty text-secondary-foreground/70">
                Preços de saldão por tempo limitado. Quando o estoque acabar, acabou.
              </p>

              <div className="mt-6 flex flex-col gap-3 text-sm sm:flex-row sm:items-center sm:justify-center lg:justify-start">
                <span className="inline-flex items-center justify-center gap-1.5 rounded-full bg-white/5 px-3 py-1.5 font-medium">
                  <TrendingUp className="size-4 text-primary" />
                  <strong className="tabular-nums">{viewers}</strong> pessoas vendo agora
                </span>
                <span className="inline-flex items-center justify-center gap-1.5 rounded-full bg-white/5 px-3 py-1.5 font-medium text-accent">
                  <AlertTriangle className="size-4" />
                  Estoque quase esgotado
                </span>
              </div>
            </div>

            <div className="flex flex-col items-center gap-5">
              <div className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-secondary-foreground/70">
                <Clock className="size-4 text-primary" />
                Termina em
              </div>
              <div className="flex items-center gap-2 sm:gap-3">
                <TimeUnit value={hours} label="Horas" />
                <span className="pb-5 text-3xl font-black text-primary">:</span>
                <TimeUnit value={minutes} label="Min" />
                <span className="pb-5 text-3xl font-black text-primary">:</span>
                <TimeUnit value={seconds} label="Seg" />
              </div>
              <a
                href="#produtos"
                className={buttonVariants({
                  size: 'lg',
                  className: 'h-13 w-full text-base font-extrabold shadow-lg shadow-primary/30',
                })}
              >
                Aproveitar agora
              </a>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
