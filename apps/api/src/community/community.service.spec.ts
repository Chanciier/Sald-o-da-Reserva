import { CommunityGroupStatus, CommunityRedirectOutcome } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { CommunityService } from './community.service';
import { CommunityAnalyticsService } from './community-analytics.service';
import { GroupProvisioner } from './group-provisioner';

// group-provisioner → BaileysService → `@whiskeysockets/baileys`, que é ESM puro
// e o Jest não consegue parsear. Nenhum código do WhatsApp roda aqui.
jest.mock('../whatsapp/baileys.service', () => ({ BaileysService: jest.fn() }));

function group(id: string, category: string, participants: number) {
  return {
    id,
    name: `Grupo ${id}`,
    inviteLink: `https://chat.whatsapp.com/${id}`,
    groupJid: null,
    capacity: 100,
    participants,
    priority: 0,
    status: CommunityGroupStatus.ACTIVE,
    active: true,
    category,
    lastSyncAt: null,
    syncError: null,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
  };
}

const GROUPS = [
  group('geral-1', 'geral', 10),
  group('sex-1', 'sex-shop', 50),
  group('sex-2', 'sex-shop', 20),
];

describe('CommunityService — categorias', () => {
  let prisma: {
    communityGroup: { findMany: jest.Mock; create: jest.Mock };
    communityRedirect: { create: jest.Mock };
  };
  let redis: {
    getJson: jest.Mock;
    setJson: jest.Mock;
    get: jest.Mock;
    increment: jest.Mock;
    delPattern: jest.Mock;
  };
  let service: CommunityService;

  beforeEach(() => {
    prisma = {
      communityGroup: {
        // Simula o filtro do banco por categoria.
        findMany: jest.fn(async (args?: { where?: { category?: string } }) =>
          GROUPS.filter((g) => !args?.where?.category || g.category === args.where.category),
        ),
        create: jest.fn(async ({ data }) => ({ id: 'novo', ...data })),
      },
      communityRedirect: { create: jest.fn() },
    };
    redis = {
      getJson: jest.fn().mockResolvedValue(null),
      setJson: jest.fn(),
      get: jest.fn().mockResolvedValue(null),
      increment: jest.fn(),
      delPattern: jest.fn(),
    };
    service = new CommunityService(
      prisma as unknown as PrismaService,
      redis as unknown as RedisService,
      { capabilities: {} } as unknown as GroupProvisioner,
    );
  });

  it('o link de uma categoria só distribui entre os grupos dela', async () => {
    const result = await service.join({ category: 'sex-shop' });

    expect(result.group?.id).toBe('sex-2'); // menos ocupado entre os de sex shop
    expect(prisma.communityGroup.findMany.mock.calls[0][0].where.category).toBe('sex-shop');
    expect(redis.setJson.mock.calls[0][0]).toBe('community:groups:active:sex-shop');
    expect(prisma.communityRedirect.create.mock.calls[0][0].data).toMatchObject({
      groupId: 'sex-2',
      category: 'sex-shop',
      outcome: CommunityRedirectOutcome.REDIRECTED,
    });
  });

  it('sem categoria usa "geral" (o link /grupos de sempre)', async () => {
    const result = await service.join({});

    expect(result.group?.id).toBe('geral-1');
    expect(prisma.communityRedirect.create.mock.calls[0][0].data.category).toBe('geral');
  });

  it('categoria sem grupos responde como lotada, sem cair em outra categoria', async () => {
    const result = await service.join({ category: 'outra' });

    expect(result).toEqual({ available: false });
    expect(prisma.communityRedirect.create.mock.calls[0][0].data).toMatchObject({
      groupId: null,
      category: 'outra',
      outcome: CommunityRedirectOutcome.ALL_FULL,
    });
  });

  it('o painel mostra o grupo recomendado de cada categoria', async () => {
    const data = await service.listGroupsWithOccupancy();

    expect(data.categories).toEqual(['geral', 'sex-shop']);
    expect(data.recommendedByCategory).toEqual({ geral: 'geral-1', 'sex-shop': 'sex-2' });
  });

  it('grupo novo sem categoria entra em "geral" e invalida o cache de todas', async () => {
    await service.createGroup({ name: 'Novo', inviteLink: 'https://chat.whatsapp.com/abc' });

    expect(prisma.communityGroup.create.mock.calls[0][0].data.category).toBe('geral');
    expect(redis.delPattern).toHaveBeenCalledWith('community:groups:active*');
  });
});

describe('CommunityAnalyticsService — filtro por categoria', () => {
  it('considera só os acessos e grupos da categoria', async () => {
    const prisma = {
      communityGroup: { findMany: jest.fn().mockResolvedValue(GROUPS) },
      communityRedirect: { findMany: jest.fn().mockResolvedValue([]) },
      communityGroupSnapshot: { findMany: jest.fn().mockResolvedValue([]) },
      communityMemberEvent: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const analytics = new CommunityAnalyticsService(prisma as unknown as PrismaService);

    const result = await analytics.overview('30', 'sex-shop');

    expect(result.category).toBe('sex-shop');
    expect(prisma.communityRedirect.findMany.mock.calls[0][0].where.category).toBe('sex-shop');
    expect(prisma.communityMemberEvent.findMany.mock.calls[0][0].where.groupId).toEqual({
      in: ['sex-1', 'sex-2'],
    });
    expect(prisma.communityGroupSnapshot.findMany.mock.calls[0][0].where.groupId).toEqual({
      in: ['sex-1', 'sex-2'],
    });
  });

  it('rejeita categoria inválida', async () => {
    const analytics = new CommunityAnalyticsService({} as PrismaService);
    await expect(analytics.overview('30', 'Sex Shop')).rejects.toThrow('categoria');
  });
});
