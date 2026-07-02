import { AnthropicService } from '../anthropic/anthropic.service';
import { QueueService } from '../queue/queue.service';
import { RedisService } from '../redis/redis.service';
import { MarketResearchService } from './market-research.service';
import { MarketResearchJob, MarketResearchJobData } from './market-research.types';

/**
 * Testes unitários do MarketResearchService (Hermes Agent). Anthropic, Redis e
 * Queue são todos mockados — nada aqui chama a API de verdade nem depende de
 * Redis real. O handler de background é capturado a partir da chamada a
 * `queue.register` (feita em `onModuleInit`) e invocado diretamente para
 * testar a agregação de estatísticas.
 */

function researchJson(anuncios: unknown[], resumo = 'Resumo do mercado.'): string {
  return JSON.stringify({ anuncios, resumo });
}

describe('MarketResearchService', () => {
  let service: MarketResearchService;
  let anthropic: { research: jest.Mock };
  let redis: { getJson: jest.Mock; setJson: jest.Mock };
  let queue: { register: jest.Mock; enqueue: jest.Mock };
  let registeredHandler: (data: MarketResearchJobData) => Promise<void>;

  beforeEach(() => {
    anthropic = { research: jest.fn() };
    redis = { getJson: jest.fn().mockResolvedValue(null), setJson: jest.fn() };
    queue = {
      register: jest.fn(
        (_name: string, handler: (data: MarketResearchJobData) => Promise<void>) => {
          registeredHandler = handler;
        },
      ),
      enqueue: jest.fn(),
    };

    service = new MarketResearchService(
      anthropic as unknown as AnthropicService,
      redis as unknown as RedisService,
      queue as unknown as QueueService,
    );
    service.onModuleInit();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('request (não-bloqueante)', () => {
    it('monta a query a partir do title e enfileira quando não há cache', async () => {
      const job = await service.request({ title: 'Air Fryer Mondial AF-31' });

      expect(job.status).toBe('PENDING');
      expect(job.query).toBe('Air Fryer Mondial AF-31');
      expect(redis.setJson).toHaveBeenCalledWith(
        expect.stringContaining('market-research:'),
        expect.objectContaining({ status: 'PENDING', query: 'Air Fryer Mondial AF-31' }),
        expect.any(Number),
      );
      expect(queue.enqueue).toHaveBeenCalledWith(
        'market-research.run',
        expect.objectContaining({ query: 'Air Fryer Mondial AF-31' }),
      );
    });

    it('monta a query a partir de marca+modelo+categoria quando não há title', async () => {
      const job = await service.request({
        brand: 'Mondial',
        model: 'AF-31',
        category: 'Fritadeira elétrica',
      });
      expect(job.query).toBe('Mondial AF-31 Fritadeira elétrica');
    });

    it('usa keywords como fallback quando não há title/marca/modelo/categoria', async () => {
      const job = await service.request({ keywords: ['air fryer', 'fritadeira'] });
      expect(job.query).toBe('air fryer fritadeira');
    });

    it('não bloqueia nem chama a Anthropic diretamente — só enfileira', async () => {
      await service.request({ title: 'Qualquer produto' });
      expect(anthropic.research).not.toHaveBeenCalled();
    });

    it('devolve o job em cache sem enfileirar de novo quando já está READY', async () => {
      const cached: MarketResearchJob = {
        key: 'abc123',
        query: 'Air Fryer Mondial AF-31',
        status: 'READY',
        updatedAt: new Date().toISOString(),
      };
      redis.getJson.mockResolvedValue(cached);

      const job = await service.request({ title: 'Air Fryer Mondial AF-31' });
      expect(job).toBe(cached);
      expect(queue.enqueue).not.toHaveBeenCalled();
    });

    it('forceRefresh ignora um resultado READY em cache e enfileira de novo (LearningModule)', async () => {
      const cached: MarketResearchJob = {
        key: 'abc123',
        query: 'Furadeira Bosch',
        status: 'READY',
        updatedAt: new Date().toISOString(),
      };
      redis.getJson.mockResolvedValue(cached);

      const job = await service.request({ title: 'Furadeira Bosch' }, { forceRefresh: true });

      expect(job.status).toBe('PENDING');
      expect(queue.enqueue).toHaveBeenCalledTimes(1);
    });

    it('não duplica o job quando já está PENDING', async () => {
      const cached: MarketResearchJob = {
        key: 'abc123',
        query: 'Air Fryer Mondial AF-31',
        status: 'PENDING',
        updatedAt: new Date().toISOString(),
      };
      redis.getJson.mockResolvedValue(cached);

      const job = await service.request({ title: 'Air Fryer Mondial AF-31' });
      expect(job).toBe(cached);
      expect(queue.enqueue).not.toHaveBeenCalled();
    });

    it('reprocessa quando o job anterior falhou (FAILED)', async () => {
      redis.getJson.mockResolvedValue({
        key: 'abc123',
        query: 'Air Fryer Mondial AF-31',
        status: 'FAILED',
        error: 'boom',
        updatedAt: new Date().toISOString(),
      });

      const job = await service.request({ title: 'Air Fryer Mondial AF-31' });
      expect(job.status).toBe('PENDING');
      expect(queue.enqueue).toHaveBeenCalledTimes(1);
    });

    it('gera a mesma chave de cache para a mesma query normalizada (case/espacos)', async () => {
      await service.request({ title: 'Air Fryer Mondial' });
      const key1 = (queue.enqueue.mock.calls[0][1] as MarketResearchJobData).key;

      await service.request({ title: '  air fryer mondial  ' });
      const key2 = (queue.enqueue.mock.calls[1][1] as MarketResearchJobData).key;

      expect(key1).toBe(key2);
    });
  });

  describe('get (poll)', () => {
    it('devolve null quando a chave não existe', async () => {
      redis.getJson.mockResolvedValue(null);
      expect(await service.get('inexistente')).toBeNull();
    });

    it('devolve o job quando existe', async () => {
      const job: MarketResearchJob = {
        key: 'abc',
        query: 'x',
        status: 'READY',
        updatedAt: new Date().toISOString(),
      };
      redis.getJson.mockResolvedValue(job);
      expect(await service.get('abc')).toBe(job);
    });
  });

  describe('worker de background (handler registrado na fila)', () => {
    it('agrega preços por marketplace, deduplica URLs e ignora marketplaces desconhecidos', async () => {
      anthropic.research.mockResolvedValue(
        researchJson(
          [
            {
              marketplace: 'MERCADO_LIVRE',
              titulo: 'Air Fryer A',
              preco: 199.9,
              url: 'https://mercadolivre.com.br/a',
            },
            {
              marketplace: 'MERCADO_LIVRE',
              titulo: 'Air Fryer B',
              preco: 'R$ 249,90',
              url: 'https://mercadolivre.com.br/b',
            },
            {
              marketplace: 'SHOPEE',
              titulo: 'Air Fryer C',
              preco: 179.5,
              url: 'https://shopee.com.br/c',
            },
            {
              marketplace: 'SHOPEE',
              titulo: 'Sem preço',
              preco: null,
              url: 'https://shopee.com.br/d',
            },
            {
              marketplace: 'AMAZON',
              titulo: 'Marketplace inválido',
              preco: 100,
              url: 'https://amazon.com.br/x',
            },
            {
              marketplace: 'MERCADO_LIVRE',
              titulo: 'URL duplicada',
              preco: 500,
              url: 'https://mercadolivre.com.br/a',
            },
          ],
          'Preços entre R$180 e R$250, boa disponibilidade.',
        ),
      );

      await registeredHandler({ key: 'k1', query: 'Air Fryer', input: {} });

      expect(redis.setJson).toHaveBeenCalledWith(
        'market-research:k1',
        expect.objectContaining({ key: 'k1', query: 'Air Fryer', status: 'READY' }),
        12 * 60 * 60,
      );
      const job = redis.setJson.mock.calls[0][1] as MarketResearchJob;
      const data = job.data!;

      expect(data.listingCount).toBe(3); // só os com preço válido (AMAZON e dup excluídos)
      expect(data.minPrice).toBe(179.5);
      expect(data.maxPrice).toBe(249.9);
      expect(data.avgPrice).toBeCloseTo(209.77, 2);
      expect(data.summary).toBe('Preços entre R$180 e R$250, boa disponibilidade.');
      expect(data.links).toHaveLength(4); // a, b, c, d (dup de "a" excluída)

      const ml = data.byMarketplace.find((m) => m.marketplace === 'MERCADO_LIVRE')!;
      expect(ml.listingCount).toBe(2);
      expect(ml.minPrice).toBe(199.9);
      expect(ml.maxPrice).toBe(249.9);

      const shopee = data.byMarketplace.find((m) => m.marketplace === 'SHOPEE')!;
      expect(shopee.listingCount).toBe(1); // só "c" tem preço; "d" entra em links mas não no cálculo
      expect(shopee.links).toHaveLength(2);
    });

    it('grava resultado vazio (sem erro) quando não encontra nenhum anúncio', async () => {
      anthropic.research.mockResolvedValue(
        researchJson([], 'Nenhum anúncio encontrado no momento.'),
      );

      await registeredHandler({ key: 'k2', query: 'Produto raro', input: {} });

      const job = redis.setJson.mock.calls[0][1] as MarketResearchJob;
      expect(job.status).toBe('READY');
      expect(job.data!.listingCount).toBe(0);
      expect(job.data!.minPrice).toBeNull();
      expect(job.data!.byMarketplace).toEqual([]);
    });

    it('grava FAILED quando a pesquisa (Anthropic) falha', async () => {
      anthropic.research.mockRejectedValue(new Error('rate limit'));

      await registeredHandler({ key: 'k3', query: 'Air Fryer', input: {} });

      expect(redis.setJson).toHaveBeenCalledWith(
        'market-research:k3',
        expect.objectContaining({ status: 'FAILED', error: 'rate limit' }),
        10 * 60,
      );
    });

    it('grava resumo padrão quando o modelo não devolve JSON parseável', async () => {
      anthropic.research.mockResolvedValue('desculpe, não consegui pesquisar agora.');

      await registeredHandler({ key: 'k4', query: 'Air Fryer', input: {} });

      const job = redis.setJson.mock.calls[0][1] as MarketResearchJob;
      expect(job.status).toBe('READY');
      expect(job.data!.summary).toBe('Sem resumo disponível.');
      expect(job.data!.listingCount).toBe(0);
    });

    it('restringe a busca aos domínios do Mercado Livre e Shopee', async () => {
      anthropic.research.mockResolvedValue(researchJson([]));

      await registeredHandler({ key: 'k5', query: 'Air Fryer', input: {} });

      expect(anthropic.research).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          allowedDomains: ['mercadolivre.com.br', 'shopee.com.br'],
        }),
      );
    });
  });
});
