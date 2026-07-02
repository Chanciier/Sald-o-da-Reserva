'use client';

import { Banknote, PackageCheck, ReceiptText, ShoppingCart } from 'lucide-react';
import { useReports } from '@/components/dashboard/use-reports';
import { SectionGate } from '@/components/admin/section-gate';
import {
  Bars,
  Kpi,
  LoadingReport,
  money,
  Panel,
  percent,
  ReportHeader,
} from '@/components/dashboard/report-ui';

const channels: Record<string, string> = {
  SITE: 'Loja própria',
  MERCADO_LIVRE: 'Mercado Livre',
  SHOPEE: 'Shopee',
};
const methods: Record<string, string> = {
  PIX: 'Pix',
  CREDIT_CARD: 'Cartão de crédito',
  DEBIT_CARD: 'Cartão de débito',
  BOLETO: 'Boleto',
};
const statuses: Record<string, string> = {
  PENDING: 'Pendente',
  CONFIRMED: 'Confirmado',
  PAID: 'Pago',
  SEPARATING: 'Em separação',
  SEPARATED: 'Separado',
  READY_TO_SHIP: 'Pronto para envio',
  SHIPPED: 'Enviado',
  DELIVERED: 'Entregue',
  CANCELLED: 'Cancelado',
  REFUNDED: 'Reembolsado',
};

export default function RelatorioVendasPage() {
  return (
    <SectionGate section="VENDAS">
      <RelatorioVendas />
    </SectionGate>
  );
}

function RelatorioVendas() {
  const report = useReports();
  if (report.isLoading) return <LoadingReport />;
  if (!report.data)
    return (
      <div className="rounded-xl border p-8 text-center text-sm text-muted-foreground">
        Não foi possível carregar o relatório. Tente atualizar.
      </div>
    );
  const { sales, period } = report.data;
  const activeHours = sales.hourly
    .filter((item) => item.orders > 0)
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 8);
  return (
    <div className="space-y-6">
      <ReportHeader
        title="Relatório de vendas"
        description={`Resultados de ${period.from.split('-').reverse().join('/')} a ${period.to.split('-').reverse().join('/')} · fechamento diário em Brasília`}
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
          label="Receita líquida de vendas"
          value={money(sales.revenue)}
          icon={<Banknote className="h-5 w-5" />}
          change={sales.comparison.revenue}
        />
        <Kpi
          label="Pedidos pagos"
          value={sales.paidOrders.toLocaleString('pt-BR')}
          icon={<ShoppingCart className="h-5 w-5" />}
          change={sales.comparison.orders}
          detail={`${sales.allOrders} pedidos criados no período`}
        />
        <Kpi
          label="Ticket médio"
          value={money(sales.avgTicket)}
          icon={<ReceiptText className="h-5 w-5" />}
          detail="Receita ÷ pedidos pagos"
        />
        <Kpi
          label="Itens vendidos"
          value={sales.units.toLocaleString('pt-BR')}
          icon={<PackageCheck className="h-5 w-5" />}
          change={sales.comparison.units}
        />
      </div>
      <div className="grid gap-5 xl:grid-cols-3">
        <div className="xl:col-span-2">
          <Panel
            title="Evolução da receita"
            subtitle="Receita reconhecida por dia no horário de Brasília"
          >
            <Bars
              data={sales.timeline}
              value={(item) => item.revenue}
              label={(item) => item.date.split('-').reverse().slice(0, 2).join('/')}
              format={money}
            />
          </Panel>
        </div>
        <Panel
          title="Saúde dos pedidos"
          subtitle={`${percent(sales.cancellationRate)} cancelados ou reembolsados`}
        >
          <Bars
            data={sales.status}
            value={(item) => item.count}
            label={(item) => statuses[item.name] ?? item.name}
          />
        </Panel>
      </div>
      <div className="grid gap-5 lg:grid-cols-3">
        <Panel title="Receita por canal">
          <Bars
            data={sales.channels}
            value={(item) => item.revenue}
            label={(item) => channels[item.name] ?? item.name}
            format={money}
          />
        </Panel>
        <Panel title="Meios de pagamento">
          <Bars
            data={sales.payments}
            value={(item) => item.revenue}
            label={(item) => methods[item.name] ?? item.name}
            format={money}
          />
        </Panel>
        <Panel title="Horários mais fortes" subtitle="Faixas com maior receita">
          <Bars
            data={activeHours}
            value={(item) => item.revenue}
            label={(item) =>
              `${String(item.hour).padStart(2, '0')}:00–${String((item.hour + 1) % 24).padStart(2, '0')}:00`
            }
            format={money}
          />
        </Panel>
      </div>
    </div>
  );
}
