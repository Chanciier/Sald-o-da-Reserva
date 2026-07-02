import { UnprocessableEntityException } from '@nestjs/common';
import { OllamaService } from '../ollama/ollama.service';
import { PrismaService } from '../prisma/prisma.service';
import { IdentificationService } from './identification.service';
import { IdentificationInput } from './identification.types';

/**
 * Testes unitários do IdentificationService. Ollama é mockado via
 * global.fetch (mesma estratégia do VisionService); Prisma é mockado com um
 * stub mínimo de `category.findMany`, sem banco real.
 */

function ollamaOk(content: string) {
  return {
    ok: true,
    status: 200,
    json: async () => ({ message: { content } }),
    text: async () => '',
  } as unknown as Response;
}

const VISION_OUTPUT: IdentificationInput = {
  brand: 'Mondial',
  model: 'Air Fryer AF-31',
  category: 'Fritadeira elétrica',
  color: 'preto',
  material: 'plástico e inox',
  dimensions: '30 x 25 x 30 cm',
  condition: 'USADO_BOM',
  features: ['display digital', 'cesto removível'],
  keywords: ['air fryer', 'fritadeira', 'mondial'],
  confidence: 0.87,
};

const FULL_JSON = JSON.stringify({
  titulo_seo: 'Air Fryer Mondial AF-31 5L Preta - Usada, Ótimo Estado',
  descricao:
    'Fritadeira elétrica Mondial AF-31, na cor preta, com display digital e cesto removível. Usada, com sinais mínimos de uso, totalmente funcional.',
  especificacoes: [
    { label: 'Capacidade', value: '5 litros' },
    { label: 'Voltagem', value: 'Bivolt' },
    { label: 'Marca', value: 'Mondial (repetida de propósito p/ testar dedup)' },
  ],
  categoria: 'Eletroportáteis',
  tags: ['fritadeira sem óleo', 'cozinha', 'air fryer'],
  meta_description: 'Air Fryer Mondial AF-31 usada, ótimo estado, com display digital.',
});

