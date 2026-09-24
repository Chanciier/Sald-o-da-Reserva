import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { DM_Sans } from 'next/font/google';
import {
  ArrowRight,
  CalendarDays,
  Check,
  CircleDollarSign,
  ShoppingBag,
  TicketPercent,
} from 'lucide-react';

import { getProduct } from '@/lib/api';
import { effectivePrice, formatBRL } from '@/lib/discovery';

const dmSans = DM_Sans({ subsets: ['latin'], weight: ['400', '500', '600', '700', '800', '900'] });

const SIGNUP_HREF = '/assinar-clube';

export const metadata: Metadata = {
  title: 'Cliente Clube',
  description:
    'Descontos exclusivos, eventos e experiências. Faça parte do Clube do Saldão da Reversa.',
};

const benefits = [
  {
    icon: TicketPercent,
    eyebrow: 'Economize mais',
    title: 'Descontos exclusivos',
    description:
      'Condições especiais em produtos selecionados para você comprar melhor todos os meses.',
  },
  {
    icon: CalendarDays,
    eyebrow: 'Viva primeiro',
    title: 'Eventos e experiências',
    description: 'Convites para momentos exclusivos e novidades da loja antes de todo mundo.',
  },
];

const highlights = [
  { icon: ShoppingBag, label: 'Mais valor em cada compra' },
  { icon: CircleDollarSign, label: 'Uma adesão, um ano de vantagens' },
  { icon: Check, label: 'Benefícios sem complicação' },
];

const tickerItems = [
  'Descontos exclusivos',
  'Eventos e experiências',
  'Compre melhor',
  'Viva primeiro',
  'Cliente Clube',
];

function Marquee() {
  const items = [...tickerItems, ...tickerItems, ...tickerItems, ...tickerItems];
  return (
    <div className="flex overflow-hidden border-y-2 border-[#171717] bg-[#ffd11a] py-2.5">
      <div className="flex w-max shrink-0 animate-marquee items-center gap-6 whitespace-nowrap pr-6">
        {items.map((item, i) => (
          <span
            key={i}
            className="flex items-center gap-6 text-xs font-black uppercase tracking-[0.14em] text-[#171717]"
          >
            {item}
            <span className="text-[#e93732]">✦</span>
          </span>
        ))}
      </div>
    </div>
  );
}

