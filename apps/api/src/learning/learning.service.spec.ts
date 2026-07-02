import { EventBusService } from '../events/event-bus.service';
import { OmsEventPayloads } from '../events/oms-events';
import { MarketResearchService } from '../market-research/market-research.service';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { LearningService } from './learning.service';
import { CategoryBias, LearningEvent } from './learning.types';

/**
 * Testes unitários do LearningService. Prisma, Redis, EventBus e
 * MarketResearchService são todos mockados. O handler de `product.sold` é
 * capturado a partir da chamada a `events.on` (feita em `onModuleInit`),
 * igual à estratégia usada nos specs de QueueService/MarketResearchService.
 */

function daysAgo(n: number): Date {
  return new Date(Date.now() - n * 24 * 60 * 60 * 1000);
}
function hoursAgo(n: number): Date {
  return new Date(Date.now() - n * 60 * 60 * 1000);
}

describe('LearningService', () => {
  let service: LearningService;
  let prisma: {
    product: { findUnique: jest.Mock; findMany: jest.Mock };
    category: { findUnique: jest.Mock; findMany: jest.Mock };
  };
  let redis: {
    get: jest.Mock;
    set: jest.Mock;
    exists: jest.Mock;
    increment: jest.Mock;
    getJson: jest.Mock;
    setJson: jest.Mock;
    rpush: jest.Mock;
    ltrim: jest.Mock;
    lrange: jest.Mock;
  };
  let events: { on: jest.Mock };
  let marketResearch: { request: jest.Mock };
  let productSoldHandler: (payload: OmsEventPayloads['product.sold']) => Promise<void>;

  beforeEach(() => {
    prisma = {
      product: { findUnique: jest.fn(), findMany: jest.fn().mockResolvedValue([]) },
      category: {
        findUnique: jest.fn().mockResolvedValue(null),
        findMany: jest.fn().mockResolvedValue([]),
      },
    };
    redis = {
      get: jest.fn().mockResolvedValue(null),
      set: jest.fn(),
      exists: jest.fn().mockResolvedValue(false),
      increment: jest.fn().mockResolvedValue(1),
      getJson: jest.fn().mockResolvedValue(null),
      setJson: jest.fn(),
      rpush: jest.fn(),
      ltrim: jest.fn(),
      lrange: jest.fn().mockResolvedValue([]),
    };
    events = {
      on: jest.fn((_event: string, handler: typeof productSoldHandler) => {
        productSoldHandler = handler;
      }),
    };
    marketResearch = { request: jest.fn().mockResolvedValue({ status: 'PENDING' }) };

    service = new LearningService(
      prisma as unknown as PrismaService,
      redis as unknown as RedisService,
      events as unknown as EventBusService,
      marketResearch as unknown as MarketResearchService,
    );
    service.onModuleInit();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('venda rápida/lenta (evento product.sold)', () => {
    it('registra FAST_SALE e aumenta o viés quando vende em poucas horas', async () => {
      prisma.product.findUnique.mockResolvedValue({ createdAt: hoursAgo(3), categoryId: 'cat-1' });

      await productSoldHandler({ productId: 'p1' });

      expect(redis.rpush).toHaveBeenCalledTimes(1);
      const event = JSON.parse(redis.rpush.mock.calls[0][1]) as LearningEvent;
      expect(event.type).toBe('FAST_SALE');
      expect(event.biasDelta).toBeCloseTo(0.15, 5);
      expect(event.detail).toContain('preço maior');

      expect(redis.setJson).toHaveBeenCalledWith(
        'learning:bias:cat-1',
        expect.objectContaining({ bias: 0.15, eventCount: 1 }),
      );
    });

    it('registra SLOW_SALE e reduz o viés quando vende depois de muitas semanas', async () => {
      prisma.product.findUnique.mockResolvedValue({ createdAt: daysAgo(20), categoryId: 'cat-1' });

      await productSoldHandler({ productId: 'p1' });

      const event = JSON.parse(redis.rpush.mock.calls[0][1]) as LearningEvent;
      expect(event.type).toBe('SLOW_SALE');
      expect(event.biasDelta).toBeCloseTo(-0.08, 5);
    });

    it('não registra nada quando a venda ocorre no ritmo esperado', async () => {
      prisma.product.findUnique.mockResolvedValue({ createdAt: daysAgo(5), categoryId: 'cat-1' });

      await productSoldHandler({ productId: 'p1' });

      expect(redis.rpush).not.toHaveBeenCalled();
    });

    it('não quebra quando o produto não existe mais', async () => {
      prisma.product.findUnique.mockResolvedValue(null);
      await expect(productSoldHandler({ productId: 'p1' })).resolves.toBeUndefined();
      expect(redis.rpush).not.toHaveBeenCalled();
    });
  });

  describe('estoque parado (varredura diária)', () => {
    it('marca produtos ativos parados há mais de 30 dias e ainda não sinalizados', async () => {
      prisma.product.findMany.mockResolvedValue([
        { id: 'p1', categoryId: 'cat-1', createdAt: daysAgo(45) },
      ]);
      redis.exists.mockResolvedValue(false);

      const flagged = await service.scanStagnantProducts();

      expect(flagged).toBe(1);
      const event = JSON.parse(redis.rpush.mock.calls[0][1]) as LearningEvent;
      expect(event.type).toBe('STAGNANT');
      expect(event.detail).toContain('preço menor');
      expect(redis.set).toHaveBeenCalledWith(
        'learning:flagged:stagnant:p1',
        '1',
        expect.any(Number),
      );
    });

    it('não repete o mesmo produto se já foi sinalizado recentemente', async () => {
      prisma.product.findMany.mockResolvedValue([
        { id: 'p1', categoryId: 'cat-1', createdAt: daysAgo(45) },
      ]);
      redis.exists.mockResolvedValue(true);

      const flagged = await service.scanStagnantProducts();

      expect(flagged).toBe(0);
      expect(redis.rpush).not.toHaveBeenCalled();
    });
  });

  describe('muitos acessos (tracking de views)', () => {
    it('não dispara nada enquanto as visitas do dia ficam abaixo do limiar', async () => {
      redis.increment.mockResolvedValue(10);

      const result = await service.trackView('p1');

      expect(result).toEqual({ productId: 'p1', viewsToday: 10, highTrafficTriggered: false });
      expect(marketResearch.request).not.toHaveBeenCalled();
    });

    it('ao cruzar o limiar, registra HIGH_TRAFFIC e força recálculo de mercado', async () => {
      redis.increment.mockResolvedValue(50);
      prisma.product.findUnique.mockResolvedValue({
        name: 'Furadeira Bosch',
        brand: 'Bosch',
        categoryId: 'cat-1',
      });

      const result = await service.trackView('p1');

      expect(result.highTrafficTriggered).toBe(true);
      const event = JSON.parse(redis.rpush.mock.calls[0][1]) as LearningEvent;
      expect(event.type).toBe('HIGH_TRAFFIC');
      expect(marketResearch.request).toHaveBeenCalledWith(
        { title: 'Furadeira Bosch', brand: 'Bosch' },
        { forceRefresh: true },
      );
    });

    it('não dispara de novo no mesmo dia depois de já ter sinalizado', async () => {
      redis.increment.mockResolvedValue(80);
      redis.exists.mockResolvedValue(true); // já sinalizado

      const result = await service.trackView('p1');

      expect(result.highTrafficTriggered).toBe(false);
      expect(marketResearch.request).not.toHaveBeenCalled();
    });
  });

  describe('viés por categoria', () => {
    it('devolve viés zerado quando a categoria nunca teve eventos', async () => {
      prisma.category.findUnique.mockResolvedValue({ name: 'Ferramentas' });

      const bias = await service.getBias('cat-1');

      expect(bias).toMatchObject({
        categoryId: 'cat-1',
        categoryName: 'Ferramentas',
        bias: 0,
        eventCount: 0,
      });
    });

    it('devolve o viés já acumulado quando existe', async () => {
      const stored: CategoryBias = {
        categoryId: 'cat-1',
        categoryName: 'Ferramentas',
        bias: 0.3,
        eventCount: 2,
        updatedAt: new Date().toISOString(),
      };
      redis.getJson.mockResolvedValue(stored);

      expect(await service.getBias('cat-1')).toBe(stored);
    });

    it('clampa o viés em [-1, 1] mesmo com muitos eventos do mesmo tipo', async () => {
      redis.getJson.mockResolvedValue({
        categoryId: 'cat-1',
        categoryName: null,
        bias: 0.95,
        eventCount: 10,
        updatedAt: new Date().toISOString(),
      });
      prisma.product.findUnique.mockResolvedValue({ createdAt: hoursAgo(1), categoryId: 'cat-1' });

      await productSoldHandler({ productId: 'p1' });

      const [, updated] = redis.setJson.mock.calls[0];
      expect(updated.bias).toBe(1);
    });
  });

  describe('dashboard', () => {
    it('agrega totais por tipo, viés por categoria e eventos recentes', async () => {
      redis.get.mockImplementation((key: string) => {
        const totals: Record<string, string> = {
          'learning:total:FAST_SALE': '5',
          'learning:total:SLOW_SALE': '1',
          'learning:total:STAGNANT': '2',
          'learning:total:HIGH_TRAFFIC': '3',
        };
        return Promise.resolve(totals[key] ?? null);
      });
      prisma.category.findMany.mockResolvedValue([{ id: 'cat-1' }, { id: 'cat-2' }]);
      redis.getJson.mockImplementation((key: string) => {
        if (key === 'learning:bias:cat-1') {
          return Promise.resolve({
            categoryId: 'cat-1',
            categoryName: 'Ferramentas',
            bias: 0.2,
            eventCount: 3,
            updatedAt: new Date().toISOString(),
          });
        }
        return Promise.resolve(null); // cat-2 nunca teve eventos
      });
      const recentEvent: LearningEvent = {
        type: 'FAST_SALE',
        productId: 'p1',
        categoryId: 'cat-1',
        detail: 'Vendeu em 3.0h — sugerir preço maior da próxima vez.',
        biasDelta: 0.15,
        createdAt: new Date().toISOString(),
      };
      redis.lrange.mockResolvedValue([JSON.stringify(recentEvent)]);

      const dashboard = await service.getDashboard();

      expect(dashboard.totals).toEqual({
        FAST_SALE: 5,
        SLOW_SALE: 1,
        STAGNANT: 2,
        HIGH_TRAFFIC: 3,
      });
      expect(dashboard.categoryBias).toHaveLength(1); // só cat-1, que teve eventos
      expect(dashboard.categoryBias[0].categoryId).toBe('cat-1');
      expect(dashboard.recentEvents).toEqual([recentEvent]);
    });
  });
});