describe('IdentificationService', () => {
  let service: IdentificationService;
  let fetchMock: jest.Mock;
  let findManyMock: jest.Mock;
  let prisma: { category: { findMany: jest.Mock } };

  beforeEach(() => {
    fetchMock = jest.fn();
    global.fetch = fetchMock as unknown as typeof fetch;

    findManyMock = jest.fn().mockResolvedValue([
      { id: 'cat-eletro', name: 'Eletroportáteis' },
      { id: 'cat-moveis', name: 'Móveis' },
    ]);
    prisma = { category: { findMany: findManyMock } };

    service = new IdentificationService(new OllamaService(), prisma as unknown as PrismaService);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('gera todos os campos pedidos a partir do JSON do Vision', async () => {
    fetchMock.mockResolvedValue(ollamaOk(FULL_JSON));

    const result = await service.generate(VISION_OUTPUT);

    expect(result.seoTitle).toBe('Air Fryer Mondial AF-31 5L Preta - Usada, Ótimo Estado');
    expect(result.description).toContain('Mondial AF-31');
    expect(result.category).toBe('Eletroportáteis');
    expect(result.categoryId).toBe('cat-eletro'); // casou por nome exato
    expect(result.tags).toEqual(
      expect.arrayContaining([
        'air fryer',
        'fritadeira',
        'mondial',
        'fritadeira sem óleo',
        'cozinha',
      ]),
    );
    expect(result.slug).toBe('air-fryer-mondial-af-31-5l-preta-usada-otimo-estado');
    expect(result.metaDescription).toBe(
      'Air Fryer Mondial AF-31 usada, ótimo estado, com display digital.',
    );
    expect(result.modelUsed).toBeTruthy();
  });

  it('inclui especificações do modelo + do Vision, sem duplicar por label', async () => {
    fetchMock.mockResolvedValue(ollamaOk(FULL_JSON));

    const result = await service.generate(VISION_OUTPUT);

    const labels = result.specifications.map((s) => s.label.toLowerCase());
    // Uma ocorrência só de "marca" mesmo vindo do modelo E do Vision (modelo ganha, é o 1º a ser inserido)
    expect(labels.filter((l) => l === 'marca')).toHaveLength(1);
    const marca = result.specifications.find((s) => s.label.toLowerCase() === 'marca');
    expect(marca?.value).toContain('Mondial');
    // Specs que só o Vision tinha (modelo não repetiu) devem aparecer também
    expect(labels).toEqual(
      expect.arrayContaining(['capacidade', 'voltagem', 'modelo', 'cor', 'material', 'dimensões']),
    );
  });

  it('deduplica tags entre Vision e modelo, case-insensitive', async () => {
    fetchMock.mockResolvedValue(
      ollamaOk(
        JSON.stringify({
          titulo_seo: 'Produto X',
          descricao: 'desc',
          especificacoes: [],
          categoria: 'Outros',
          tags: ['Air Fryer', 'NOVO TERMO'],
          meta_description: 'meta',
        }),
      ),
    );

    const result = await service.generate({ keywords: ['air fryer', 'fritadeira'] });
    const lower = result.tags.map((t) => t.toLowerCase());
    expect(lower.filter((t) => t === 'air fryer')).toHaveLength(1);
    expect(lower).toContain('novo termo');
  });

  it('casa categoria por correspondência parcial quando não há match exato', async () => {
    fetchMock.mockResolvedValue(
      ollamaOk(
        JSON.stringify({
          titulo_seo: 'Cadeira de escritório',
          descricao: 'desc',
          especificacoes: [],
          categoria: 'Móveis de escritório',
          tags: [],
          meta_description: 'meta',
        }),
      ),
    );

    const result = await service.generate({});
    expect(result.categoryId).toBe('cat-moveis'); // "Móveis" está contido em "Móveis de escritório"
  });

  it('deixa categoryId nulo quando nenhuma categoria cadastrada bate', async () => {
    findManyMock.mockResolvedValue([{ id: 'cat-x', name: 'Categoria Totalmente Diferente' }]);
    fetchMock.mockResolvedValue(
      ollamaOk(
        JSON.stringify({
          titulo_seo: 'Produto Y',
          descricao: 'desc',
          especificacoes: [],
          categoria: 'Eletrônicos',
          tags: [],
          meta_description: 'meta',
        }),
      ),
    );

    const result = await service.generate({});
    expect(result.category).toBe('Eletrônicos');
    expect(result.categoryId).toBeNull();
  });

  it('usa título de fallback (marca+modelo) quando o modelo não devolve titulo_seo', async () => {
    fetchMock.mockResolvedValue(
      ollamaOk(
        JSON.stringify({
          descricao: 'desc',
          especificacoes: [],
          categoria: null,
          tags: [],
          meta_description: 'meta',
        }),
      ),
    );

    const result = await service.generate({ brand: 'Mondial', model: 'AF-31' });
    expect(result.seoTitle).toBe('Mondial AF-31');
    expect(result.slug).toBe('mondial-af-31');
    expect(result.categoryId).toBeNull();
    expect(findManyMock).not.toHaveBeenCalled(); // sem categoria sugerida, não consulta o banco à toa
  });

  it('trunca título e meta description nos limites do schema', async () => {
    const longTitle = 'T'.repeat(250);
    const longMeta = 'M'.repeat(300);
    fetchMock.mockResolvedValue(
      ollamaOk(
        JSON.stringify({
          titulo_seo: longTitle,
          descricao: 'desc',
          especificacoes: [],
          categoria: null,
          tags: [],
          meta_description: longMeta,
        }),
      ),
    );

    const result = await service.generate({});
    expect(result.seoTitle.length).toBeLessThanOrEqual(200);
    expect(result.metaDescription.length).toBeLessThanOrEqual(160);
  });

  it('lança UnprocessableEntity quando o modelo não devolve JSON', async () => {
    fetchMock.mockResolvedValue(ollamaOk('não consigo gerar isso agora.'));
    await expect(service.generate({})).rejects.toBeInstanceOf(UnprocessableEntityException);
  });

  it('envia os atributos do Vision no prompt enviado ao Ollama', async () => {
    fetchMock.mockResolvedValue(ollamaOk(FULL_JSON));

    await service.generate(VISION_OUTPUT);

    const [, init] = fetchMock.mock.calls[0];
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.messages[0].content).toContain('Mondial');
    expect(body.messages[0].content).toContain('Air Fryer AF-31');
    expect(body.format).toBe('json');
  });
});
