import { UnprocessableEntityException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PricingService } from './pricing.service';

/**
 * Testes unitários do PricingService. Prisma é mockado (agregações de
 * produto/review/orderItem) — nada aqui toca banco real. Cobre: resolução da
 * âncora (mercado + catálogo + fallback manual), os 4 fatores normalizados, a
 * ordenação Agressivo < Equilibrado < Premium, e as explicações em português.
 */

function decimal(n: number) {
  // Simula o shape mínimo de Prisma.Decimal usado pelo service (.toNumber()).
  return { toNumber: () => n };
}

describe('PricingService', () => {
  let service: PricingService;
  let prisma: {
    product: { aggregate: jest.Mock; findUnique: jest.Mock };
    review: { aggregate: jest.Mock };
    orderItem: { aggregate: jest.Mock };
  };

  beforeEach(() => {
    prisma = {
      product: {
        aggregate: jest.fn().mockResolvedValue({ _avg: { price: null } }),
        findUnique: jest.fn().mockResolvedValue(null),
      },
      review: {
        aggregate: jest.fn().mockResolvedValue({ _avg: { rating: null }, _count: { rating: 0 } }),
      },
      orderItem: {
        aggregate: jest.fn().mockResolvedValue({ _sum: { quantity: null } }),
      },
    };
    service = new PricingService(prisma as unknown as PrismaService);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('âncora', () => {
    it('mistura mercado (70%) e catálogo (30%) quando ambos existem', async () => {
      prisma.product.aggregate.mockResolvedValue({ _avg: { price: decimal(100) } });

      const result = await service.suggest({ marketAvgPrice: 200, categoryId: 'cat-1' });

      expect(result.anchorPrice).toBeCloseTo(200 * 0.7 + 100 * 0.3, 2); // 170
      expect(result.anchorSource).toBe('MARKET_AND_CATALOG');
    });

    it('usa só o mercado quando não há categoryId', async () => {
      const result = await service.suggest({ marketAvgPrice: 150 });
      expect(result.anchorPrice).toBe(150);
      expect(result.anchorSource).toBe('MARKET');
    });

    it('usa só o catálogo quando não há preço de mercado', async () => {
      prisma.product.aggregate.mockResolvedValue({ _avg: { price: decimal(80) } });
      const result = await service.suggest({ categoryId: 'cat-1' });
      expect(result.anchorPrice).toBe(80);
      expect(result.anchorSource).toBe('CATALOG');
    });

    it('cai para referencePrice quando não há mercado nem catálogo', async () => {
      const result = await service.suggest({ referencePrice: 59.9 });
      expect(result.anchorPrice).toBe(59.9);
      expect(result.anchorSource).toBe('MANUAL');
    });

    it('lança UnprocessableEntity quando não há nenhum dado de referência', async () => {
      await expect(service.suggest({})).rejects.toBeInstanceOf(UnprocessableEntityException);
    });

    it('ignora preços de mercado inválidos (0, negativo)', async () => {
      const result = await service.suggest({ marketAvgPrice: 0, referencePrice: 42 });
      expect(result.anchorSource).toBe('MANUAL');
      expect(result.anchorPrice).toBe(42);
    });
  });

  describe('3 níveis de sugestão', () => {
    it('sempre devolve Agressivo < Equilibrado < Premium', async () => {
      const result = await service.suggest({ marketAvgPrice: 100 });
      const [aggressive, balanced, premium] = result.suggestions;

      expect(aggressive.tier).toBe('AGGRESSIVE');
      expect(balanced.tier).toBe('BALANCED');
      expect(premium.tier).toBe('PREMIUM');
      expect(aggressive.price).toBeLessThan(balanced.price);
      expect(balanced.price).toBeLessThan(premium.price);
    });

    it('rotula corretamente (label em português)', async () => {
      const result = await service.suggest({ marketAvgPrice: 100 });
      expect(result.suggestions.map((s) => s.label)).toEqual([
        'Preço Agressivo',
        'Preço Equilibrado',
        'Preço Premium',
      ]);
    });

    it('desloca as 3 sugestões para cima quando há pouca concorrência e estoque novo', async () => {
      const lowCompetition = await service.suggest({ marketAvgPrice: 100, competitorCount: 0 });
      const highCompetition = await service.suggest({ marketAvgPrice: 100, competitorCount: 40 });

      for (const tier of ['AGGRESSIVE', 'BALANCED', 'PREMIUM'] as const) {
        const low = lowCompetition.suggestions.find((s) => s.tier === tier)!;
        const high = highCompetition.suggestions.find((s) => s.tier === tier)!;
        expect(low.price).toBeGreaterThan(high.price);
      }
    });

    it('não é simplesmente o menor preço da concorrência (Agressivo ≠ marketMinPrice)', async () => {
      const result = await service.suggest({
        marketAvgPrice: 100,
        marketMinPrice: 40,
        competitorCount: 3,
      });
      const aggressive = result.suggestions.find((s) => s.tier === 'AGGRESSIVE')!;
      expect(aggressive.price).not.toBe(40);
      expect(aggressive.price).toBeGreaterThan(40);
    });
  });

  describe('learningBias (LearningModule)', () => {
    it('não muda nada quando learningBias não é informado (sem regressão)', async () => {
      const withoutBias = await service.suggest({ marketAvgPrice: 100, competitorCount: 5 });
      const withNullBias = await service.suggest({
        marketAvgPrice: 100,
        competitorCount: 5,
        learningBias: null,
      });
      expect(withNullBias).toEqual(withoutBias);
    });

    it('viés positivo (categoria que vende rápido) empurra as sugestões para cima', async () => {
      const neutral = await service.suggest({ marketAvgPrice: 100, competitorCount: 5 });
      const biased = await service.suggest({
        marketAvgPrice: 100,
        competitorCount: 5,
        learningBias: 1,
      });

      const neutralBalanced = neutral.suggestions.find((s) => s.tier === 'BALANCED')!;
      const biasedBalanced = biased.suggestions.find((s) => s.tier === 'BALANCED')!;
      expect(biasedBalanced.price).toBeGreaterThan(neutralBalanced.price);
    });

    it('viés negativo (categoria com estoque parado) empurra as sugestões para baixo', async () => {
      const neutral = await service.suggest({ marketAvgPrice: 100, competitorCount: 5 });
      const biased = await service.suggest({
        marketAvgPrice: 100,
        competitorCount: 5,
        learningBias: -1,
      });

      const neutralBalanced = neutral.suggestions.find((s) => s.tier === 'BALANCED')!;
      const biasedBalanced = biased.suggestions.find((s) => s.tier === 'BALANCED')!;
      expect(biasedBalanced.price).toBeLessThan(neutralBalanced.price);
    });
  });

  describe('guarda-corpo com os extremos de mercado (min/max)', () => {
    it('Agressivo não cai abaixo de 85% do menor preço encontrado, mesmo sob pressão máxima', async () => {
      prisma.product.findUnique.mockResolvedValue({
        createdAt: new Date(Date.now() - 200 * 24 * 60 * 60 * 1000), // estoque bem parado
      });
      prisma.orderItem.aggregate.mockResolvedValue({ _sum: { quantity: 0 } }); // nunca vendeu

      const result = await service.suggest({
        marketAvgPrice: 100,
        marketMinPrice: 90,
        competitorCount: 500, // mercado saturado
        productId: 'p1',
      });

      const aggressive = result.suggestions.find((s) => s.tier === 'AGGRESSIVE')!;
      expect(aggressive.price).toBeCloseTo(90 * 0.85, 1);
    });

    it('Premium não passa de 115% do maior preço encontrado, mesmo sob pressão máxima', async () => {
      prisma.product.findUnique.mockResolvedValue({ createdAt: new Date() }); // acabou de chegar
      prisma.orderItem.aggregate.mockResolvedValue({ _sum: { quantity: 30 } }); // vende muito
      prisma.review.aggregate.mockResolvedValue({ _avg: { rating: 5 }, _count: { rating: 10 } });

      const result = await service.suggest({
        marketAvgPrice: 100,
        marketMaxPrice: 100,
        competitorCount: 0, // sem concorrência
        productId: 'p1',
      });

      const premium = result.suggestions.find((s) => s.tier === 'PREMIUM')!;
      expect(premium.price).toBeCloseTo(100 * 1.15, 1);
    });
  });

  describe('fatores', () => {
    it('produto novo (sem productId): histórico neutro, estoque no máximo (recém-chegado)', async () => {
      const result = await service.suggest({ marketAvgPrice: 100 });
      expect(result.factors.history).toBe(0.5);
      expect(result.factors.stockAge).toBe(1);
      expect(prisma.orderItem.aggregate).not.toHaveBeenCalled();
      expect(prisma.product.findUnique).not.toHaveBeenCalled();
    });

    it('produto existente sem vendas: histórico baixo (sinal real de baixa saída)', async () => {
      prisma.orderItem.aggregate.mockResolvedValue({ _sum: { quantity: 0 } });
      const result = await service.suggest({ marketAvgPrice: 100, productId: 'p1' });
      expect(result.factors.history).toBe(0);
    });

    it('produto existente com muitas vendas: histórico alto', async () => {
      prisma.orderItem.aggregate.mockResolvedValue({ _sum: { quantity: 30 } });
      const result = await service.suggest({ marketAvgPrice: 100, productId: 'p1' });
      expect(result.factors.history).toBe(1);
    });

    it('estoque antigo reduz o score de tempo em estoque', async () => {
      const sixtyDaysAgo = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000);
      prisma.product.findUnique.mockResolvedValue({ createdAt: sixtyDaysAgo });

      const result = await service.suggest({ marketAvgPrice: 100, productId: 'p1' });
      expect(result.factors.stockAge).toBeCloseTo(0, 1);
    });

    it('popularidade usa avaliação do próprio produto quando existe', async () => {
      prisma.review.aggregate.mockResolvedValueOnce({
        _avg: { rating: 5 },
        _count: { rating: 10 },
      });
      const result = await service.suggest({ marketAvgPrice: 100, productId: 'p1' });
      expect(result.factors.popularity).toBe(1);
    });

    it('popularidade cai para a média da categoria quando o produto não tem avaliações', async () => {
      prisma.review.aggregate
        .mockResolvedValueOnce({ _avg: { rating: null }, _count: { rating: 0 } }) // produto
        .mockResolvedValueOnce({ _avg: { rating: 4 }, _count: { rating: 20 } }); // categoria

      const result = await service.suggest({
        marketAvgPrice: 100,
        productId: 'p1',
        categoryId: 'cat-1',
      });
      expect(result.factors.popularity).toBeCloseTo(0.8, 2);
    });

    it('popularidade é neutra sem nenhum dado de avaliação', async () => {
      const result = await service.suggest({ marketAvgPrice: 100 });
      expect(result.factors.popularity).toBe(0.5);
    });
  });

  describe('explicações', () => {
    it('Premium cita pouca concorrência quando esse é o único fator em destaque', async () => {
      // Tempo em estoque neutro (~30 dias) para isolar o sinal de concorrência
      // — sem isso, produto novo (sem productId) teria estoque no máximo (1.0)
      // e empataria com concorrência, gerando duas razões em vez de uma.
      const neutralStockAge = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      prisma.product.findUnique.mockResolvedValue({ createdAt: neutralStockAge });

      const result = await service.suggest({
        marketAvgPrice: 100,
        competitorCount: 0,
        productId: 'p1',
      });
      const premium = result.suggestions.find((s) => s.tier === 'PREMIUM')!;
      expect(premium.reasoning).toBe('Preço Premium porque há pouca concorrência.');
    });

    it('Agressivo cita muita concorrência e/ou estoque parado', async () => {
      const oldStock = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
      prisma.product.findUnique.mockResolvedValue({ createdAt: oldStock });
      prisma.orderItem.aggregate.mockResolvedValue({ _sum: { quantity: 0 } });

      const result = await service.suggest({
        marketAvgPrice: 100,
        competitorCount: 50,
        productId: 'p1',
      });
      const aggressive = result.suggestions.find((s) => s.tier === 'AGGRESSIVE')!;
      expect(aggressive.reasoning).toContain('Preço Agressivo porque');
      expect(aggressive.reasoning).toMatch(/concorrência|estoque/);
    });

    it('Equilibrado sempre referencia o valor da âncora', async () => {
      const result = await service.suggest({ marketAvgPrice: 123.45 });
      const balanced = result.suggestions.find((s) => s.tier === 'BALANCED')!;
      expect(balanced.reasoning).toContain('R$ 123.45');
    });
  });
});
