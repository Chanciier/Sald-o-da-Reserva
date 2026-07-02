'use client';

import { Boxes, CircleDollarSign, PackageCheck, TriangleAlert } from 'lucide-react';
import { useReports } from '@/components/dashboard/use-reports';
import {
  Bars,
  Empty,
  Kpi,
  LoadingReport,
  money,
  Panel,
  ReportHeader,
} from '@/components/dashboard/report-ui';
import { SectionGate } from '@/components/admin/section-gate';

export default function RelatorioProdutosPage() {
  return (
    <SectionGate section="RELATORIOS">
      <RelatorioProdutos />
    </SectionGate>
  );
}

function RelatorioProdutos() {
  const report = useReports();
  if (report.isLoading) return <LoadingReport />;
  if (!report.data)
    return (
      <div className="rounded-xl border p-8 text-center text-sm text-muted-foreground">
        Não foi possível carregar o relatório.
      </div>
    );
  const { products } = report.data;
  return (
    <div className="space-y-6">
      <ReportHeader
        title="Relatório de produtos"
        description="Performance do catálogo, categorias e riscos de estoque no período"
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
          label="Receita dos produtos"
          value={money(products.revenue)}
          icon={<CircleDollarSign className="h-5 w-5" />}
        />
        <Kpi
          label="Unidades vendidas"
          value={products.units.toLocaleString('pt-BR')}
          icon={<PackageCheck className="h-5 w-5" />}
        />
        <Kpi
          label="Valor em estoque"
          value={money(products.inventoryValue)}
          icon={<Boxes className="h-5 w-5" />}
          detail={`${products.active} produtos ativos`}
        />
        <Kpi
          label="Estoque crítico"
          value={products.lowStockCount.toLocaleString('pt-BR')}
          icon={<TriangleAlert className="h-5 w-5" />}
          detail="No mínimo ou abaixo dele"
        />
      </div>
      <div className="grid gap-5 xl:grid-cols-2">
        <Panel title="Produtos com maior receita" subtitle="Ranking limitado aos 20 primeiros">
          <Bars
            data={products.top.slice(0, 10)}
            value={(item) => item.revenue}
            label={(item) => `${item.name} · ${item.sold} un.`}
            format={money}
          />
        </Panel>
        <Panel title="Desempenho por categoria" subtitle="Receita e unidades no período">
          <Bars
            data={products.categories}
            value={(item) => item.revenue}
            label={(item) => `${item.name} · ${item.sold} un.`}
            format={money}
          />
        </Panel>
      </div>
      <Panel
        title="Produtos que pedem reposição"
        subtitle="Estoque atual igual ou inferior ao mínimo configurado"
      >
        {!products.lowStock.length ? (
          <Empty />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[600px] text-sm">
              <thead>
                <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="pb-3 font-medium">Produto</th>
                  <th className="pb-3 font-medium">SKU</th>
                  <th className="pb-3 text-right font-medium">Atual</th>
                  <th className="pb-3 text-right font-medium">Mínimo</th>
                  <th className="pb-3 text-right font-medium">Déficit</th>
                </tr>
              </thead>
              <tbody>
                {products.lowStock.map((item) => (
                  <tr key={item.id} className="border-b last:border-0">
                    <td className="py-3 font-medium">{item.name}</td>
                    <td className="py-3 text-muted-foreground">{item.sku}</td>
                    <td className="py-3 text-right font-semibold text-red-700">{item.stock}</td>
                    <td className="py-3 text-right">{item.minimumStock}</td>
                    <td className="py-3 text-right">
                      {Math.max(item.minimumStock - item.stock, 0)}
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
