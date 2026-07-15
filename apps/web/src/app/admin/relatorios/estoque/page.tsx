'use client';

import {
  Banknote,
  CircleDollarSign,
  Clock,
  Gauge,
  Package,
  PackageCheck,
  PackageX,
  Percent,
  Sparkles,
  Tag,
  TriangleAlert,
} from 'lucide-react';
import { useStockReport } from '@/components/dashboard/use-reports';
import {
  Bars,
  Empty,
  Kpi,
  LoadingReport,
  money,
  Panel,
  percent,
  ReportHeader,
} from '@/components/dashboard/report-ui';
import { SectionGate } from '@/components/admin/section-gate';

const statusLabels: Record<string, string> = {
  ACTIVE: 'Ativo',
  INACTIVE: 'Inativo',
  OUT_OF_STOCK: 'Sem estoque',
  DRAFT: 'Rascunho',
  ARCHIVED: 'Arquivado',
};

export default function RelatorioEstoquePage() {
  return (
    <SectionGate section="RELATORIOS">
      <RelatorioEstoque />
    </SectionGate>
  );
}

function RelatorioEstoque() {
  const report = useStockReport();
  if (report.isLoading) return <LoadingReport />;
  if (!report.data)
    return (
      <div className="rounded-xl border p-8 text-center text-sm text-muted-foreground">
        Não foi possível carregar o relatório.
      </div>
    );
  const {
    summary,
    turnover,
    byCategory,
    byStatus,
    aging,
    topValue,
    stagnant,
    lowStock,
    outOfStock,
    timeline,
  } = report.data;

  return (
    <div className="space-y-6">
      <ReportHeader
        title="Relatório de estoque"
        description="Valores, saúde e giro do estoque atual, com vendas do período para medir movimentação"
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
          label="Valor em estoque (praticado)"
          value={money(summary.valueAtSalePrice)}
          icon={<CircleDollarSign className="h-5 w-5" />}
          detail={`${summary.totalUnits.toLocaleString('pt-BR')} unidades em ${summary.totalSkus.toLocaleString('pt-BR')} SKUs`}
        />
        <Kpi
          label="Valor em estoque (preço cheio)"
          value={money(summary.valueAtPrice)}
          icon={<Tag className="h-5 w-5" />}
          detail="Sem descontos aplicados"
        />
        <Kpi
          label="Desconto comprometido"
          value={money(summary.markdownValue)}
          icon={<Percent className="h-5 w-5" />}
          detail="Diferença entre preço cheio e preço praticado no estoque atual"
        />
        <Kpi
          label="Valor médio por unidade"
          value={money(summary.avgUnitValue)}
          icon={<Package className="h-5 w-5" />}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi
          label="Estoque saudável"
          value={summary.healthyStockCount.toLocaleString('pt-BR')}
          icon={<PackageCheck className="h-5 w-5" />}
          detail="Acima do mínimo configurado"
        />
        <Kpi
          label="Estoque crítico"
          value={summary.lowStockCount.toLocaleString('pt-BR')}
          icon={<TriangleAlert className="h-5 w-5" />}
          detail="No mínimo ou abaixo dele"
        />
        <Kpi
          label="Sem estoque"
          value={summary.outOfStockCount.toLocaleString('pt-BR')}
          icon={<PackageX className="h-5 w-5" />}
        />
        <Kpi
          label="Peças únicas"
          value={summary.uniqueItemsCount.toLocaleString('pt-BR')}
          icon={<Sparkles className="h-5 w-5" />}
          detail={money(summary.uniqueItemsValue)}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi
          label="Unidades vendidas no período"
          value={turnover.unitsSoldInPeriod.toLocaleString('pt-BR')}
          icon={<PackageCheck className="h-5 w-5" />}
        />
        <Kpi
          label="Receita do período"
          value={money(turnover.revenueInPeriod)}
          icon={<Banknote className="h-5 w-5" />}
        />
        <Kpi
          label="Taxa de giro"
          value={percent(turnover.sellThroughRate)}
          icon={<Gauge className="h-5 w-5" />}
          detail="Vendido ÷ (vendido + estoque atual)"
        />
        <Kpi
          label="Estoque para"
          value={
            turnover.daysOfInventory != null ? `${Math.round(turnover.daysOfInventory)} dias` : '—'
          }
          icon={<Clock className="h-5 w-5" />}
          detail="No ritmo de vendas do período selecionado"
        />
      </div>

      <div className="grid gap-5 xl:grid-cols-2">
        <Panel title="Valor em estoque por categoria" subtitle="Preço praticado × unidades atuais">
          <Bars
            data={byCategory}
            value={(item) => item.value}
            label={(item) => `${item.name} · ${item.units} un.`}
            format={money}
          />
        </Panel>
        <Panel title="Valor em estoque por status" subtitle="Situação de publicação do produto">
          <Bars
            data={byStatus}
            value={(item) => item.value}
            label={(item) => `${statusLabels[item.status] ?? item.status} · ${item.count} SKUs`}
            format={money}
          />
        </Panel>
      </div>

      <div className="grid gap-5 xl:grid-cols-2">
        <Panel
          title="Envelhecimento do estoque"
          subtitle="Valor parado por tempo de catálogo desde o cadastro"
        >
          <Bars
            data={aging}
            value={(item) => item.value}
            label={(item) => `${item.bucket} · ${item.count} SKUs`}
            format={money}
          />
        </Panel>
        <Panel
          title="Vendas no período"
          subtitle="Receita reconhecida por dia, horário de Brasília"
        >
          <Bars
            data={timeline}
            value={(item) => item.revenue}
            label={(item) => item.date.split('-').reverse().slice(0, 2).join('/')}
            format={money}
          />
        </Panel>
      </div>

      <Panel
        title="Maior valor parado em estoque"
        subtitle="Produtos com maior valor de estoque (preço praticado × unidades), ranking limitado aos 20 primeiros"
      >
        {!topValue.length ? (
          <Empty />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead>
                <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="pb-3 font-medium">Produto</th>
                  <th className="pb-3 font-medium">SKU</th>
                  <th className="pb-3 font-medium">Categoria</th>
                  <th className="pb-3 text-right font-medium">Estoque</th>
                  <th className="pb-3 text-right font-medium">Preço unit.</th>
                  <th className="pb-3 text-right font-medium">Valor total</th>
                </tr>
              </thead>
              <tbody>
                {topValue.map((item) => (
                  <tr key={item.id} className="border-b last:border-0">
                    <td className="py-3 font-medium">{item.name}</td>
                    <td className="py-3 text-muted-foreground">{item.sku}</td>
                    <td className="py-3 text-muted-foreground">{item.category}</td>
                    <td className="py-3 text-right">{item.stock}</td>
                    <td className="py-3 text-right">{money(item.unitPrice)}</td>
                    <td className="py-3 text-right font-semibold">{money(item.value)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      <Panel
        title="Estoque parado no período"
        subtitle="Produtos com estoque disponível que não venderam nenhuma unidade no período selecionado"
      >
        {!stagnant.length ? (
          <Empty />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="pb-3 font-medium">Produto</th>
                  <th className="pb-3 font-medium">SKU</th>
                  <th className="pb-3 text-right font-medium">Estoque</th>
                  <th className="pb-3 text-right font-medium">Dias no catálogo</th>
                  <th className="pb-3 text-right font-medium">Valor parado</th>
                </tr>
              </thead>
              <tbody>
                {stagnant.map((item) => (
                  <tr key={item.id} className="border-b last:border-0">
                    <td className="py-3 font-medium">{item.name}</td>
                    <td className="py-3 text-muted-foreground">{item.sku}</td>
                    <td className="py-3 text-right">{item.stock}</td>
                    <td className="py-3 text-right">{item.daysListed}</td>
                    <td className="py-3 text-right font-semibold text-amber-700">
                      {money(item.value)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      <div className="grid gap-5 xl:grid-cols-2">
        <Panel
          title="Estoque crítico"
          subtitle="Estoque atual igual ou inferior ao mínimo configurado"
        >
          {!lowStock.length ? (
            <Empty />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] text-sm">
                <thead>
                  <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="pb-3 font-medium">Produto</th>
                    <th className="pb-3 text-right font-medium">Atual</th>
                    <th className="pb-3 text-right font-medium">Mínimo</th>
                    <th className="pb-3 text-right font-medium">Valor</th>
                  </tr>
                </thead>
                <tbody>
                  {lowStock.map((item) => (
                    <tr key={item.id} className="border-b last:border-0">
                      <td className="py-3 font-medium">
                        {item.name}
                        <span className="ml-2 text-xs text-muted-foreground">{item.sku}</span>
                      </td>
                      <td className="py-3 text-right font-semibold text-red-700">{item.stock}</td>
                      <td className="py-3 text-right">{item.minimumStock}</td>
                      <td className="py-3 text-right">{money(item.value)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
        <Panel title="Sem estoque" subtitle="Produtos com estoque zerado no momento">
          {!outOfStock.length ? (
            <Empty />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[480px] text-sm">
                <thead>
                  <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="pb-3 font-medium">Produto</th>
                    <th className="pb-3 font-medium">Status</th>
                    <th className="pb-3 text-right font-medium">Mínimo</th>
                  </tr>
                </thead>
                <tbody>
                  {outOfStock.map((item) => (
                    <tr key={item.id} className="border-b last:border-0">
                      <td className="py-3 font-medium">
                        {item.name}
                        <span className="ml-2 text-xs text-muted-foreground">{item.sku}</span>
                      </td>
                      <td className="py-3 text-muted-foreground">
                        {statusLabels[item.status] ?? item.status}
                      </td>
                      <td className="py-3 text-right">{item.minimumStock}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
      </div>
    </div>
  );
}
