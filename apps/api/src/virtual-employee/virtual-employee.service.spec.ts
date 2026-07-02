import { NotFoundException } from '@nestjs/common';

// `ProductsService` importa (transitivamente, via WhatsApp) o pacote
// `@whiskeysockets/baileys`, que é ESM puro — o Jest desta suíte não tem
// transformIgnorePatterns para ESM em node_modules e falha ao fazer parse
// dele. Nenhum código do baileys roda neste spec (ProductsService é
// totalmente mockado), então interceptamos o pacote antes de qualquer
// import carregar a cadeia real.
jest.mock('@whiskeysockets/baileys', () => ({
  __esModule: true,
  default: jest.fn(),
  DisconnectReason: {},
  initAuthCreds: jest.fn(),
}));

import { IdentificationService } from '../identification/identification.service';
import { IdentificationResult } from '../identification/identification.types';
import { LearningService } from '../learning/learning.service';
import { MarketResearchService } from '../market-research/market-research.service';
import { MarketResearchData } from '../market-research/market-research.types';
import { PricingService } from '../pricing/pricing.service';
import { PricingResult } from '../pricing/pricing.types';
import { PrismaService } from '../prisma/prisma.service';
import { ProductsService } from '../products/products.service';
import { RedisService } from '../redis/redis.service';
import { VisionResult } from '../vision/vision.types';
import { VisionService } from '../vision/vision.service';
import { VirtualEmployeeService } from './virtual-employee.service';
import { VirtualEmployeeReview } from './virtual-employee.types';

/**
 * Testes unitários do VirtualEmployeeService — o orquestrador de ponta a
 * ponta. Todos os 8 módulos do pipeline são mockados; o foco é garantir que
 * o encadeamento (Vision → Identification → Market Research → Pricing →
 * Learning) monta o painel corretamente e que `approve` cria o produto a
 * partir do cache, aplicando os overrides do operador.
 */

const VISION_RESULT: VisionResult = {
  brand: 'Bosch',
  model: 'GSB 550',
  category: 'Ferramentas elétricas',
  color: 'azul',
  material: 'plástico e metal',
  dimensions: '25 x 20 x 8 cm',
  condition: 'NOVO',
  features: ['reversível', 'mandril de 10mm'],
  keywords: ['furadeira', 'bosch', 'gsb 550'],
  confidence: 0.98,
  modelUsed: 'claude-haiku-4-5',
  imagesAnalyzed: 3,
};

const IDENTIFICATION_RESULT: IdentificationResult = {
  seoTitle: 'Furadeira Bosch GSB 550',
  description: 'Furadeira de impacto Bosch GSB 550, nova, com mandril de 10mm.',
  specifications: [{ label: 'Marca', value: 'Bosch' }],
  category: 'Ferramentas',
  categoryId: 'cat-ferramentas',
  tags: ['furadeira', 'bosch'],
  slug: 'furadeira-bosch-gsb-550',
  metaDescription: 'Furadeira Bosch GSB 550 nova.',
  modelUsed: 'claude-haiku-4-5',
};

const MARKET_DATA: MarketResearchData = {
  query: 'Furadeira Bosch GSB 550',
  currency: 'BRL',
  minPrice: 179,
  avgPrice: 194.5,
  maxPrice: 210,
  listingCount: 8,
  byMarketplace: [
    {
      marketplace: 'MERCADO_LIVRE',
      minPrice: 189,
      avgPrice: 199,
      maxPrice: 210,
      listingCount: 5,
      links: [],
    },
    {
      marketplace: 'SHOPEE',
      minPrice: 179,
      avgPrice: 194,
      maxPrice: 200,
      listingCount: 3,
      links: [],
    },
  ],
  listings: [],
  links: ['https://mercadolivre.com.br/a', 'https://shopee.com.br/b'],
  summary: 'Preços entre R$179 e R$210, boa disponibilidade em ambos os marketplaces.',
  researchedAt: new Date().toISOString(),
  modelUsed: 'claude-haiku-4-5',
};

