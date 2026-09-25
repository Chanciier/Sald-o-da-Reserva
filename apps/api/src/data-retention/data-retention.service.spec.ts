import { PrismaService } from '../prisma/prisma.service';
import { DataRetentionService, RETENTION_DAYS } from './data-retention.service';

type Delegate = { findMany: jest.Mock; deleteMany: jest.Mock; findFirst?: jest.Mock };

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const NOW = new Date('2026-09-25T07:30:00.000Z');

function delegate(ids: string[] = []): Delegate {
  return {
    findMany: jest
      .fn()
      .mockResolvedValueOnce(ids.map((id) => ({ id })))
      .mockResolvedValue([]),
    deleteMany: jest.fn(async ({ where }) => ({ count: where.id.in.length })),
  };
}

describe('DataRetentionService', () => {
  let prisma: {
    analyticsSession: Delegate;
    whatsappMessageLog: Delegate;
    webhookLog: Delegate;
    marketplaceSyncLog: Delegate & { findFirst: jest.Mock };
  };
  let service: DataRetentionService;

  beforeEach(() => {
    prisma = {
      analyticsSession: delegate(['s1', 's2']),
      whatsappMessageLog: delegate(['w1']),
      webhookLog: delegate(),
      marketplaceSyncLog: { ...delegate(['m1']), findFirst: jest.fn().mockResolvedValue(null) },
    };
    service = new DataRetentionService(prisma as unknown as PrismaService);
  });

  it('apaga só o que passou do prazo de cada tabela e soma o total', async () => {
    const summary = await service.purge(NOW);

    expect(summary).toEqual({
      analyticsSessions: 2,
      whatsappMessageLogs: 1,
      webhookLogs: 0,
      marketplaceSyncLogs: 1,
    });

    const cutoff = (days: number) => new Date(NOW.getTime() - days * MS_PER_DAY);
    expect(prisma.analyticsSession.findMany.mock.calls[0][0].where).toEqual({
      startedAt: { lt: cutoff(RETENTION_DAYS.analyticsSessions) },
    });
    expect(prisma.whatsappMessageLog.findMany.mock.calls[0][0].where).toEqual({
      sentAt: { lt: cutoff(RETENTION_DAYS.whatsappMessageLogs) },
    });
    expect(prisma.webhookLog.findMany.mock.calls[0][0].where).toEqual({
      createdAt: { lt: cutoff(RETENTION_DAYS.webhookLogs) },
    });
    expect(prisma.webhookLog.deleteMany).not.toHaveBeenCalled();
  });

  it('preserva o último sync com sucesso de cada marketplace', async () => {
    prisma.marketplaceSyncLog.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: 'ml-last' })
      .mockResolvedValueOnce({ id: 'shopee-last' });

    await service.purge(NOW);

    expect(prisma.marketplaceSyncLog.findMany.mock.calls[0][0].where).toEqual({
      createdAt: { lt: new Date(NOW.getTime() - RETENTION_DAYS.marketplaceSyncLogs * MS_PER_DAY) },
      id: { notIn: ['ml-last', 'shopee-last'] },
    });
  });

  it('apaga em lotes até não sobrar nada', async () => {
    const fullBatch = Array.from({ length: 5000 }, (_, i) => ({ id: `a${i}` }));
    prisma.analyticsSession.findMany = jest
      .fn()
      .mockResolvedValueOnce(fullBatch)
      .mockResolvedValueOnce([{ id: 'last' }])
      .mockResolvedValue([]);

    const summary = await service.purge(NOW);

    expect(prisma.analyticsSession.deleteMany).toHaveBeenCalledTimes(2);
    expect(summary.analyticsSessions).toBe(5001);
  });

  it('não derruba o cron quando o banco falha', async () => {
    prisma.analyticsSession.findMany = jest.fn().mockRejectedValue(new Error('db down'));
    await expect(service.handleCron()).resolves.toBeUndefined();
  });
});
