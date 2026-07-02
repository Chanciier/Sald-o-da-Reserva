import Anthropic from '@anthropic-ai/sdk';
import { ServiceUnavailableException, UnprocessableEntityException } from '@nestjs/common';
import { AnthropicService } from '../anthropic/anthropic.service';
import { VisionService } from './vision.service';

/**
 * Testes unitários do VisionService. A Anthropic é mockada via um cliente
 * fake injetado no AnthropicService (só `messages.create` é mockado), então
 * rodam sem chamar a API de verdade. Cobrem: normalização do JSON, tolerância
 * de parsing, degradação/erros e validação de entrada. Um teste de integração
 * real (com a API de verdade) fica no script scripts/vision-smoke.ts.
 */

/** Monta a resposta que `client.messages.create` devolveria com um dado texto. */
function claudeOk(text: string): Anthropic.Message {
  return {
    content: [{ type: 'text', text, citations: [] }],
  } as unknown as Anthropic.Message;
}

const FULL_JSON = JSON.stringify({
  marca: 'Mondial',
  modelo: 'Air Fryer AF-31',
  categoria: 'Fritadeira elétrica',
  cor: 'preto',
  material: 'plástico e inox',
  dimensoes: '30 x 25 x 30 cm',
  estado: 'usado_bom',
  caracteristicas: ['display digital', 'cesto removível', 'display digital'],
  palavras_chave: ['air fryer', 'fritadeira', 'mondial'],
  confianca: 0.87,
});

// base64 de "x" — conteúdo irrelevante pois a API é mockada.
const B64 = Buffer.from('x').toString('base64');

describe('VisionService', () => {
  let service: VisionService;
  let createMock: jest.Mock;

  beforeEach(() => {
    createMock = jest.fn();
    const fakeClient = { messages: { create: createMock } } as unknown as Anthropic;
    service = new VisionService(new AnthropicService(fakeClient));
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('normaliza um JSON completo do modelo', async () => {
    createMock.mockResolvedValue(claudeOk(FULL_JSON));

    const result = await service.analyze({ imagesBase64: [B64] });

    expect(result).toMatchObject({
      brand: 'Mondial',
      model: 'Air Fryer AF-31',
      category: 'Fritadeira elétrica',
      color: 'preto',
      material: 'plástico e inox',
      dimensions: '30 x 25 x 30 cm',
      condition: 'USADO_BOM', // normalizado para maiúsculas
      confidence: 0.87,
      imagesAnalyzed: 1,
      modelUsed: 'claude-sonnet-5',
    });
    // dedup case-insensitive em características
    expect(result.features).toEqual(['display digital', 'cesto removível']);
    expect(result.keywords).toEqual(['air fryer', 'fritadeira', 'mondial']);
  });

  it('envia todas as imagens em uma única chamada à Anthropic', async () => {
    createMock.mockResolvedValue(claudeOk(FULL_JSON));

    await service.analyze({ imagesBase64: [B64, B64, B64] });

    expect(createMock).toHaveBeenCalledTimes(1);
    const [params] = createMock.mock.calls[0];
    expect(params.model).toBe('claude-sonnet-5');
    const content = params.messages[0].content as Array<{ type: string }>;
    expect(content.filter((c) => c.type === 'image')).toHaveLength(3);
    expect(content.filter((c) => c.type === 'text')).toHaveLength(1);
  });

  it('extrai JSON mesmo quando vem cercado por texto', async () => {
    const noisy = 'Claro! Aqui está:\n```json\n' + FULL_JSON + '\n```\nEspero ter ajudado.';
    createMock.mockResolvedValue(claudeOk(noisy));

    const result = await service.analyze({ imagesBase64: [B64] });
    expect(result.brand).toBe('Mondial');
  });

  it('usa null para atributos ausentes ou "null" textual, e clampa confiança', async () => {
    createMock.mockResolvedValue(
      claudeOk(
        JSON.stringify({
          marca: 'null',
          cor: '   ',
          estado: 'INEXISTENTE',
          caracteristicas: 'única, , duas',
          confianca: 5, // fora do range → clamp para 1
        }),
      ),
    );

    const result = await service.analyze({ imagesBase64: [B64] });
    expect(result.brand).toBeNull();
    expect(result.color).toBeNull();
    expect(result.condition).toBeNull(); // valor inválido → null
    expect(result.features).toEqual(['única', 'duas']); // string CSV → array, vazios removidos
    expect(result.keywords).toEqual([]);
    expect(result.confidence).toBe(1);
  });

  it('lança UnprocessableEntity quando o modelo não devolve JSON', async () => {
    createMock.mockResolvedValue(claudeOk('desculpe, não consegui identificar o produto.'));
    await expect(service.analyze({ imagesBase64: [B64] })).rejects.toBeInstanceOf(
      UnprocessableEntityException,
    );
  });

  it('lança ServiceUnavailable quando a Anthropic está fora do ar', async () => {
    createMock.mockRejectedValue(new Error('ECONNREFUSED'));
    await expect(service.analyze({ imagesBase64: [B64] })).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });

  it('lança ServiceUnavailable quando a API retorna um erro (ex.: modelo inválido)', async () => {
    createMock.mockRejectedValue(
      new Anthropic.APIError(
        404,
        { error: { message: 'model not found' } },
        'not found',
        undefined,
      ),
    );
    await expect(service.analyze({ imagesBase64: [B64] })).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });

  it('rejeita quando nenhuma imagem é enviada', async () => {
    await expect(service.analyze({})).rejects.toBeInstanceOf(UnprocessableEntityException);
    expect(createMock).not.toHaveBeenCalled();
  });

  it('rejeita quando passa de 5 imagens', async () => {
    await expect(service.analyze({ imagesBase64: Array(6).fill(B64) })).rejects.toThrow(/Máximo/);
    expect(createMock).not.toHaveBeenCalled();
  });
});
