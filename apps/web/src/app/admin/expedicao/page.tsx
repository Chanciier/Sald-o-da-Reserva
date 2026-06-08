'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { ClipboardList, Package, FileText, Tag, Truck, Store, ArrowRight } from 'lucide-react';
import { useAuth } from '@/contexts/auth-context';
import { fetchExpedicaoStats } from '@/actions/expedicao';
import type { ExpedicaoStats } from '@/actions/expedicao';

interface StatCardProps {
  label: string;
  value: number | undefined;
  href: string;
  icon: React.ElementType;
  color: string;
}

function StatCard({ label, value, href, icon: Icon, color }: StatCardProps) {
  return (
    <Link
      href={href}
      className="flex flex-col gap-3 rounded-xl border bg-card p-5 shadow-sm hover:shadow-md transition-shadow"
    >
      <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${color}`}>
        <Icon className="h-5 w-5" />
      </div>
      {value === undefined ? (
        <div className="h-9 w-16 animate-pulse rounded bg-muted" />
      ) : (
        <p className="text-3xl font-bold">{value}</p>
      )}
      <p className="text-sm text-muted-foreground leading-tight">{label}</p>
    </Link>
  );
}

export default function ExpedicaoDashboard() {
  const { token } = useAuth();

  const { data } = useQuery<ExpedicaoStats>({
    queryKey: ['expedicao-stats'],
    queryFn: () => fetchExpedicaoStats(token!),
    enabled: !!token,
    refetchInterval: 30_000,
  });

  const cards = [
    {
      label: 'Aguardando Separação',
      value: data?.aguardandoSeparacao,
      href: '/admin/expedicao/fila',
      icon: ClipboardList,
      color: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300',
    },
    {
      label: 'Aguardando NF-e',
      value: data?.aguardandoNFe,
      href: '/admin/expedicao/prontos',
      icon: FileText,
      color: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300',
    },
    {
      label: 'Aguardando Etiqueta',
      value: data?.aguardandoEtiqueta,
      href: '/admin/expedicao/prontos',
      icon: Tag,
      color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
    },
    {
      label: 'Enviados Hoje',
      value: data?.enviadosHoje,
      href: '/admin/expedicao/enviados',
      icon: Truck,
      color: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300',
    },
    {
      label: 'Retiradas Hoje',
      value: data?.retiradosHoje,
      href: '/admin/expedicao/retirada',
      icon: Store,
      color: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300',
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2">
            <Package className="h-5 w-5 text-primary" />
            Dashboard de Expedição
          </h1>
          <p className="text-sm text-muted-foreground mt-1">Atualiza automaticamente a cada 30s</p>
        </div>
        <Link
          href="/admin/expedicao/fila"
          className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 transition-opacity"
        >
          Ir para Fila
          <ArrowRight className="h-4 w-4" />
        </Link>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
        {cards.map((card) => (
          <StatCard key={card.label} {...card} />
        ))}
      </div>
    </div>
  );
}
