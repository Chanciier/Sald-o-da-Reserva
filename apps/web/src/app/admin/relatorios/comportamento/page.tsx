'use client';

import { Clock3, LogOut, Repeat2, Target, Users } from 'lucide-react';
import { useBehaviorReport } from '@/components/dashboard/use-behavior-report';
import {
  Bars,
  Funnel,
  Kpi,
  LoadingReport,
  Panel,
  ReportHeader,
  integer,
  percent,
} from '@/components/dashboard/report-ui';

const DEVICE_LABELS: Record<string, string> = {
  MOBILE: 'Celular',
  TABLET: 'Tablet',
  DESKTOP: 'Desktop',
  Desconhecido: 'Desconhecido',
};

function formatDuration(totalSeconds: number) {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = Math.round(totalSeconds % 60);
  return `${minutes}m ${seconds.toString().padStart(2, '0')}s`;
}

export default function RelatorioComportamento() {
  const report = useBehaviorReport();
  if (report.isLoading) return <LoadingReport />;
  if (!report.data)
    return (
      <div className="rounded-xl border p-8 text-center text-sm text-muted-foreground">
        Não foi possível carregar o relatório. Tente atualizar.
      </div>
    );

  const {
    engagement,
    funnel,
    topProducts,
    devices,
    browsers,
    operatingSystems,
    traffic,
    searches,
    timeline,
    period,
  } = report.data;
  const conversionRate = funnel[funnel.length - 1]?.pct ?? 0;

  return (
    <div className="space-y-6">
      <ReportHeader
        title="Comportamento no site"
        description={`Navegação de ${period.from.split('-').reverse().join('/')} a ${period.to.split('-').reverse().join('/')} · sessões anônimas, fechamento diário em Brasília`}
        from={report.from}
        to={report.to}
        draft={report.draft}
        setDraft={report.setDraft}
        apply={report.apply}
        preset={report.preset}
        fetching={report.isFetching}
        refresh={() => report.refetch()}
      />

      {engagement.sessions === 0 ? (
        <div className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
          Nenhuma sessão registrada nesse período ainda.
        </div>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
            <Kpi
              label="Sessões"
              value={integer(engagement.sessions)}
              icon={<Users className="h-5 w-5" />}
              detail={`${integer(engagement.uniqueVisitors)} visitantes únicos`}
            />
            <Kpi
              label="Novos vs. recorrentes"
              value={`${integer(engagement.newVisitors)} novos`}
              icon={<Repeat2 className="h-5 w-5" />}
              detail={`${integer(engagement.returningVisitors)} recorrentes`}
            />
            <Kpi
              label="Duração média"
              value={formatDuration(engagement.avgDurationSeconds)}
              icon={<Clock3 className="h-5 w-5" />}
              detail={`${engagement.avgPageViewsPerSession} páginas por sessão`}
            />
            <Kpi
              label="Taxa de rejeição"
              value={percent(engagement.bounceRate)}
              icon={<LogOut className="h-5 w-5" />}
              detail="1 página vista, sem outra interação"
            />
            <Kpi
              label="Taxa de conversão"
              value={percent(conversionRate)}
              icon={<Target className="h-5 w-5" />}
              detail="sessões que terminaram em compra"
            />
          </div>

          <Panel
            title="Funil de conversão"
            subtitle="Da sessão até a compra, com queda em cada etapa"
          >
            <Funnel steps={funnel} />
          </Panel>

          <div className="grid gap-5 lg:grid-cols-3">
            <Panel title="Mais clicados" subtitle="Cliques em cards de produto nas listagens">
              <Bars data={topProducts.byClicks} value={(p) => p.count} label={(p) => p.name} />
            </Panel>
            <Panel title="Mais visualizados" subtitle="Aberturas da página do produto">
              <Bars data={topProducts.byViews} value={(p) => p.count} label={(p) => p.name} />
            </Panel>
            <Panel
              title="Mais abandonados"
              subtitle="Foram ao carrinho em sessões que não compraram"
            >
              <Bars data={topProducts.mostAbandoned} value={(p) => p.count} label={(p) => p.name} />
            </Panel>
          </div>

          <div className="grid gap-5 lg:grid-cols-3">
            <Panel title="Dispositivo">
              <Bars
                data={devices}
                value={(d) => d.count}
                label={(d) => DEVICE_LABELS[d.name] ?? d.name}
              />
            </Panel>
            <Panel title="Navegador">
              <Bars data={browsers} value={(b) => b.count} label={(b) => b.name} />
            </Panel>
            <Panel title="Sistema operacional">
              <Bars data={operatingSystems} value={(o) => o.count} label={(o) => o.name} />
            </Panel>
          </div>

          <div className="grid gap-5 lg:grid-cols-2">
            <Panel title="Origem do tráfego" subtitle="De onde vêm as sessões">
              <Bars data={traffic.sources} value={(s) => s.count} label={(s) => s.name} />
            </Panel>
            <Panel title="Principais referências" subtitle="Domínios que mais enviam visitantes">
              <Bars data={traffic.topReferrers} value={(r) => r.count} label={(r) => r.name} />
            </Panel>
            <Panel title="Páginas de entrada" subtitle="Onde a sessão começa">
              <Bars data={traffic.topLandingPages} value={(p) => p.count} label={(p) => p.name} />
            </Panel>
            <Panel title="Páginas de saída" subtitle="Onde a sessão termina — pista de desistência">
              <Bars data={traffic.topExitPages} value={(p) => p.count} label={(p) => p.name} />
            </Panel>
          </div>

          <div className="grid gap-5 lg:grid-cols-2">
            <Panel title="Termos mais buscados">
              <Bars data={searches.topTerms} value={(t) => t.count} label={(t) => t.term} />
            </Panel>
            <Panel
              title="Buscas sem resultado"
              subtitle="Demanda que a loja não está atendendo hoje"
            >
              <Bars data={searches.zeroResults} value={(t) => t.count} label={(t) => t.term} />
            </Panel>
          </div>

          <Panel title="Sessões por dia">
            <Bars
              data={timeline}
              value={(t) => t.sessions}
              label={(t) => t.date.split('-').reverse().slice(0, 2).join('/')}
            />
          </Panel>

          <div className="rounded-xl border border-dashed border-border bg-muted/30 p-5 text-sm text-muted-foreground">
            <p className="font-medium text-foreground">Faixa etária e gênero</p>
            <p className="mt-1">
              O site não pergunta idade nem gênero, então não é possível mostrar isso aqui de forma
              direta e confiável. O caminho padrão do mercado é o Meta Ads Manager / Business Suite
              (Estatísticas do público), que agrega faixa etária e gênero de forma anônima a partir
              do Pixel e da Conversions API. As credenciais de Meta já estão previstas nas variáveis
              de ambiente do projeto, mas o disparo dos eventos de navegação (visualização de
              produto, carrinho, compra) para o Pixel ainda não foi implementado no site — é um bom
              próximo passo se isso for prioridade.
            </p>
          </div>
        </>
      )}
    </div>
  );
}
