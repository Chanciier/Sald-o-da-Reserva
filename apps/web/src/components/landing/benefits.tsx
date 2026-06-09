'use client';

import { motion } from 'motion/react';
import { PiggyBank, Wrench, Truck, ShieldCheck } from 'lucide-react';

const benefits = [
  {
    icon: PiggyBank,
    title: 'Economia de até 80%',
    description: 'Os mesmos produtos das grandes lojas por uma fração do preço de tabela.',
  },
  {
    icon: Wrench,
    title: 'Produtos revisados',
    description: 'Cada item passa por triagem técnica e testes antes de ir para a vitrine.',
  },
  {
    icon: Truck,
    title: 'Envio para todo Brasil',
    description: 'Despachamos rápido e com rastreio em todas as regiões do país.',
  },
  {
    icon: ShieldCheck,
    title: 'Compra segura',
    description: 'Nota fiscal, garantia e site protegido para você comprar tranquilo.',
  },
];

export function Benefits() {
  return (
    <section id="beneficios" className="scroll-mt-24 border-b border-border bg-background">
      <div className="mx-auto max-w-7xl px-4 py-16">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-balance font-heading text-3xl font-extrabold tracking-tight text-foreground sm:text-4xl">
            Por que comprar no Saldão da Reversa?
          </h2>
          <p className="mt-3 text-pretty text-muted-foreground">
            Transformamos devoluções e excesso de estoque em oportunidades reais de economia para
            você.
          </p>
        </div>

        <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {benefits.map((b, i) => (
            <motion.div
              key={b.title}
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.4, delay: i * 0.1 }}
              className="group rounded-2xl border border-border bg-card p-6 transition-all hover:-translate-y-1 hover:border-primary hover:shadow-lg"
            >
              <span className="flex size-12 items-center justify-center rounded-xl bg-primary/15 text-secondary transition-colors group-hover:bg-primary">
                <b.icon className="size-6" />
              </span>
              <h3 className="mt-4 text-lg font-bold text-card-foreground">{b.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{b.description}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
