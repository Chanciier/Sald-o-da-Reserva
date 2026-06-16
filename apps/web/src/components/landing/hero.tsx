'use client';

import { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { ShieldCheck, Truck, Star, Zap, ArrowRight, Flame } from 'lucide-react';
import { buttonVariants } from '@/components/ui/button';
import { useCountdown, pad } from '@/hooks/use-countdown';

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

function CountdownBox({ value, label }: { value: number; label: string }) {
  return (
    <div className="flex flex-col items-center">
      <div className="flex min-w-[3rem] items-center justify-center rounded-lg bg-secondary px-3 py-2 font-mono text-2xl font-bold tabular-nums text-primary sm:text-3xl">
        {pad(value)}
      </div>
      <span className="mt-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground sm:text-xs">
        {label}
      </span>
    </div>
  );
}

const floatingCards = [
  {
    image: '/products/headphones.png',
    name: 'Fone Bluetooth',
    price: 449.9,
    off: 70,
    className: 'left-0 top-6 sm:-left-2',
    delay: 0,
  },
  {
    image: '/products/drill.png',
    name: 'Parafusadeira 20V',
    price: 199.9,
    off: 69,
    className: 'right-0 top-24 sm:-right-4',
    delay: 0.6,
  },
  {
    image: '/products/airfryer.png',
    name: 'Air Fryer 5,5L',
    price: 259.9,
    off: 67,
    className: 'bottom-4 left-6',
    delay: 1.2,
  },
];

function formatBRL(value: number) {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export function Hero() {
  const { hours, minutes, seconds } = useCountdown(5);
  const [stock, setStock] = useState(143);
  const [minDiscount, setMinDiscount] = useState<number | null>(null);

  useEffect(() => {
    fetch(`${API}/api/v1/products/offers-discount`)
      .then((r) => r.json())
      .then((d: { discountPct: number }) => {
        if (d.discountPct > 0) setMinDiscount(d.discountPct);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    const interval = setInterval(() => {
      setStock((s) => {
        const next = s - Math.floor(Math.random() * 2);
        return next < 40 ? 187 : next;
      });
    }, 4000);
    return () => clearInterval(interval);
  }, []);

  return (
    <section className="relative overflow-hidden border-b border-border bg-background">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -right-40 -top-40 size-[32rem] rounded-full bg-primary/20 blur-3xl"
      />
      <div className="mx-auto grid max-w-7xl items-center gap-10 px-4 py-12 lg:grid-cols-2 lg:gap-8 lg:py-20">
        {/* Left */}
        <div className="relative z-10 max-w-xl">
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="inline-flex items-center gap-2 rounded-full border border-accent/30 bg-accent/10 px-3 py-1 text-sm font-semibold text-accent"
          >
            <Flame className="size-4" />
            Saldão relâmpago no ar agora
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.08 }}
            className="mt-4 text-balance font-heading text-4xl font-extrabold leading-[1.05] tracking-tight text-foreground sm:text-5xl lg:text-6xl"
          >
            Produtos de Grandes Marcas com{' '}
            <span className="relative whitespace-nowrap text-secondary">
              <span className="relative z-10">Até {minDiscount ?? 80}% OFF</span>
              <span
                aria-hidden="true"
                className="absolute inset-x-0 bottom-1 z-0 h-4 bg-primary sm:h-5"
              />
            </span>
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.16 }}
            className="mt-5 text-pretty text-base leading-relaxed text-muted-foreground sm:text-lg"
          >
            Eletrônicos, ferramentas, utilidades domésticas e muito mais por preços que você
            dificilmente encontrará novamente.
          </motion.p>

          {/* Countdown */}
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.24 }}
            className="mt-6 flex flex-wrap items-center gap-4 rounded-xl border border-border bg-card p-4"
          >
            <div className="flex items-center gap-2 text-sm font-bold text-foreground">
              <Zap className="size-4 text-accent" />
              Termina em:
            </div>
            <div className="flex items-center gap-2">
              <CountdownBox value={hours} label="Horas" />
              <span className="text-2xl font-bold text-muted-foreground">:</span>
              <CountdownBox value={minutes} label="Min" />
              <span className="text-2xl font-bold text-muted-foreground">:</span>
              <CountdownBox value={seconds} label="Seg" />
            </div>
          </motion.div>

          {/* CTAs */}
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.32 }}
            className="mt-6 flex flex-col gap-3 sm:flex-row"
          >
            <a
              href="#produtos"
              className={buttonVariants({
                size: 'lg',
                className:
                  'h-13 w-full text-base font-extrabold shadow-lg shadow-primary/30 sm:flex-1',
              })}
            >
              QUERO ECONOMIZAR AGORA
              <ArrowRight className="size-5" />
            </a>
            <a
              href="#como-funciona"
              className={buttonVariants({
                size: 'lg',
                variant: 'outline',
                className:
                  'hidden h-13 flex-1 border-secondary text-base font-bold text-foreground sm:flex sm:flex-none',
              })}
            >
              Como funciona
            </a>
          </motion.div>

          {/* Live stock */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.5, delay: 0.4 }}
            className="mt-4 flex items-center gap-2 text-sm text-muted-foreground"
          >
            <span className="relative flex size-2.5">
              <span className="absolute inline-flex size-full animate-ping rounded-full bg-accent opacity-75" />
              <span className="relative inline-flex size-2.5 rounded-full bg-accent" />
            </span>
            <span>
              Restam apenas{' '}
              <strong className="font-bold text-foreground tabular-nums">{stock}</strong> itens
              nesta promoção
            </span>
          </motion.div>

          {/* Trust badges */}
          <div className="mt-6 flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-border pt-5">
            <div className="flex items-center gap-1.5 text-sm font-medium text-foreground">
              <ShieldCheck className="size-4 text-success" />
              Compra 100% segura
            </div>
            <div className="flex items-center gap-1.5 text-sm font-medium text-foreground">
              <Truck className="size-4 text-success" />
              Envio para todo o Brasil
            </div>
            <div className="flex items-center gap-1.5 text-sm font-medium text-foreground">
              <Star className="size-4 fill-primary text-primary" />
              4.9 / 5 (20 mil avaliações)
            </div>
          </div>
        </div>

        {/* Right - floating cards */}
        <div className="relative mx-auto hidden h-[30rem] w-full max-w-md lg:block">
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.6 }}
            className="absolute inset-x-6 top-1/2 -translate-y-1/2 rounded-3xl bg-gradient-to-br from-primary to-[hsl(42,95%,45%)] p-8 shadow-2xl"
          >
            <div className="flex h-full flex-col justify-between text-secondary">
              <div>
                <p className="text-sm font-bold uppercase tracking-wide">Saldão da Reversa</p>
                <p className="mt-2 text-5xl font-black leading-none">{minDiscount ?? 80}%</p>
                <p className="text-2xl font-extrabold">de desconto</p>
              </div>
              <p className="text-sm font-semibold opacity-80">
                Produtos revisados • Garantia inclusa
              </p>
            </div>
          </motion.div>

          {floatingCards.map((card) => (
            <motion.div
              key={card.name}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: [0, -12, 0] }}
              transition={{
                opacity: { duration: 0.5, delay: card.delay },
                y: { duration: 4, repeat: Infinity, ease: 'easeInOut', delay: card.delay },
              }}
              className={`absolute ${card.className} w-44 rounded-2xl border border-border bg-card/85 p-3 shadow-xl backdrop-blur-sm`}
            >
              <div className="relative">
                <span className="absolute left-0 top-0 z-10 rounded-md bg-accent px-1.5 py-0.5 text-[10px] font-bold text-accent-foreground">
                  -{card.off}%
                </span>
                <img
                  src={card.image}
                  alt={card.name}
                  className="mx-auto h-24 w-auto object-contain"
                />
              </div>
              <p className="mt-1 truncate text-xs font-semibold text-foreground">{card.name}</p>
              <p className="text-sm font-extrabold text-foreground">{formatBRL(card.price)}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
