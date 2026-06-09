'use client';

import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';

const faqs = [
  {
    q: 'Os produtos são novos ou usados?',
    a: 'Trabalhamos com produtos de logística reversa: devoluções, open box, itens de vitrine e excesso de estoque. A maioria nunca foi usada ou teve uso mínimo. Cada anúncio informa a condição (Open Box, Revisado, Vitrine ou Devolução).',
  },
  {
    q: 'Os produtos têm garantia?',
    a: 'Sim. Todos os itens passam por triagem e testes e acompanham nota fiscal e garantia. O prazo de garantia é informado na página de cada produto.',
  },
  {
    q: 'Como consigo descontos de até 80%?',
    a: 'Como compramos lotes de devolução e excesso de estoque a preços muito reduzidos, repassamos essa economia para você. Por isso os preços ficam muito abaixo do varejo tradicional.',
  },
  {
    q: 'Vocês entregam para todo o Brasil?',
    a: 'Sim, enviamos para todas as regiões do país com código de rastreio. O prazo e o valor do frete são calculados no checkout pelo seu CEP. Compras acima de R$ 199 têm frete grátis.',
  },
  {
    q: 'É seguro comprar no site?',
    a: 'Totalmente. Nosso site é protegido, os pagamentos são processados por gateways seguros e você recebe nota fiscal em todas as compras. Aceitamos cartão, Pix e boleto.',
  },
  {
    q: 'E se eu não gostar do produto?',
    a: 'Você tem o direito de arrependimento de 7 dias após o recebimento, conforme o Código de Defesa do Consumidor. É só solicitar a devolução pelo nosso atendimento.',
  },
];

function FaqItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border-b border-border">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between gap-4 py-4 text-left text-base font-semibold text-foreground"
        aria-expanded={open}
      >
        {q}
        <ChevronDown
          className={cn(
            'size-5 shrink-0 text-muted-foreground transition-transform duration-200',
            open && 'rotate-180',
          )}
        />
      </button>
      {open && <div className="pb-4 text-sm leading-relaxed text-muted-foreground">{a}</div>}
    </div>
  );
}

export function Faq() {
  return (
    <section id="faq" className="scroll-mt-24 border-b border-border bg-background">
      <div className="mx-auto max-w-3xl px-4 py-16">
        <div className="text-center">
          <h2 className="text-balance font-heading text-3xl font-extrabold tracking-tight text-foreground sm:text-4xl">
            Perguntas frequentes
          </h2>
          <p className="mt-3 text-pretty text-muted-foreground">
            Tudo o que você precisa saber antes de aproveitar as ofertas.
          </p>
        </div>

        <div className="mt-10 w-full">
          {faqs.map((faq, i) => (
            <FaqItem key={i} q={faq.q} a={faq.a} />
          ))}
        </div>
      </div>
    </section>
  );
}
