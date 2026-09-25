import { WhatsappRelayRole } from '@prisma/client';
import type { WAMessage } from '@whiskeysockets/baileys';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { BaileysService } from './baileys.service';
import { describeRelayMessage } from './relay-message';
import { WhatsappRelayService } from './whatsapp-relay.service';

// BaileysService importa `@whiskeysockets/baileys`, que é ESM puro e o Jest não
// consegue parsear. Nenhum código dele roda aqui — o serviço é mockado.
jest.mock('./baileys.service', () => ({ BaileysService: jest.fn() }));

const SOURCE_JID = '120363000000000001@g.us';
const NOW = Date.UTC(2026, 8, 25, 12, 0, 0);

function msg(overrides: Partial<WAMessage['key']> = {}, message: WAMessage['message'] = null) {
  return {
    key: { remoteJid: SOURCE_JID, fromMe: true, id: 'MSG1', ...overrides },
    messageTimestamp: Math.floor(NOW / 1000) - 5,
    message: message ?? { imageMessage: { caption: 'iPhone 13 128GB — R$ 2.500' } },
  } as WAMessage;
}

const source = {
  id: 'src',
  jid: SOURCE_JID,
  name: 'Lotes',
  role: WhatsappRelayRole.SOURCE,
  active: true,
};
const targets = [
  { id: 't1', jid: '1@g.us', name: 'Venda 1', role: WhatsappRelayRole.TARGET, active: true },
  { id: 't2', jid: '2@g.us', name: 'Venda 2', role: WhatsappRelayRole.TARGET, active: true },
];

describe('WhatsappRelayService', () => {
  let prisma: {
    whatsappRelayGroup: { findUnique: jest.Mock; findMany: jest.Mock };
    whatsappRelayLog: { create: jest.Mock };
  };
  let redis: { get: jest.Mock; increment: jest.Mock };
  let baileys: { copyMessage: jest.Mock; onGroupMessage: jest.Mock };
  let service: WhatsappRelayService;
  let seen: Set<string>;

  beforeEach(() => {
    seen = new Set();
    prisma = {
      whatsappRelayGroup: {
        findUnique: jest.fn().mockResolvedValue(source),
        findMany: jest.fn().mockResolvedValue(targets),
      },
      whatsappRelayLog: { create: jest.fn() },
    };
    redis = {
      get: jest.fn().mockResolvedValue('1'),
      increment: jest.fn(async (key: string) => {
        const count = seen.has(key) ? 2 : 1;
        seen.add(key);
        return count;
      }),
    };
    baileys = {
      copyMessage: jest.fn(async (jid: string) => `copy-${jid}`),
      onGroupMessage: jest.fn(),
    };
    service = new WhatsappRelayService(
      prisma as unknown as PrismaService,
      redis as unknown as RedisService,
      baileys as unknown as BaileysService,
    );
    jest.spyOn(service as unknown as { pause: () => Promise<void> }, 'pause').mockResolvedValue();
  });

  it('copia a mensagem da loja para todos os grupos de venda e registra cada envio', async () => {
    const message = msg();
    await service.handle(message, NOW);

    const copy = { ...message, message: message.message };
    expect(baileys.copyMessage.mock.calls).toEqual([
      ['1@g.us', copy],
      ['2@g.us', copy],
    ]);
    expect(prisma.whatsappRelayLog.create).toHaveBeenCalledTimes(2);
    expect(prisma.whatsappRelayLog.create.mock.calls[0][0].data).toMatchObject({
      sourceName: 'Lotes',
      targetName: 'Venda 1',
      kind: 'image',
      preview: 'iPhone 13 128GB — R$ 2.500',
      success: true,
      messageId: 'copy-1@g.us',
    });
  });

  it('ignora mensagens de outros participantes', async () => {
    await service.handle(msg({ fromMe: false }), NOW);
    expect(baileys.copyMessage).not.toHaveBeenCalled();
  });

  it('não faz nada com o repasse desligado', async () => {
    redis.get.mockResolvedValue(null);
    await service.handle(msg(), NOW);
    expect(baileys.copyMessage).not.toHaveBeenCalled();
  });

  it('ignora grupos que não são de lotes ou estão pausados', async () => {
    prisma.whatsappRelayGroup.findUnique.mockResolvedValueOnce(null);
    await service.handle(msg(), NOW);
    prisma.whatsappRelayGroup.findUnique.mockResolvedValueOnce({ ...source, active: false });
    await service.handle(msg({ id: 'MSG2' }), NOW);
    prisma.whatsappRelayGroup.findUnique.mockResolvedValueOnce({
      ...source,
      role: WhatsappRelayRole.TARGET,
    });
    await service.handle(msg({ id: 'MSG3' }), NOW);
    expect(baileys.copyMessage).not.toHaveBeenCalled();
  });

  it('repassa a mesma mensagem uma vez só', async () => {
    await service.handle(msg(), NOW);
    await service.handle(msg(), NOW);
    expect(baileys.copyMessage).toHaveBeenCalledTimes(2);
  });

  it('ignora mensagens antigas', async () => {
    const old = { ...msg(), messageTimestamp: Math.floor(NOW / 1000) - 60 * 60 };
    await service.handle(old as WAMessage, NOW);
    expect(baileys.copyMessage).not.toHaveBeenCalled();
  });

  it('continua para os próximos grupos quando um envio falha', async () => {
    baileys.copyMessage.mockRejectedValueOnce(new Error('not-authorized'));
    await service.handle(msg(), NOW);

    expect(baileys.copyMessage).toHaveBeenCalledTimes(2);
    expect(prisma.whatsappRelayLog.create.mock.calls[0][0].data).toMatchObject({
      success: false,
      error: 'not-authorized',
      messageId: null,
    });
    expect(prisma.whatsappRelayLog.create.mock.calls[1][0].data.success).toBe(true);
  });

  it('processa em fila, na ordem de chegada', async () => {
    jest.spyOn(Date, 'now').mockReturnValue(NOW);
    const order: string[] = [];
    baileys.copyMessage.mockImplementation(async (jid: string, m: WAMessage) => {
      order.push(`${m.key.id}->${jid}`);
      return 'x';
    });
    service.enqueue(msg({ id: 'A' }));
    await service.enqueue(msg({ id: 'B' }));
    expect(order).toEqual(['A->1@g.us', 'A->2@g.us', 'B->1@g.us', 'B->2@g.us']);
  });
});

