'use client';

import { motion } from 'motion/react';
import { Star, BadgeCheck } from 'lucide-react';

const stats = [
  { value: '50.000+', label: 'Pedidos entregues' },
  { value: '20.000+', label: 'Clientes satisfeitos' },
  { value: '4.9', label: 'Avaliação média', star: true },
  { value: '80%', label: 'Economia máxima' },
];

const testimonials = [
  {
    name: 'Mariana Souza',
    location: 'São Paulo, SP',
    text: 'Comprei uma air fryer open box e veio impecável, parecia nova. Paguei menos da metade do preço da loja. Recomendo demais!',
    rating: 5,
    initials: 'MS',
  },
  {
    name: 'Carlos Eduardo',
    location: 'Belo Horizonte, MG',
    text: 'Já é minha terceira compra. As ferramentas revisadas funcionam perfeitamente e a economia é absurda. Entrega rápida também.',
    rating: 5,
    initials: 'CE',
  },
  {
    name: 'Juliana Ferreira',
    location: 'Curitiba, PR',
    text: 'Fiquei com receio por ser produto de devolução, mas chegou tudo certinho com nota fiscal e garantia. Economizei mais de R$ 1.000 na TV.',
    rating: 5,
    initials: 'JF',
  },
];

export function SocialProof() {
  return (
    <section className="border-b border-border bg-secondary text-secondary-foreground">
      <div className="mx-auto max-w-7xl px-4 py-10">
        <div className="grid grid-cols-2 gap-6 md:grid-cols-4">
          {stats.map((stat, i) => (
            <motion.div
              key={stat.label}
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.4, delay: i * 0.08 }}
              className="text-center"
            >
              <p className="flex items-center justify-center gap-1.5 font-heading text-3xl font-black text-primary sm:text-4xl">
                {stat.value}
                {stat.star && <Star className="size-6 fill-primary text-primary" />}
              </p>
              <p className="mt-1 text-sm text-secondary-foreground/70">{stat.label}</p>
            </motion.div>
          ))}
        </div>
      </div>

      <div className="border-t border-white/10">
        <div className="mx-auto max-w-7xl px-4 py-12">
          <h2 className="text-center font-heading text-2xl font-extrabold sm:text-3xl">
            Quem comprou, aprovou
          </h2>
          <div className="mt-8 grid gap-5 md:grid-cols-3">
            {testimonials.map((t, i) => (
              <motion.figure
                key={t.name}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.4, delay: i * 0.1 }}
                className="rounded-2xl bg-card p-6 text-card-foreground"
              >
                <div className="flex gap-0.5" aria-label={`${t.rating} de 5 estrelas`}>
                  {Array.from({ length: t.rating }).map((_, idx) => (
                    <Star key={idx} className="size-4 fill-primary text-primary" />
                  ))}
                </div>
                <blockquote className="mt-3 text-pretty text-sm leading-relaxed text-card-foreground">
                  &ldquo;{t.text}&rdquo;
                </blockquote>
                <figcaption className="mt-4 flex items-center gap-3 border-t border-border pt-4">
                  <span className="flex size-10 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-foreground">
                    {t.initials}
                  </span>
                  <div className="min-w-0">
                    <p className="flex items-center gap-1 text-sm font-bold text-card-foreground">
                      {t.name}
                      <BadgeCheck className="size-4 text-success" aria-label="Compra verificada" />
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {t.location} • Compra verificada
                    </p>
                  </div>
                </figcaption>
              </motion.figure>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
