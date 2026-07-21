import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { PrintDevicesService } from './print-devices.service';

/**
 * Cobre o fluxo de pareamento ("código temporário → token"): geração,
 * troca, uso único e código inválido/expirado. Redis é mockado com um mapa
 * em memória — `set` respeita TTL só como metadado (não expira sozinho no
 * teste), mas `del` simula corretamente o "uso único".
 */
describe('PrintDevicesService', () => {
  let service: PrintDevicesService;
  let prisma: {
    printDevice: { findUnique: jest.Mock; update: jest.Mock; create: jest.Mock };
  };
  let redis: { set: jest.Mock; get: jest.Mock; del: jest.Mock };
  let store: Map<string, string>;

  const DEVICE_ID = 'device-1';

  beforeEach(() => {
    store = new Map();
    prisma = {
      printDevice: { findUnique: jest.fn(), update: jest.fn(), create: jest.fn() },
    };
    redis = {
      set: jest.fn(async (key: string, value: string) => {
        store.set(key, value);
      }),
      get: jest.fn(async (key: string) => store.get(key) ?? null),
      del: jest.fn(async (key: string) => {
        store.delete(key);
      }),
    };
    service = new PrintDevicesService(
      prisma as unknown as PrismaService,
      redis as unknown as RedisService,
    );
  });

  describe('createPairingCode / redeemPairingCode', () => {
    it('gera um código, troca por token e o device recebe o token hasheado', async () => {
      prisma.printDevice.findUnique
        .mockResolvedValueOnce({ id: DEVICE_ID }) // assertExists em createPairingCode
        .mockResolvedValueOnce({
          id: DEVICE_ID,
          name: 'PDV 1',
          revokedAt: null,
          pickupPrinter: 'HP',
          shippingPrinter: null,
        }); // lookup em redeemPairingCode

      const { code, expiresAt } = await service.createPairingCode(DEVICE_ID);
      expect(code).toHaveLength(8);
      expect(new Date(expiresAt).getTime()).toBeGreaterThan(Date.now());

      const result = await service.redeemPairingCode(code);

      expect(result.deviceId).toBe(DEVICE_ID);
      expect(result.deviceName).toBe('PDV 1');
      expect(result.token).toEqual(expect.any(String));
      expect(prisma.printDevice.update).toHaveBeenCalledWith({
        where: { id: DEVICE_ID },
        data: { tokenHash: expect.any(String), online: true, lastSeen: expect.any(Date) },
      });
    });

    it('código é de uso único — resgatar a segunda vez falha', async () => {
      prisma.printDevice.findUnique
        .mockResolvedValueOnce({ id: DEVICE_ID })
        .mockResolvedValueOnce({ id: DEVICE_ID, name: 'PDV 1', revokedAt: null });

      const { code } = await service.createPairingCode(DEVICE_ID);
      await service.redeemPairingCode(code);

      await expect(service.redeemPairingCode(code)).rejects.toThrow(
        'Código de pareamento inválido ou expirado.',
      );
    });

    it('código inexistente/expirado é rejeitado', async () => {
      await expect(service.redeemPairingCode('CODIGO99')).rejects.toThrow(
        'Código de pareamento inválido ou expirado.',
      );
    });

    it('device revogado entre a geração do código e o resgate: rejeita', async () => {
      prisma.printDevice.findUnique
        .mockResolvedValueOnce({ id: DEVICE_ID })
        .mockResolvedValueOnce({ id: DEVICE_ID, name: 'PDV 1', revokedAt: new Date() });

      const { code } = await service.createPairingCode(DEVICE_ID);

      await expect(service.redeemPairingCode(code)).rejects.toThrow(
        'Dispositivo não encontrado ou revogado.',
      );
    });
  });
});
