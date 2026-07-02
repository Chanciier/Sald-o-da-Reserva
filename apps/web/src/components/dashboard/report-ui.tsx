'use client';

import Link from 'next/link';
import { CalendarDays, RefreshCw, TrendingDown, TrendingUp } from 'lucide-react';
import type { ReactNode } from 'react';

export const money = (value: number) =>
  value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
export const integer = (value: number) => value.toLocaleString('pt-BR');
export const percent = (value: number) =>
  `${value.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`;

interface HeaderProps {
  title: string;
  description: string;
  from: string;
  to: string;
  draft: { from: string; to: string };
  setDraft: (value: { from: string; to: string }) => void;
  apply: () => void;
  preset: (kind: 'today' | 'month' | '30days') => void;
  fetching: boolean;
  refresh: () => void;
}

export function ReportHeader(props: HeaderProps) {
  const query = `?from=${props.from}&to=${props.to}`;
  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">
            Inteligência comercial
          </p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight">{props.title}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{props.description}</p>
        </div>
        <button
          onClick={props.refresh}
          disabled={props.fetching}
          aria-label="Atualizar relatório"
          className="flex min-h-11 items-center justify-center gap-2 rounded-lg border bg-card px-4 text-sm font-medium transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
        >
          <RefreshCw className={`h-4 w-4 ${props.fetching ? 'animate-spin' : ''}`} /> Atualizar
        </button>
      </div>
      <div className="rounded-xl border bg-card p-3 shadow-sm">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between">
          <div className="flex flex-wrap gap-2" aria-label="Períodos rápidos">
            <button
              onClick={() => props.preset('today')}
              className="min-h-11 rounded-lg border px-3 text-sm hover:bg-muted"
            >
              Hoje
            </button>
            <button
              onClick={() => props.preset('month')}
              className="min-h-11 rounded-lg border px-3 text-sm hover:bg-muted"
            >
              Este mês
            </button>
            <button
              onClick={() => props.preset('30days')}
              className="min-h-11 rounded-lg border px-3 text-sm hover:bg-muted"
            >
              Últimos 30 dias
            </button>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <label className="text-xs font-medium text-muted-foreground">
              De
              <input
                type="date"
                value={props.draft.from}
                max={props.draft.to}
                onChange={(e) => props.setDraft({ ...props.draft, from: e.target.value })}
                className="mt-1 block min-h-11 rounded-lg border bg-background px-3 text-sm text-foreground"
              />
            </label>
            <label className="text-xs font-medium text-muted-foreground">
              Até
              <input
                type="date"
                value={props.draft.to}
                min={props.draft.from}
                onChange={(e) => props.setDraft({ ...props.draft, to: e.target.value })}
                className="mt-1 block min-h-11 rounded-lg border bg-background px-3 text-sm text-foreground"
              />
            </label>
            <button
              onClick={props.apply}
              disabled={!props.draft.from || !props.draft.to || props.draft.from > props.draft.to}
              className="min-h-11 rounded-lg bg-primary px-5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              <CalendarDays className="mr-2 inline h-4 w-4" />
              Aplicar
            </button>
          </div>
        </div>
      </div>
      <nav className="flex gap-1 overflow-x-auto border-b" aria-label="Abas de relatórios">
        {[
          ['Vendas', '/admin/relatorios/vendas'],
          ['Produtos', '/admin/relatorios/produtos'],
          ['Clientes', '/admin/relatorios/clientes'],
        ].map(([label, href]) => (
          <Link
            key={href}
            href={`${href}${query}`}
            className="min-h-11 whitespace-nowrap border-b-2 border-transparent px-4 py-3 text-sm font-medium text-muted-foreground transition-colors hover:border-primary/30 hover:text-foreground"
          >
            {label}
          </Link>
        ))}
      </nav>
    </div>
  );
}

export function Kpi({
  label,
  value,
  icon,
  change,
  detail,
}: {
  label: string;
  value: string;
  icon: ReactNode;
  change?: number;
  detail?: string;
}) {
  const positive = (change ?? 0) >= 0;
  return (
    <div className="rounded-xl border bg-card p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {label}
          </p>
          <p className="mt-2 text-2xl font-bold tracking-tight">{value}</p>
        </div>
        <div className="rounded-lg bg-primary/10 p-2 text-primary">{icon}</div>
      </div>
      {change !== undefined && (
        <p
          className={`mt-3 flex items-center gap-1 text-xs font-medium ${positive ? 'text-emerald-700' : 'text-red-700'}`}
        >
          {positive ? (
            <TrendingUp className="h-3.5 w-3.5" />
          ) : (
            <TrendingDown className="h-3.5 w-3.5" />
          )}
          {percent(Math.abs(change))} vs. período anterior
        </p>
      )}
      {detail && <p className="mt-3 text-xs text-muted-foreground">{detail}</p>}
    </div>
  );
}

export function Bars<T>({
  data,
  value,
  label,
  format = integer,
}: {
  data: T[];
  value: (item: T) => number;
  label: (item: T) => string;
  format?: (value: number) => string;
}) {
  const max = Math.max(...data.map(value), 1);
  if (!data.length) return <Empty />;
  return (
    <div className="space-y-3">
      {data.map((item, index) => {
        const amount = value(item);
        return (
          <div key={`${label(item)}-${index}`}>
            <div className="mb-1 flex items-center justify-between gap-4 text-xs">
              <span className="truncate text-muted-foreground">{label(item)}</span>
              <span className="font-semibold">{format(amount)}</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-primary transition-[width] duration-300"
                style={{ width: `${Math.max((amount / max) * 100, amount ? 2 : 0)}%` }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function Panel({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-xl border bg-card p-5 shadow-sm">
      <div className="mb-5">
        <h2 className="font-semibold">{title}</h2>
        {subtitle && <p className="mt-1 text-xs text-muted-foreground">{subtitle}</p>}
      </div>
      {children}
    </section>
  );
}

export function Empty() {
  return (
    <div className="flex h-36 items-center justify-center text-sm text-muted-foreground">
      Sem dados no período selecionado
    </div>
  );
}

export function LoadingReport() {
  return (
    <div className="space-y-5" aria-label="Carregando relatório">
      {[96, 144, 280].map((height) => (
        <div key={height} className="animate-pulse rounded-xl bg-muted" style={{ height }} />
      ))}
    </div>
  );
}
