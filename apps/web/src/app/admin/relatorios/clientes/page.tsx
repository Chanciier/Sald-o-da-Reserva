'use client';

import { BadgeDollarSign, Repeat2, UserPlus, Users } from 'lucide-react';
import { useReports } from '@/components/dashboard/use-reports';
import {
  Empty,
  Kpi,
  LoadingReport,
  money,
  Panel,
  percent,
  ReportHeader,
} from '@/components/dashboard/report-ui';

export default function RelatorioClientes() {
  const report = useReports();
  if (report.isLoading) return <LoadingReport />;
  if (!report.data)
    return (
      <div className="rounded-xl border p-8 text-center text-sm text-muted-foreground">
        Não foi possível carregar o relatório.
      </div>
    );
  const { customers } = report.data;
  return (
    <div className="space-y-6">
      <ReportHeader
        title="Relatório de clientes"
        description="Aquisição, recorrência, valor por comprador e clientes de maior impacto"
        from={report.from}
        to={report.to}
        draft={report.draft}
        setDraft={report.setDraft}
        apply={report.apply}
        preset={report.preset}
        fetching={report.isFetching}
        refresh={() => report.refetch()}
      />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi
          label="Compradores no período"
          value={customers.buyers.toLocaleString('pt-BR')}
          icon={<Users className="h-5 w-5" />}
          detail={`${customers.total.toLocaleString('pt-BR')} clientes cadastrados na base`}
        />
        <Kpi
          label="Novos clientes"
          value={customers.newCustomers.toLocaleString('pt-BR')}
          icon={<UserPlus className="h-5 w-5" />}
          detail="Cadastro e pedido dentro do período"
        />
        <Kpi
          label="Clientes recorrentes"
          value={customers.repeatCustomers.toLocaleString('pt-BR')}
          icon={<Repeat2 className="h-5 w-5" />}
          detail={`${percent(customers.repeatRate)} dos compradores fizeram 2+ pedidos`}
        />
        <Kpi
          label="Receita por comprador"
          value={money(customers.revenuePerBuyer)}
          icon={<BadgeDollarSign className="h-5 w-5" />}
        />
      </div>
      <Panel
        title="Clientes de maior valor"
        subtitle="Ranking por receita gerada no período selecionado"
      >
        {!customers.top.length ? (
          <Empty />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead>
                <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="pb-3 font-medium">Cliente</th>
                  <th className="pb-3 font-medium">Contato</th>
                  <th className="pb-3 text-right font-medium">Pedidos</th>
                  <th className="pb-3 text-right font-medium">Receita</th>
                  <th className="pb-3 text-right font-medium">Última compra</th>
                </tr>
              </thead>
              <tbody>
                {customers.top.map((customer, index) => (
                  <tr key={customer.id} className="border-b last:border-0">
                    <td className="py-3 font-medium">
                      <span className="mr-3 inline-flex h-7 w-7 items-center justify-center rounded-full bg-primary/10 text-xs text-primary">
                        {index + 1}
                      </span>
                      {customer.name}
                    </td>
                    <td className="py-3 text-muted-foreground">{customer.email}</td>
                    <td className="py-3 text-right">{customer.orders}</td>
                    <td className="py-3 text-right font-semibold">{money(customer.spent)}</td>
                    <td className="py-3 text-right text-muted-foreground">
                      {new Date(customer.lastOrderAt).toLocaleDateString('pt-BR', {
                        timeZone: 'America/Sao_Paulo',
                      })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </div>
  );
}