export default async function ClubeReversaPage() {
  const product = await getProduct('clube-reversa').catch(() => null);
  if (!product) notFound();

  const price = formatBRL(effectivePrice(product));

  return (
    <main
      className={`${dmSans.className} relative min-h-screen overflow-hidden bg-[#fffaf0] text-[#171717]`}
    >
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.035]"
        style={{
          backgroundImage: 'radial-gradient(#171717 1px, transparent 1px)',
          backgroundSize: '22px 22px',
        }}
      />

      <header className="relative z-10 flex items-center justify-between px-5 pt-5 sm:px-8">
        <div className="flex items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/images/clube-reversa-logo.jpg"
            alt="Logo Saldão da Reversa"
            className="h-11 w-11 rounded-lg border-2 border-[#171717] object-cover"
          />
          <div className="leading-none">
            <p className="text-[9px] font-black uppercase tracking-[0.2em] text-[#e93732]">
              Saldão da Reversa
            </p>
            <p className="mt-0.5 text-sm font-black tracking-tight">Cliente Clube</p>
          </div>
        </div>
        <div className="rounded-full border-2 border-[#171717] bg-[#ffd11a] px-3.5 py-1.5 text-[10px] font-black uppercase tracking-wider">
          Anual
        </div>
      </header>

      <section className="relative z-10 px-5 pt-10 sm:px-8 lg:pt-14">
        <div className="mx-auto max-w-6xl">
          <div className="relative">
            <div className="absolute -top-3 left-0 rotate-[-3deg] rounded-full bg-[#171717] px-4 py-1.5 text-[10px] font-black uppercase tracking-[0.18em] text-[#ffd11a]">
              ★ Feito para quem aproveita
            </div>

            <h1 className="pt-8 text-[clamp(3.2rem,15vw,8rem)] font-black uppercase leading-[0.85] tracking-[-0.06em]">
              <span className="block">Pague</span>
              <span className="block">
                <span className="relative inline-block">
                  <span className="relative z-10 text-[#ffd11a]">menos</span>
                  <span className="absolute inset-x-0 bottom-1 z-0 h-4 -rotate-1 bg-[#e93732] sm:h-6" />
                </span>
                ,
              </span>
              <span className="block">
                viva <span className="italic text-[#e93732]">mais.</span>
              </span>
            </h1>
          </div>

          <div className="mt-8 grid gap-5 sm:grid-cols-[1fr_auto] sm:items-end">
            <p className="max-w-md text-base leading-7 text-[#5d5a55] sm:text-lg">
              O clube de quem sabe que comprar bem é um estilo. Tenha acesso a condições que o
              cliente comum não vê — e faça cada visita valer mais.
            </p>

            <div className="flex items-stretch gap-0 self-start rounded-2xl border-2 border-[#171717] bg-white shadow-[6px_6px_0_#171717] sm:self-end">
              <div className="px-5 py-3">
                <p className="text-[9px] font-black uppercase tracking-wider text-[#77736c]">
                  Por ano
                </p>
                <p className="text-2xl font-black tracking-tight sm:text-3xl">{price}</p>
              </div>
              <div className="flex flex-col items-center justify-center border-l-2 border-[#171717] bg-[#171717] px-4 text-white">
                <p className="text-[9px] font-bold uppercase">até</p>
                <p className="text-2xl font-black leading-none">12x</p>
                <p className="text-[9px] font-bold">no cartão</p>
              </div>
            </div>
          </div>

          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <a
              href={SIGNUP_HREF}
              className="group inline-flex items-center justify-center gap-3 rounded-2xl bg-[#e93732] px-6 py-4 text-sm font-black text-white shadow-[0_5px_0_#a92825] transition hover:-translate-y-0.5 hover:shadow-[0_7px_0_#a92825] active:translate-y-0 active:shadow-[0_3px_0_#a92825]"
            >
              Quero entrar para o clube
              <ArrowRight size={18} className="transition-transform group-hover:translate-x-1" />
            </a>
            <a
              href="#beneficios"
              className="inline-flex items-center justify-center rounded-2xl border-2 border-[#171717] px-6 py-3.5 text-sm font-black transition hover:bg-[#171717] hover:text-white"
            >
              Ver benefícios
            </a>
          </div>
        </div>
      </section>

      <div className="relative z-10 mt-12">
        <Marquee />
      </div>

      <section
        id="beneficios"
        className="relative z-10 scroll-mt-20 px-5 py-14 sm:px-8 lg:px-14"
      >
        <div className="mx-auto max-w-6xl">
          <div className="mb-2 flex items-baseline gap-3">
            <span className="text-5xl font-black leading-none text-[#e93732]">01</span>
            <span className="h-px flex-1 bg-[#171717]/15" />
            <span className="text-[10px] font-black uppercase tracking-[0.2em] text-[#77736c]">
              Benefícios
            </span>
          </div>
          <h2 className="mb-8 max-w-lg text-3xl font-black leading-[0.95] tracking-[-0.05em] sm:text-4xl">
            O que muda quando você é do clube.
          </h2>

          <div className="grid gap-4 md:grid-cols-2">
            {benefits.map((benefit, index) => {
              const Icon = benefit.icon;
              return (
                <article
                  key={benefit.title}
                  className="group relative rounded-2xl border-2 border-[#171717] bg-white p-6 shadow-[5px_5px_0_#171717] transition hover:-translate-y-1 hover:shadow-[8px_8px_0_#e93732]"
                >
                  <div className="mb-6 flex items-center justify-between">
                    <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-[#ffd11a] text-[#171717] transition group-hover:rotate-[-6deg]">
                      <Icon size={23} />
                    </div>
                    <span className="text-4xl font-black leading-none text-[#171717]/[0.08]">
                      {String(index + 1).padStart(2, '0')}
                    </span>
                  </div>
                  <p className="mb-1.5 text-[11px] font-black uppercase tracking-[0.16em] text-[#e93732]">
                    {benefit.eyebrow}
                  </p>
                  <h3 className="text-xl font-black tracking-tight">{benefit.title}</h3>
                  <p className="mt-2 max-w-sm text-sm leading-6 text-[#6c6963]">
                    {benefit.description}
                  </p>
                </article>
              );
            })}
          </div>

          <div className="mt-5 grid gap-3 sm:grid-cols-3">
            {highlights.map(({ icon: Icon, label }) => (
              <div key={label} className="flex items-center gap-2 text-xs font-bold text-[#6c6963]">
                <Icon size={16} className="text-[#e93732]" />
                {label}
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="relative z-10 px-5 pb-24 pt-8 sm:px-8 lg:px-14">
        <div className="mx-auto max-w-6xl">
          <div className="relative overflow-hidden rounded-[2rem] border-2 border-[#171717] bg-[#171717] px-6 py-12 text-center text-white sm:px-12 sm:py-16">
            <div className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-[#e93732]/30 blur-3xl" />
            <div className="pointer-events-none absolute -bottom-16 -left-16 h-48 w-48 rounded-full bg-[#ffd11a]/20 blur-3xl" />
            <p className="relative mb-4 text-xs font-black uppercase tracking-[0.2em] text-[#ffd11a]">
              Sua vaga está te esperando
            </p>
            <h2 className="relative mx-auto max-w-xl text-3xl font-black leading-tight tracking-[-0.04em] sm:text-5xl">
              Faça parte de quem compra com vantagem.
            </h2>
            <p className="relative mx-auto mt-4 max-w-md text-sm leading-6 text-white/55">
              Adesão anual de {price}, parcelada em até 12x no cartão. Sem complicação.
            </p>
            <a
              href={SIGNUP_HREF}
              className="group relative mt-8 inline-flex items-center justify-center gap-3 rounded-2xl bg-[#ffd11a] px-7 py-4 text-sm font-black text-[#171717] shadow-[0_5px_0_#a88a00] transition hover:-translate-y-0.5 hover:shadow-[0_7px_0_#a88a00] active:translate-y-0 active:shadow-[0_3px_0_#a88a00]"
            >
              Quero ser Cliente Clube
              <ArrowRight size={18} className="transition-transform group-hover:translate-x-1" />
            </a>
          </div>
        </div>
      </section>

      <p className="relative z-10 border-t border-[#171717]/10 px-5 py-7 text-center text-xs font-semibold text-[#918b82] sm:px-8">
        Cliente Clube Saldão da Reversa SJC · Vantagens para aproveitar mais.
      </p>

      <a
        href={SIGNUP_HREF}
        className="fixed bottom-4 left-4 right-4 z-20 flex items-center justify-center gap-2 rounded-2xl bg-[#e93732] px-5 py-4 text-sm font-black text-white shadow-[0_5px_0_#a92825] sm:hidden"
      >
        Quero entrar para o clube <ArrowRight size={17} />
      </a>
    </main>
  );
}
