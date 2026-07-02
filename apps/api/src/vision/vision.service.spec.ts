import { ServiceUnavailableException, UnprocessableEntityException } from '@nestjs/common';
import { OllamaService } from '../ollama/ollama.service';
import { VisionService } from './vision.service';

/**
 * Testes unitários do VisionService. O Ollama é mockado via global.fetch, então
 * rodam sem o modelo instalado. Cobrem: normalização do JSON, tolerância de
 * parsing, degradação/erros e validação de entrada. Um teste de integração real
 * (com Ollama de pé) fica no script scripts/vision-smoke.ts.
 */

/** Monta a resposta que o Ollama /api/chat devolveria com um dado content. */
function ollamaOk(content: string) {
  return {
    ok: true,
    status: 200,
    json: async () => ({ message: { content } }),
    text: async () => '',
  } as unknown as Response;
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

// base64 de "x" — conteúdo irrelevante pois o fetch é mockado.
const B64 = Buffer.from('x').toString('base64');

describe('VisionService', () => {
  let service: VisionService;
  let fetchMock: jest.Mock;

  beforeEach(() => {
    service = new VisionService(new OllamaService());
    fetchMock = jest.fn();
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('normaliza um JSON completo do modelo', async () => {
    fetchMock.mockResolvedValue(ollamaOk(FULL_JSON));

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
      modelUsed: 'qwen2.5vl',
    });
    // dedup case-insensitive em características
    expect(result.features).toEqual(['display digital', 'cesto removível']);
    expect(result.keywords).toEqual(['air fryer', 'fritadeira', 'mondial']);
  });

  it('envia todas as imagens em uma única chamada ao Ollama', async () => {
    fetchMock.mockResolvedValue(ollamaOk(FULL_JSON));

    await service.analyze({ imagesBase64: [B64, B64, B64] });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toContain('/api/chat');
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.model).toBe('qwen2.5vl');
    expect(body.format).toBe('json');
    expect(body.messages[0].images).toHaveLength(3);
  });

  it('extrai JSON mesmo quando vem cercado por texto', async () => {
    const noisy = 'Claro! Aqui está:\n```json\n' + FULL_JSON + '\n```\nEspero ter ajudado.';
    fetchMock.mockResolvedValue(ollamaOk(noisy));

    const result = await service.analyze({ imagesBase64: [B64] });
    expect(result.brand).toBe('Mondial');
  });

  it('usa null para atributos ausentes ou "null" textual, e clampa confiança', async () => {
    fetchMock.mockResolvedValue(
      ollamaOk(
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
    fetchMock.mockResolvedValue(ollamaOk('desculpe, não consegui identificar o produto.'));
    await expect(service.analyze({ imagesBase64: [B64] })).rejects.toBeInstanceOf(
      UnprocessableEntityException,
    );
  });

  it('lança ServiceUnavailable quando o Ollama está fora do ar', async () => {
    fetchMock.mockRejectedValue(new Error('ECONNREFUSED'));
    await expect(service.analyze({ imagesBase64: [B64] })).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });

  it('orienta pull do modelo quando o Ollama responde 404', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 404,
      text: async () => 'model not found',
    } as unknown as Response);

    await expect(service.analyze({ imagesBase64: [B64] })).rejects.toThrow(/ollama pull/);
  });

  it('rejeita quando nenhuma imagem é enviada', async () => {
    await expect(service.analyze({})).rejects.toBeInstanceOf(UnprocessableEntityException);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejeita quando passa de 5 imagens', async () => {
    await expect(service.analyze({ imagesBase64: Array(6).fill(B64) })).rejects.toThrow(/Máximo/);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
