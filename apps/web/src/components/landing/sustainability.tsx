'use client';

import { motion } from 'motion/react';
import { Recycle, Leaf, RefreshCw } from 'lucide-react';

const points = [
  {
    icon: RefreshCw,
    title: 'Dá uma nova vida aos produtos',
    description: 'Itens que seriam descartados voltam ao mercado em perfeito estado de uso.',
  },
  {
    icon: Leaf,
    title: 'Reduz o desperdício',
    description:
      'Menos produtos no lixo significa menos matéria-prima extraída e menos lixo eletrônico.',
  },
  {
    icon: Recycle,
    title: 'Consumo consciente',
    description: 'Você economiza enquanto contribui para uma cadeia de consumo mais sustentável.',
  },
];

export function Sustainability() {
  return (
    <section className="border-b border-border bg-[hsl(145,20%,97%)] dark:bg-[hsl(145,10%,14%)]">
      <div className="mx-auto max-w-7xl px-4 py-16">
        <div className="grid items-center gap-10 lg:grid-cols-2">
          <div>
            <span className="inline-flex items-center gap-2 rounded-full bg-success px-3 py-1 text-sm font-bold text-success-foreground">
              <Leaf className="size-4" />
              Sustentabilidade
            </span>
            <h2 className="mt-4 text-balance font-heading text-3xl font-extrabold tracking-tight text-foreground sm:text-4xl">
              Economizar também é um ato sustentável
            </h2>
            <p className="mt-4 text-pretty leading-relaxed text-muted-foreground">
              A logística reversa reaproveita produtos devolvidos, de vitrine e de excesso de
              estoque que, de outra forma, poderiam virar lixo. Ao comprar no Saldão da Reversa,
              você prolonga a vida útil desses itens, reduz o desperdício e diminui o impacto
              ambiental do consumo — tudo isso pagando muito menos.
            </p>
          </div>

          <div className="grid gap-4">
            {points.map((p, i) => (
              <motion.div
                key={p.title}
                initial={{ opacity: 0, x: 24 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.4, delay: i * 0.1 }}
                className="flex items-start gap-4 rounded-2xl border border-border bg-card p-5"
              >
                <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-success/15 text-success">
                  <p.icon className="size-5" />
                </span>
                <div>
                  <h3 className="font-bold text-card-foreground">{p.title}</h3>
                  <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                    {p.description}
                  </p>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
