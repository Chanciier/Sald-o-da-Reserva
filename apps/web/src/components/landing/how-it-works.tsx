'use client';

import { motion } from 'motion/react';
import { PackageOpen, ClipboardCheck, Tags, Wallet } from 'lucide-react';

const steps = [
  {
    icon: PackageOpen,
    title: 'Recebemos os produtos',
    description: 'Coletamos itens de devolução, excesso de estoque e vitrine das grandes marcas.',
  },
  {
    icon: ClipboardCheck,
    title: 'Triagem e classificação',
    description: 'Cada produto é testado, revisado e classificado por estado de conservação.',
  },
  {
    icon: Tags,
    title: 'Grandes descontos',
    description: 'Disponibilizamos no site com preços muito abaixo do varejo tradicional.',
  },
  {
    icon: Wallet,
    title: 'Você economiza até 80%',
    description: 'Leva o mesmo produto que queria pagando uma fração do valor original.',
  },
];

export function HowItWorks() {
  return (
    <section id="como-funciona" className="scroll-mt-24 border-b border-border bg-background">
      <div className="mx-auto max-w-7xl px-4 py-16">
        <div className="mx-auto max-w-2xl text-center">
          <span className="text-sm font-bold uppercase tracking-wide text-accent">
            Logística reversa
          </span>
          <h2 className="mt-2 text-balance font-heading text-3xl font-extrabold tracking-tight text-foreground sm:text-4xl">
            Como funciona
          </h2>
          <p className="mt-3 text-pretty text-muted-foreground">
            Do galpão até a sua casa em quatro passos simples e transparentes.
          </p>
        </div>

        <div className="relative mt-12 grid gap-6 md:grid-cols-4">
          <div
            aria-hidden="true"
            className="absolute left-0 right-0 top-7 hidden h-0.5 bg-border md:block"
          />
          {steps.map((step, i) => (
            <motion.div
              key={step.title}
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.4, delay: i * 0.12 }}
              className="relative flex flex-col items-center text-center"
            >
              <span className="relative z-10 flex size-14 items-center justify-center rounded-full border-4 border-background bg-primary text-secondary shadow-md">
                <step.icon className="size-6" />
              </span>
              <span className="mt-3 flex size-6 items-center justify-center rounded-full bg-secondary text-xs font-bold text-secondary-foreground">
                {i + 1}
              </span>
              <h3 className="mt-3 text-base font-bold text-foreground">{step.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                {step.description}
              </p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
