import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AnalyticsEventType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { brazilDateKey, parseReportRange, REPORT_TIME_ZONE } from './report-range';
import { classifyTrafficSource, referrerHost } from './traffic-source';

type Counter = Map<string, number>;
type Range = ReturnType<typeof parseReportRange>;

function bump(map: Counter, key: string | null | undefined, amount = 1) {
  if (!key) return;
  map.set(key, (map.get(key) ?? 0) + amount);
}

function topEntries(map: Counter, limit: number) {
  return [...map.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([name, count]) => ({ name, count }));
}

const FUNNEL_EVENT_STEPS: { type: AnalyticsEventType; label: string }[] = [
  { type: AnalyticsEventType.PRODUCT_VIEW, label: 'Visualizou produto' },
  { type: AnalyticsEventType.ADD_TO_CART, label: 'Adicionou ao carrinho' },
  { type: AnalyticsEventType.CHECKOUT_START, label: 'Iniciou checkout' },
  { type: AnalyticsEventType.PURCHASE, label: 'Comprou' },
];

@Injectable()
export class BehaviorService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  async overview(from?: string, to?: string) {
    const range = parseReportRange(from, to);
    const frontendHost = this.hostOf(this.config.get<string>('FRONTEND_URL', ''));

    const sessions = await this.prisma.analyticsSession.findMany({
      where: { startedAt: { gte: range.start, lt: range.endExclusive } },
      select: {
        visitorId: true,
        startedAt: true,
        durationSeconds: true,
        pageViews: true,
        device: true,
        browser: true,
        os: true,
        referrer: true,
        utmSource: true,
        landingPath: true,
        exitPath: true,
        converted: true,
        events: { select: { type: true, productId: true, metadata: true } },
      },
    });

    if (!sessions.length) return this.empty(range);

    const visitorIds = [...new Set(sessions.map((s) => s.visitorId))];
    const priorSessions = await this.prisma.analyticsSession.findMany({
      where: { visitorId: { in: visitorIds }, startedAt: { lt: range.start } },
      select: { visitorId: true },
      distinct: ['visitorId'],
    });
    const returningVisitorIds = new Set(priorSessions.map((s) => s.visitorId));

    const deviceCounts: Counter = new Map();
    const browserCounts: Counter = new Map();
    const osCounts: Counter = new Map();
    const sourceCounts: Counter = new Map();
    const referrerCounts: Counter = new Map();
    const landingCounts: Counter = new Map();
    const exitCounts: Counter = new Map();
    const searchTerms: Counter = new Map();
    const zeroResultTerms: Counter = new Map();
    const productClicks: Counter = new Map();
    const productViews: Counter = new Map();
    const abandonedCarts: Counter = new Map();
    const dailySessions: Counter = new Map();
    const dailyPageViews: Counter = new Map();
    const funnelCounts = new Map<AnalyticsEventType, number>();

    let totalDuration = 0;
    let totalPageViews = 0;
    let bounced = 0;

    for (const session of sessions) {
      totalDuration += session.durationSeconds;
      totalPageViews += session.pageViews;
      const day = brazilDateKey(session.startedAt);
      bump(dailySessions, day);
      bump(dailyPageViews, day, session.pageViews);

      bump(deviceCounts, session.device ?? 'Desconhecido');
      bump(browserCounts, session.browser ?? 'Desconhecido');
      bump(osCounts, session.os ?? 'Desconhecido');
      bump(sourceCounts, classifyTrafficSource(session.referrer, session.utmSource, frontendHost));
      const host = referrerHost(session.referrer);
      if (host && host !== frontendHost) bump(referrerCounts, host);
      bump(landingCounts, session.landingPath);
      bump(exitCounts, session.exitPath);

      if (session.pageViews <= 1 && session.events.length <= 1) bounced += 1;

      const typesInSession = new Set(session.events.map((e) => e.type));
      for (const step of FUNNEL_EVENT_STEPS) {
        if (typesInSession.has(step.type)) {
          funnelCounts.set(step.type, (funnelCounts.get(step.type) ?? 0) + 1);
        }
      }

      const cartProductsThisSession = new Set<string>();
      for (const event of session.events) {
        if (event.type === AnalyticsEventType.PRODUCT_CLICK && event.productId) {
          bump(productClicks, event.productId);
        }
        if (event.type === AnalyticsEventType.PRODUCT_VIEW && event.productId) {
          bump(productViews, event.productId);
        }
        if (event.type === AnalyticsEventType.ADD_TO_CART && event.productId) {
          cartProductsThisSession.add(event.productId);
        }
        if (event.type === AnalyticsEventType.SEARCH) {
          const meta = event.metadata as unknown as
            | { term?: string; resultsCount?: number }
            | undefined;
          const term = meta?.term?.trim().toLowerCase();
          if (term) {
            bump(searchTerms, term);
            if (meta?.resultsCount === 0) bump(zeroResultTerms, term);
          }
        }
      }
      if (!session.converted) {
        for (const productId of cartProductsThisSession) bump(abandonedCarts, productId);
      }
    }

