'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import {
  Package,
  FileText,
  Tag,
  Truck,
  Store,
  ArrowRight,
  ClipboardList,
  PackageCheck,
  Send,
  CheckCircle2,
  Clock,
} from 'lucide-react';
import { useAuth } from '@/contexts/auth-context';
import { fetchExpedicaoStats } from '@/actions/expedicao';
import type { ExpedicaoStats } from '@/actions/expedicao';

interface StatRowProps {
  label: string;
  value: number | undefined;
  href: string;
  icon: React.ElementType;
  color: string;
}

function StatRow({ label, value, href, icon: Icon, color }: StatRowProps) {
  return (
    <Link
      href={href}
      className="flex items-center gap-3 rounded-lg border bg-card px-4 py-3 hover:bg-muted/40 transition-colors"
    >
      <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${color}`}>
        <Icon className="h-5 w-5" />
      </div>
      <span className="flex-1 text-sm text-muted-foreground leading-tight">{label}</span>
      {value === undefined ? (
        <span className="h-7 w-9 animate-pulse rounded bg-muted" />
      ) : (
        <span className="text-2xl font-bold tabular-nums">{value}</span>
      )}
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

      {/* Pendências operacionais (atravessa os dois fluxos) */}
      <div className="grid grid-cols-2 gap-3 sm:max-w-md">
        <StatRow
          label="Aguardando NF-e"
          value={data?.aguardandoNFe}
          href="/admin/expedicao/prontos"
          icon={FileText}
          color="bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300"
        />
        <StatRow
          label="Aguardando Etiqueta"
          value={data?.aguardandoEtiqueta}
          href="/admin/expedicao/prontos"
          icon={Tag}
          color="bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300"
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* ENVIO */}
        <section className="space-y-3">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300">
              <Truck className="h-5 w-5" />
            </div>
            <h2 className="font-semibold">Envio</h2>
            <span className="text-xs text-muted-foreground">entrega por transportadora</span>
          </div>
          <div className="space-y-2">
            <StatRow
              label="Aguardando separação"
              value={data?.envio.aguardandoSeparacao}
              href="/admin/expedicao/fila?tipo=SHIPPING"
              icon={ClipboardList}
              color="bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300"
            />
            <StatRow
              label="Em separação"
              value={data?.envio.emSeparacao}
              href="/admin/expedicao/separacao?tipo=SHIPPING"
              icon={PackageCheck}
              color="bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300"
            />
            <StatRow
              label="Prontos para postar"
              value={data?.envio.prontos}
              href="/admin/expedicao/prontos?tipo=SHIPPING"
              icon={Tag}
              color="bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300"
            />
            <StatRow
              label="Em trânsito"
              value={data?.envio.emTransito}
              href="/admin/expedicao/enviados"
              icon={Send}
              color="bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300"
            />
            <StatRow
              label="Entregues hoje"
              value={data?.envio.entreguesHoje}
              href="/admin/expedicao/concluidos?tipo=SHIPPING"
              icon={CheckCircle2}
              color="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300"
            />
          </div>
        </section>

        {/* RETIRADA */}
        <section className="space-y-3">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300">
              <Store className="h-5 w-5" />
            </div>
            <h2 className="font-semibold">Retirada na loja</h2>
            <span className="text-xs text-muted-foreground">cliente busca no balcão</span>
          </div>
          <div className="space-y-2">
            <StatRow
              label="Aguardando separação"
              value={data?.retirada.aguardandoSeparacao}
              href="/admin/expedicao/fila?tipo=PICKUP"
              icon={ClipboardList}
              color="bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300"
            />
            <StatRow
              label="Em separação"
              value={data?.retirada.emSeparacao}
              href="/admin/expedicao/separacao?tipo=PICKUP"
              icon={PackageCheck}
              color="bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300"
            />
            <StatRow
              label="Aguardando retirada"
              value={data?.retirada.aguardandoRetirada}
              href="/admin/expedicao/retirada"
              icon={Clock}
              color="bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-300"
            />
            <StatRow
              label="Retiradas hoje"
              value={data?.retirada.retiradosHoje}
              href="/admin/expedicao/concluidos?tipo=PICKUP"
              icon={CheckCircle2}
              color="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300"
            />
          </div>
        </section>
      </div>
    </div>
  );
}