describe('describeRelayMessage', () => {
  it('aceita texto, foto, vídeo, documento e áudio', () => {
    expect(describeRelayMessage(msg({}, { conversation: 'Lote novo!' }))).toEqual({
      kind: 'text',
      preview: 'Lote novo!',
      content: { conversation: 'Lote novo!' },
    });
    expect(describeRelayMessage(msg({}, { extendedTextMessage: { text: 'link' } }))?.kind).toBe(
      'text',
    );
    expect(describeRelayMessage(msg({}, { videoMessage: {} }))).toMatchObject({
      kind: 'video',
      preview: null,
    });
    expect(
      describeRelayMessage(msg({}, { documentMessage: { fileName: 'lista.pdf' } })),
    ).toMatchObject({ kind: 'document', preview: 'lista.pdf' });
    expect(describeRelayMessage(msg({}, { audioMessage: {} }))?.kind).toBe('audio');
  });

  it('copia só o conteúdo, sem os campos internos da mensagem original', () => {
    const info = describeRelayMessage(
      msg(
        {},
        {
          senderKeyDistributionMessage: { groupId: SOURCE_JID },
          imageMessage: { caption: 'x' },
          messageContextInfo: {},
        },
      ),
    );
    expect(info?.content).toEqual({ imageMessage: { caption: 'x' } });
  });

  it('desembrulha mensagens temporárias', () => {
    expect(
      describeRelayMessage(
        msg({}, { ephemeralMessage: { message: { imageMessage: { caption: 'oi' } } } }),
      ),
    ).toMatchObject({ kind: 'image', preview: 'oi' });
  });

  it('ignora reações, figurinhas, mensagens apagadas e texto vazio', () => {
    expect(describeRelayMessage(msg({}, { reactionMessage: { text: '👍' } }))).toBeNull();
    expect(describeRelayMessage(msg({}, { stickerMessage: {} }))).toBeNull();
    expect(describeRelayMessage(msg({}, { protocolMessage: { type: 0 } }))).toBeNull();
    expect(describeRelayMessage(msg({}, { conversation: '   ' }))).toBeNull();
  });
});
