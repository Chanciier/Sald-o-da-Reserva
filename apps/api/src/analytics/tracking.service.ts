import { Injectable } from '@nestjs/common';
import { AnalyticsEventType, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { TrackSessionDto } from './dto/track-event.dto';

const METADATA_MAX_BYTES = 2000;

// Aceita só valores primitivos rasos e limita tamanho — evita gravar blobs
// arbitrários vindos de um endpoint público sem autenticação.
function sanitizeMetadata(input: unknown): Prisma.InputJsonValue | undefined {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return undefined;
  const out: Record<string, string | number | boolean> = {};
  for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
    if (typeof value !== 'string' && typeof value !== 'number' && typeof value !== 'boolean')
      continue;
    if (typeof value === 'string' && value.length > 300) continue;
    out[key.slice(0, 60)] = value;
  }
  if (!Object.keys(out).length) return undefined;
  return JSON.stringify(out).length > METADATA_MAX_BYTES
    ? undefined
    : (out as Prisma.InputJsonValue);
}

@Injectable()
export class TrackingService {
  constructor(private readonly prisma: PrismaService) {}

  async ingest(dto: TrackSessionDto): Promise<void> {
    const events = dto.events ?? [];

    const requestedProductIds = [
      ...new Set(events.map((e) => e.productId).filter((id): id is string => !!id)),
    ];
    const validProductIds = requestedProductIds.length
      ? new Set(
          (
            await this.prisma.product.findMany({
              where: { id: { in: requestedProductIds } },
              select: { id: true },
            })
          ).map((p) => p.id),
        )
      : new Set<string>();

    const pageViewCount = events.filter((e) => e.type === AnalyticsEventType.PAGE_VIEW).length;
    const converted = events.some((e) => e.type === AnalyticsEventType.PURCHASE);
    const lastPath = events.length ? events[events.length - 1].path : undefined;

    await this.prisma.analyticsSession.upsert({
      where: { id: dto.sessionId },
      create: {
        id: dto.sessionId,
        visitorId: dto.visitorId,
        device: dto.device,
        browser: dto.browser,
        os: dto.os,
        referrer: dto.referrer,
        utmSource: dto.utmSource,
        utmMedium: dto.utmMedium,
        utmCampaign: dto.utmCampaign,
        landingPath: dto.landingPath ?? lastPath,
        exitPath: lastPath,
        durationSeconds: dto.durationSeconds ?? 0,
        pageViews: pageViewCount,
        converted,
      },
      update: {
        durationSeconds: dto.durationSeconds,
        exitPath: lastPath,
        pageViews: pageViewCount ? { increment: pageViewCount } : undefined,
        converted: converted ? true : undefined,
      },
    });

    if (events.length) {
      await this.prisma.analyticsEvent.createMany({
        data: events.map((e) => ({
          sessionId: dto.sessionId,
          type: e.type,
          path: e.path,
          productId: e.productId && validProductIds.has(e.productId) ? e.productId : null,
          metadata: sanitizeMetadata(e.metadata),
        })),
      });
    }
  }
}
