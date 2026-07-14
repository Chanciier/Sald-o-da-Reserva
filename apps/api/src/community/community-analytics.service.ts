import { BadRequestException, Injectable } from '@nestjs/common';
import { CommunityRedirectOutcome } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { brazilDateKey, REPORT_TIME_ZONE } from '../analytics/report-range';

const MAX_DAYS = 180;

@Injectable()
export class CommunityAnalyticsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Visão consolidada do link único:
   *  - acessos totais e por dia (fuso de Brasília, como os demais relatórios);
   *  - redirecionamentos por grupo;
   *  - acessos que caíram em "todos lotados";
   *  - conversão por origem (UTM);
   *  - histórico de crescimento (snapshots das syncs).
   */
  async overview(daysParam?: string) {
    const days = daysParam ? parseInt(daysParam, 10) : 30;
    if (!Number.isFinite(days) || days < 1 || days > MAX_DAYS) {
      throw new BadRequestException(`Informe um período entre 1 e ${MAX_DAYS} dias.`);
    }
    const since = new Date(Date.now() - days * 86_400_000);

    const [redirects, groups, snapshots] = await Promise.all([
      this.prisma.communityRedirect.findMany({
        where: { createdAt: { gte: since } },
        select: {
          groupId: true,
          outcome: true,
          utmSource: true,
          utmMedium: true,
          utmCampaign: true,
          createdAt: true,
        },
        orderBy: { createdAt: 'asc' },
      }),
      this.prisma.communityGroup.findMany({
        select: { id: true, name: true },
      }),
      this.prisma.communityGroupSnapshot.findMany({
        where: { capturedAt: { gte: since } },
        select: { groupId: true, participants: true, capturedAt: true },
        orderBy: { capturedAt: 'asc' },
      }),
    ]);

    const groupNames = new Map(groups.map((g) => [g.id, g.name]));

    const byDay = new Map<string, { accesses: number; redirected: number; allFull: number }>();
    const byGroup = new Map<string, number>();
    const bySource = new Map<string, { accesses: number; redirected: number }>();

    for (const r of redirects) {
      const day = brazilDateKey(r.createdAt);
      const dayRow = byDay.get(day) ?? { accesses: 0, redirected: 0, allFull: 0 };
      dayRow.accesses += 1;
      if (r.outcome === CommunityRedirectOutcome.REDIRECTED) dayRow.redirected += 1;
      else dayRow.allFull += 1;
      byDay.set(day, dayRow);

      if (r.groupId) byGroup.set(r.groupId, (byGroup.get(r.groupId) ?? 0) + 1);

      const source = r.utmSource?.trim() || 'direto';
      const sourceRow = bySource.get(source) ?? { accesses: 0, redirected: 0 };
      sourceRow.accesses += 1;
      if (r.outcome === CommunityRedirectOutcome.REDIRECTED) sourceRow.redirected += 1;
      bySource.set(source, sourceRow);
    }

    const totalAccesses = redirects.length;
    const totalRedirected = redirects.filter(
      (r) => r.outcome === CommunityRedirectOutcome.REDIRECTED,
    ).length;

    return {
      period: { days, since: since.toISOString(), timeZone: REPORT_TIME_ZONE },
      totals: {
        accesses: totalAccesses,
        redirected: totalRedirected,
        allFull: totalAccesses - totalRedirected,
      },
      byDay: [...byDay.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([date, row]) => ({ date, ...row })),
      byGroup: [...byGroup.entries()]
        .map(([groupId, count]) => ({
          groupId,
          name: groupNames.get(groupId) ?? '(grupo removido)',
          redirects: count,
        }))
        .sort((a, b) => b.redirects - a.redirects),
      bySource: [...bySource.entries()]
        .map(([source, row]) => ({ source, ...row }))
        .sort((a, b) => b.accesses - a.accesses),
      growth: snapshots.map((s) => ({
        groupId: s.groupId,
        name: groupNames.get(s.groupId) ?? '(grupo removido)',
        participants: s.participants,
        capturedAt: s.capturedAt.toISOString(),
      })),
    };
  }
}