    const productIds = [
      ...new Set([...productClicks.keys(), ...productViews.keys(), ...abandonedCarts.keys()]),
    ];
    const products = productIds.length
      ? await this.prisma.product.findMany({
          where: { id: { in: productIds } },
          select: { id: true, name: true, slug: true },
        })
      : [];
    const productMap = new Map(products.map((p) => [p.id, p]));
    const toProductList = (counter: Counter, limit: number) =>
      [...counter.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, limit)
        .map(([productId, count]) => ({
          productId,
          name: productMap.get(productId)?.name ?? 'Produto removido',
          slug: productMap.get(productId)?.slug ?? null,
          count,
        }));

    const sessionsCount = sessions.length;
    const funnel = [
      { name: 'Sessões', count: sessionsCount, pct: 100 },
      ...FUNNEL_EVENT_STEPS.map((step) => {
        const count = funnelCounts.get(step.type) ?? 0;
        return { name: step.label, count, pct: sessionsCount ? (count / sessionsCount) * 100 : 0 };
      }),
    ];

    return {
      period: { from: range.from, to: range.to, days: range.days, timeZone: REPORT_TIME_ZONE },
      engagement: {
        sessions: sessionsCount,
        uniqueVisitors: visitorIds.length,
        newVisitors: visitorIds.length - returningVisitorIds.size,
        returningVisitors: returningVisitorIds.size,
        avgDurationSeconds: Math.round(totalDuration / sessionsCount),
        avgPageViewsPerSession: Number((totalPageViews / sessionsCount).toFixed(1)),
        bounceRate: (bounced / sessionsCount) * 100,
      },
      funnel,
      topProducts: {
        byClicks: toProductList(productClicks, 10),
        byViews: toProductList(productViews, 10),
        mostAbandoned: toProductList(abandonedCarts, 10),
      },
      devices: topEntries(deviceCounts, 10).map((d) => ({
        ...d,
        pct: (d.count / sessionsCount) * 100,
      })),
      browsers: topEntries(browserCounts, 8),
      operatingSystems: topEntries(osCounts, 8),
      traffic: {
        sources: topEntries(sourceCounts, 10),
        topReferrers: topEntries(referrerCounts, 10),
        topLandingPages: topEntries(landingCounts, 10),
        topExitPages: topEntries(exitCounts, 10),
      },
      searches: {
        topTerms: topEntries(searchTerms, 15).map((e) => ({ term: e.name, count: e.count })),
        zeroResults: topEntries(zeroResultTerms, 15).map((e) => ({ term: e.name, count: e.count })),
      },
      timeline: [...dailySessions.entries()]
        .sort(([a], [b]) => (a < b ? -1 : 1))
        .map(([date, count]) => ({
          date,
          sessions: count,
          pageViews: dailyPageViews.get(date) ?? 0,
        })),
    };
  }

  private hostOf(url: string): string {
    try {
      return new URL(url).hostname.replace(/^www\./, '');
    } catch {
      return '';
    }
  }

  private empty(range: Range) {
    return {
      period: { from: range.from, to: range.to, days: range.days, timeZone: REPORT_TIME_ZONE },
      engagement: {
        sessions: 0,
        uniqueVisitors: 0,
        newVisitors: 0,
        returningVisitors: 0,
        avgDurationSeconds: 0,
        avgPageViewsPerSession: 0,
        bounceRate: 0,
      },
      funnel: [],
      topProducts: { byClicks: [], byViews: [], mostAbandoned: [] },
      devices: [],
      browsers: [],
      operatingSystems: [],
      traffic: { sources: [], topReferrers: [], topLandingPages: [], topExitPages: [] },
      searches: { topTerms: [], zeroResults: [] },
      timeline: [],
    };
  }
}
