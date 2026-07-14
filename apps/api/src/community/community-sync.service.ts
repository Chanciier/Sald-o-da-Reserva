import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { CommunityGroupStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { BaileysService } from '../whatsapp/baileys.service';
import { CommunityService } from './community.service';

export interface SyncSummary {
  connected: boolean;
  synced: number;
  notFound: number;
  unlinked: number;
  errors: number;
  finishedAt: string;
}

/**
 * Mantém os contadores de participantes espelhados do WhatsApp:
 *
 *  - cron a cada 10 min: `groupFetchAllParticipating` → atualiza participantes,
 *    lastSyncAt, flipa ACTIVE↔FULL e grava snapshot de crescimento;
 *  - tempo real: evento `group-participants.update` ajusta o contador entre
 *    as syncs (entrou/saiu alguém);
 *  - desconectado: nada quebra — o hub continua servindo os últimos números
 *    conhecidos do banco.
 */
@Injectable()
export class CommunitySyncService implements OnModuleInit {
  private readonly logger = new Logger(CommunitySyncService.name);
  private syncing = false;
  private lastSummary: SyncSummary | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly baileys: BaileysService,
    private readonly community: CommunityService,
  ) {}

  onModuleInit() {
    this.baileys.onGroupParticipantsUpdate((update) => {
      if (update.action !== 'add' && update.action !== 'remove') return;
      const delta = (update.action === 'add' ? 1 : -1) * update.participants.length;
      void this.applyRealtimeDelta(update.jid, delta);
    });
  }

  getLastSummary(): SyncSummary | null {
    return this.lastSummary;
  }

  @Cron(CronExpression.EVERY_10_MINUTES)
  async handleCron(): Promise<void> {
    await this.syncAll('cron');
  }

  async syncAll(trigger: 'cron' | 'manual'): Promise<SyncSummary> {
    if (this.syncing) {
      this.logger.warn('Sync já em andamento — ignorando disparo concorrente');
      return this.lastSummary ?? this.summary(false, 0, 0, 0, 0);
    }
    this.syncing = true;
    try {
      return await this.doSync(trigger);
    } finally {
      this.syncing = false;
    }
  }

  private async doSync(trigger: 'cron' | 'manual'): Promise<SyncSummary> {
    const linked = await this.prisma.communityGroup.findMany({
      where: { groupJid: { not: null } },
    });
    const unlinkedCount = await this.prisma.communityGroup.count({ where: { groupJid: null } });

    if (!this.baileys.isReady()) {
      if (trigger === 'manual' || linked.length > 0) {
        this.logger.warn('WhatsApp desconectado — sync adiada, servindo últimos dados do banco');
      }
      this.lastSummary = this.summary(false, 0, 0, unlinkedCount, 0);
      return this.lastSummary;
    }

    let metadataByJid: Map<string, { size: number; subject: string }>;
    try {
      const all = await this.baileys.fetchAllGroupsMetadata();
      metadataByJid = new Map(all.map((g) => [g.id, { size: g.size, subject: g.subject }]));
    } catch (err) {
      this.logger.error('Falha ao buscar metadados dos grupos no WhatsApp', err as Error);
      this.lastSummary = this.summary(true, 0, 0, unlinkedCount, linked.length);
      return this.lastSummary;
    }

    const now = new Date();
    let synced = 0;
    let notFound = 0;
    let errors = 0;

    for (const group of linked) {
      const meta = metadataByJid.get(group.groupJid as string);
      try {
        if (!meta) {
          notFound += 1;
          await this.prisma.communityGroup.update({
            where: { id: group.id },
            data: {
              lastSyncAt: now,
              syncError:
                'Grupo não encontrado na conta conectada — verifique se o número do site ainda participa dele.',
            },
          });
          continue;
        }

        const status = this.nextStatus(group.status, meta.size, group.capacity);
        await this.prisma.communityGroup.update({
          where: { id: group.id },
          data: { participants: meta.size, status, lastSyncAt: now, syncError: null },
        });

        // Snapshot só quando o total muda — histórico de crescimento enxuto.
        if (meta.size !== group.participants) {
          await this.prisma.communityGroupSnapshot.create({
            data: { groupId: group.id, participants: meta.size },
          });
        }
        synced += 1;
      } catch (err) {
        errors += 1;
        this.logger.error(`Falha ao sincronizar grupo ${group.name}`, err as Error);
      }
    }

    // Números reais assumiram: zera contadores otimistas e o cache.
    await this.community.clearPendingCounts();
    await this.community.invalidateCache();

    this.lastSummary = this.summary(true, synced, notFound, unlinkedCount, errors);
    this.logger.log(
      `Sync (${trigger}): ${synced} sincronizados, ${notFound} não encontrados, ` +
        `${unlinkedCount} sem vínculo, ${errors} erros`,
    );
    return this.lastSummary;
  }

  private async applyRealtimeDelta(groupJid: string, delta: number): Promise<void> {
    try {
      const group = await this.prisma.communityGroup.findUnique({ where: { groupJid } });
      if (!group) return;

      const participants = Math.max(0, group.participants + delta);
      const status = this.nextStatus(group.status, participants, group.capacity);
      await this.prisma.communityGroup.update({
        where: { id: group.id },
        data: { participants, status },
      });
      await this.community.invalidateCache();
      this.logger.debug(
        `Ajuste em tempo real: ${group.name} ${delta > 0 ? '+' : ''}${delta} → ${participants}`,
      );
    } catch (err) {
      this.logger.error('Falha ao aplicar ajuste em tempo real de participantes', err as Error);
    }
  }

  /** Flipa ACTIVE↔FULL pela ocupação; PAUSED/ARCHIVED são manuais. */
  private nextStatus(
    current: CommunityGroupStatus,
    participants: number,
    capacity: number,
  ): CommunityGroupStatus {
    if (current === CommunityGroupStatus.PAUSED || current === CommunityGroupStatus.ARCHIVED) {
      return current;
    }
    return participants >= capacity ? CommunityGroupStatus.FULL : CommunityGroupStatus.ACTIVE;
  }

  private summary(
    connected: boolean,
    synced: number,
    notFound: number,
    unlinked: number,
    errors: number,
  ): SyncSummary {
    return {
      connected,
      synced,
      notFound,
      unlinked,
      errors,
      finishedAt: new Date().toISOString(),
    };
  }
}
