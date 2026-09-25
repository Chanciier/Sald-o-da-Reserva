import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { Marketplace, SyncStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { REPORT_TIME_ZONE } from '../analytics/report-range';

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Prazos de retenção (em dias) das tabelas de log que só crescem.
 *
 * - Analytics: 730 dias. Os relatórios aceitam períodos de até 366 dias e
 *   comparam com o período anterior de mesmo tamanho, então 2 anos mantém
 *   qualquer relatório "recente" completo (inclusive visitante recorrente).
 * - Logs de WhatsApp: o prazo de "apagar para todos" é de minutos e o painel
 *   mostra só os 100 últimos envios — 90 dias sobra.
 * - Webhooks e sync de marketplace: só servem pra depuração/replay recente.
 *
 * `audit_logs`, pagamentos, pedidos etc. NÃO entram aqui: são histórico do
 * negócio e ficam pra sempre.
 */
export const RETENTION_DAYS = {
  analyticsSessions: 730,
  whatsappMessageLogs: 90,
  webhookLogs: 90,
  marketplaceSyncLogs: 90,
} as const;

/** Linhas apagadas por lote — evita uma transação gigante na primeira limpeza. */
const BATCH_SIZE = 5000;

export type RetentionSummary = Record<keyof typeof RETENTION_DAYS, number>;

type IdBatchDeleter = {
  findMany(args: { where: unknown; select: { id: true }; take: number }): Promise<{ id: string }[]>;
  deleteMany(args: { where: { id: { in: string[] } } }): Promise<{ count: number }>;
};

/**
 * Limpeza diária das tabelas de log (analytics, webhooks, sync de marketplace,
 * envios de WhatsApp), que antes cresciam sem limite no Postgres.
 *
 * Obs.: o Postgres reaproveita o espaço das linhas apagadas pra dados novos,
 * mas não devolve o arquivo pro disco — o objetivo aqui é parar o crescimento.
 */
@Injectable()
export class DataRetentionService {
  private readonly logger = new Logger(DataRetentionService.name);
  private running = false;

  constructor(private readonly prisma: PrismaService) {}

  @Cron('30 4 * * *', { timeZone: REPORT_TIME_ZONE })
  async handleCron(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      const summary = await this.purge();
      const total = Object.values(summary).reduce((a, b) => a + b, 0);
      if (total > 0) this.logger.log(`Limpeza de logs antigos: ${JSON.stringify(summary)}`);
    } catch (err) {
      this.logger.error('Falha na limpeza de logs antigos', err as Error);
    } finally {
      this.running = false;
    }
  }

  async purge(now: Date = new Date()): Promise<RetentionSummary> {
    const cutoff = (days: number) => new Date(now.getTime() - days * MS_PER_DAY);

    // Sessões levam os eventos junto (onDelete: Cascade em analytics_events).
    const analyticsSessions = await this.deleteInBatches(this.prisma.analyticsSession, {
      startedAt: { lt: cutoff(RETENTION_DAYS.analyticsSessions) },
    });

    const whatsappMessageLogs = await this.deleteInBatches(this.prisma.whatsappMessageLog, {
      sentAt: { lt: cutoff(RETENTION_DAYS.whatsappMessageLogs) },
    });

    const webhookLogs = await this.deleteInBatches(this.prisma.webhookLog, {
      createdAt: { lt: cutoff(RETENTION_DAYS.webhookLogs) },
    });

    // O painel de marketplaces mostra o "último sync com sucesso" de cada canal:
    // preserva esse registro mesmo que seja antigo.
    const keepIds = await this.latestSuccessfulSyncIds();
    const marketplaceSyncLogs = await this.deleteInBatches(this.prisma.marketplaceSyncLog, {
      createdAt: { lt: cutoff(RETENTION_DAYS.marketplaceSyncLogs) },
      ...(keepIds.length ? { id: { notIn: keepIds } } : {}),
    });

    return { analyticsSessions, whatsappMessageLogs, webhookLogs, marketplaceSyncLogs };
  }

  private async latestSuccessfulSyncIds(): Promise<string[]> {
    const latest = await Promise.all(
      Object.values(Marketplace).map((marketplace) =>
        this.prisma.marketplaceSyncLog.findFirst({
          where: { marketplace, status: SyncStatus.SUCCESS },
          orderBy: { finishedAt: 'desc' },
          select: { id: true },
        }),
      ),
    );
    return latest.filter((row): row is { id: string } => !!row).map((row) => row.id);
  }

  private async deleteInBatches(delegate: unknown, where: object): Promise<number> {
    const model = delegate as IdBatchDeleter;
    let deleted = 0;
    for (;;) {
      const rows = await model.findMany({ where, select: { id: true }, take: BATCH_SIZE });
      if (!rows.length) break;
      const { count } = await model.deleteMany({ where: { id: { in: rows.map((r) => r.id) } } });
      deleted += count;
      if (rows.length < BATCH_SIZE) break;
    }
    return deleted;
  }
}
