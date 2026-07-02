import Anthropic from '@anthropic-ai/sdk';
import { ServiceUnavailableException } from '@nestjs/common';
import { AnthropicService } from './anthropic.service';

/**
 * Testes unitários do AnthropicService. `chat` já é coberto indiretamente
 * pelos specs de VisionService/IdentificationService — aqui o foco é
 * `research` (web search hospedada + laço de `pause_turn`), que não tem
 * outro consumidor testado diretamente além do MarketResearchService (que
 * mocka o AnthropicService inteiro).
 */

function claudeMessage(
  text: string,
  stopReason: Anthropic.Message['stop_reason'] = 'end_turn',
): Anthropic.Message {
  return {
    content: [{ type: 'text', text, citations: [] }],
    stop_reason: stopReason,
  } as unknown as Anthropic.Message;
}

describe('AnthropicService', () => {
  let service: AnthropicService;
  let createMock: jest.Mock;

  beforeEach(() => {
    createMock = jest.fn();
    const fakeClient = { messages: { create: createMock } } as unknown as Anthropic;
    service = new AnthropicService(fakeClient);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('research', () => {
    it('declara a ferramenta de web search com os domínios e limites informados', async () => {
      createMock.mockResolvedValue(claudeMessage('{"anuncios":[],"resumo":"ok"}'));

      await service.research('pesquise X', {
        allowedDomains: ['mercadolivre.com.br', 'shopee.com.br'],
        maxSearches: 6,
      });

      const [params] = createMock.mock.calls[0];
      expect(params.tools).toEqual([
        {
          type: 'web_search_20260209',
          name: 'web_search',
          max_uses: 6,
          allowed_domains: ['mercadolivre.com.br', 'shopee.com.br'],
        },
      ]);
    });

    it('devolve o texto final quando a resposta termina em end_turn (sem pause)', async () => {
      createMock.mockResolvedValue(claudeMessage('resultado final', 'end_turn'));

      const result = await service.research('pesquise X');

      expect(result).toBe('resultado final');
      expect(createMock).toHaveBeenCalledTimes(1);
    });

    it('continua o laço quando a API pausa (pause_turn) e devolve o texto final', async () => {
      createMock
        .mockResolvedValueOnce(claudeMessage('buscando...', 'pause_turn'))
        .mockResolvedValueOnce(claudeMessage('resultado final', 'end_turn'));

      const result = await service.research('pesquise X');

      expect(result).toBe('resultado final');
      expect(createMock).toHaveBeenCalledTimes(2);

      // A 2ª chamada deve reenviar o histórico com o turno pausado do assistant.
      const [, secondCallParams] = createMock.mock.calls.map((c) => c[0]);
      expect(secondCallParams.messages).toHaveLength(2);
      expect(secondCallParams.messages[1].role).toBe('assistant');
    });

    it('para após o limite de rodadas para evitar loop infinito em pause_turn contínuo', async () => {
      createMock.mockResolvedValue(claudeMessage('ainda buscando...', 'pause_turn'));

      const result = await service.research('pesquise X');

      expect(result).toBe('ainda buscando...');
      expect(createMock.mock.calls.length).toBeLessThanOrEqual(6);
    });

    it('lança ServiceUnavailable quando a API falha', async () => {
      createMock.mockRejectedValue(new Error('ECONNREFUSED'));
      await expect(service.research('pesquise X')).rejects.toBeInstanceOf(
        ServiceUnavailableException,
      );
    });
  });
});