function pricingResult(overrides: Partial<PricingResult> = {}): PricingResult {
  return {
    anchorPrice: 194.5,
    anchorSource: 'MARKET',
    factors: { competition: 0.5, popularity: 0.5, history: 0.5, stockAge: 1 },
    suggestions: [
      {
        tier: 'AGGRESSIVE',
        label: 'Preço Agressivo',
        price: 175,
        deltaFromAnchorPct: -10,
        reasoning: 'Preço Agressivo porque...',
      },
      {
        tier: 'BALANCED',
        label: 'Preço Equilibrado',
        price: 189.9,
        deltaFromAnchorPct: -2,
        reasoning: 'Preço Equilibrado porque...',
      },
      {
        tier: 'PREMIUM',
        label: 'Preço Premium',
        price: 215,
        deltaFromAnchorPct: 10,
        reasoning: 'Preço Premium porque há pouca concorrência.',
      },
    ],
    ...overrides,
  };
}

describe('VirtualEmployeeService', () => {
  let service: VirtualEmployeeService;
  let vision: { analyze: jest.Mock };
  let identification: { generate: jest.Mock };
  let marketResearch: { researchNow: jest.Mock };
  let pricing: { suggest: jest.Mock };
  let learning: { getBias: jest.Mock };
  let products: { create: jest.Mock };
  let prisma: { category: { findUnique: jest.Mock } };
  let redis: { setJson: jest.Mock; getJson: jest.Mock; del: jest.Mock };

  beforeEach(() => {
    vision = { analyze: jest.fn().mockResolvedValue(VISION_RESULT) };
    identification = { generate: jest.fn().mockResolvedValue(IDENTIFICATION_RESULT) };
    marketResearch = { researchNow: jest.fn().mockResolvedValue(MARKET_DATA) };
    pricing = { suggest: jest.fn().mockResolvedValue(pricingResult()) };
    learning = {
      getBias: jest.fn().mockResolvedValue({
        categoryId: 'cat-ferramentas',
        categoryName: 'Ferramentas',
        bias: 0.2,
        eventCount: 3,
        updatedAt: new Date().toISOString(),
      }),
    };
    products = {
      create: jest.fn().mockResolvedValue({ id: 'prod-1', name: 'Furadeira Bosch GSB 550' }),
    };
    prisma = { category: { findUnique: jest.fn().mockResolvedValue({ ncm: '82026000' }) } };
    redis = { setJson: jest.fn(), getJson: jest.fn(), del: jest.fn() };

    service = new VirtualEmployeeService(
      vision as unknown as VisionService,
      identification as unknown as IdentificationService,
      marketResearch as unknown as MarketResearchService,
      pricing as unknown as PricingService,
      learning as unknown as LearningService,
      products as unknown as ProductsService,
      prisma as unknown as PrismaService,
      redis as unknown as RedisService,
    );
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('analyze — encadeia o pipeline completo', () => {
    it('monta o painel com produto, confiança, preço sugerido, mercado e NCM', async () => {
      const review = await service.analyze({ imageUrls: ['https://ex.com/foto.jpg'] });

      expect(vision.analyze).toHaveBeenCalledWith({ imageUrls: ['https://ex.com/foto.jpg'] });
      expect(identification.generate).toHaveBeenCalledWith(VISION_RESULT);

      expect(review.product.title).toBe('Furadeira Bosch GSB 550');
      expect(review.product.categoryId).toBe('cat-ferramentas');
      expect(review.product.ncm).toBe('82026000');
      expect(review.confidence).toBe(0.98);
      expect(review.pricing.suggestedPrice).toBe(189.9); // BALANCED
      expect(review.pricing.suggestions).toHaveLength(3);
      expect(review.market.byMarketplace).toEqual([
        { marketplace: 'MERCADO_LIVRE', avgPrice: 199, listingCount: 5 },
        { marketplace: 'SHOPEE', avgPrice: 194, listingCount: 3 },
      ]);
      expect(review.market.competition).toBe('MEDIA'); // 8 anúncios (limiar de ALTA é 11+)
      expect(review.reviewId).toBeTruthy();
    });

    it('passa o preço médio de mercado e o viés aprendido para o Pricing', async () => {
      await service.analyze({ imageUrls: ['https://ex.com/foto.jpg'] });

      expect(pricing.suggest).toHaveBeenCalledWith(
        expect.objectContaining({
          marketAvgPrice: 194.5,
          marketMinPrice: 179,
          marketMaxPrice: 210,
          competitorCount: 8,
          categoryId: 'cat-ferramentas',
          learningBias: 0.2,
        }),
      );
    });

    it('salva o painel no cache (Redis) para o approve reaproveitar', async () => {
      const review = await service.analyze({ imageUrls: ['https://ex.com/foto.jpg'] });

      expect(redis.setJson).toHaveBeenCalledWith(
        `virtual-employee:review:${review.reviewId}`,
        review,
        60 * 60,
      );
    });

    it('segue sem pesquisa de mercado quando o Hermes falha, usando referencePrice', async () => {
      marketResearch.researchNow.mockRejectedValue(new Error('rate limit'));

      const review = await service.analyze({ imageUrls: ['https://ex.com/foto.jpg'] });

      expect(review.market.competition).toBe('BAIXA');
      expect(review.market.byMarketplace).toEqual([]);
      expect(review.market.summary).toContain('indisponível');
      expect(pricing.suggest).toHaveBeenCalledWith(
        expect.objectContaining({ marketAvgPrice: undefined, referencePrice: 49.9 }),
      );
    });

    it('não consulta viés nem NCM quando a Identification não casa nenhuma categoria', async () => {
      identification.generate.mockResolvedValue({ ...IDENTIFICATION_RESULT, categoryId: null });

      const review = await service.analyze({ imageUrls: ['https://ex.com/foto.jpg'] });

      expect(review.product.ncm).toBeNull();
      expect(learning.getBias).not.toHaveBeenCalled();
      expect(prisma.category.findUnique).not.toHaveBeenCalled();
      expect(pricing.suggest).toHaveBeenCalledWith(expect.objectContaining({ learningBias: null }));
    });

    it.each([
      [0, 'BAIXA'],
      [3, 'BAIXA'],
      [4, 'MEDIA'],
      [10, 'MEDIA'],
      [11, 'ALTA'],
      [50, 'ALTA'],
    ] as const)('classifica %i anúncios concorrentes como %s', async (listingCount, expected) => {
      marketResearch.researchNow.mockResolvedValue({ ...MARKET_DATA, listingCount });

      const review = await service.analyze({ imageUrls: ['https://ex.com/foto.jpg'] });
      expect(review.market.competition).toBe(expected);
    });
  });

  describe('approve — cria o produto a partir do painel aprovado', () => {
    let review: VirtualEmployeeReview;

    beforeEach(async () => {
      review = await service.analyze({ imageUrls: ['https://ex.com/foto.jpg'] });
      redis.getJson.mockResolvedValue(review);
    });

    it('cria o produto com os valores sugeridos quando o operador só aprova', async () => {
      await service.approve({ reviewId: review.reviewId }, 'user-1');

      expect(products.create).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Furadeira Bosch GSB 550',
          price: 189.9,
          categoryId: 'cat-ferramentas',
          ncm: '82026000',
          brand: 'Bosch',
          stock: 1,
          isUnique: true,
          condition: 'new', // VisionCondition NOVO → 'new'
        }),
        'user-1',
      );
    });

    it('aplica os overrides do operador (edição no painel)', async () => {
      await service.approve(
        { reviewId: review.reviewId, name: 'Furadeira Bosch Editada', price: 199.9, stock: 2 },
        'user-1',
      );

      expect(products.create).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'Furadeira Bosch Editada', price: 199.9, stock: 2 }),
        'user-1',
      );
    });

    it('limpa a categoria quando o operador manda null explicitamente', async () => {
      await service.approve({ reviewId: review.reviewId, categoryId: null }, 'user-1');

      const [dto] = products.create.mock.calls[0];
      expect(dto.categoryId).toBeUndefined();
    });

    it('apaga o cache do review depois de criar o produto', async () => {
      await service.approve({ reviewId: review.reviewId }, 'user-1');
      expect(redis.del).toHaveBeenCalledWith(`virtual-employee:review:${review.reviewId}`);
    });

    it('lança NotFoundException quando o review expirou ou não existe', async () => {
      redis.getJson.mockResolvedValue(null);
      await expect(service.approve({ reviewId: 'inexistente' }, 'user-1')).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(products.create).not.toHaveBeenCalled();
    });

    it('mapeia condição USADO_* para "used" na criação do produto', async () => {
      redis.getJson.mockResolvedValue({
        ...review,
        vision: { ...VISION_RESULT, condition: 'USADO_BOM' },
      });

      await service.approve({ reviewId: review.reviewId }, 'user-1');

      expect(products.create).toHaveBeenCalledWith(
        expect.objectContaining({ condition: 'used' }),
        'user-1',
      );
    });
  });
});
