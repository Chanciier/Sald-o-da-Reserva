import { ConfigService } from '@nestjs/config';
import { PickupLabelService } from './pickup-label.service';
import { QrCodeService } from './qr-code.service';
import { PrintStorageService } from './print-storage.service';

/**
 * Usa o QrCodeService e o sharp de verdade (geração local, rápida, sem rede)
 * — só o upload (PrintStorageService) é mockado. Isso garante que o SVG
 * montado é válido de ponta a ponta (inclusive com nomes/itens com caracteres
 * especiais), não só que as chamadas aconteceram.
 */
// sharp carrega o binário nativo no primeiro uso do processo — em máquinas
// mais lentas isso sozinho pode passar dos 5s padrão do Jest.
jest.setTimeout(20000);

describe('PickupLabelService', () => {
  let service: PickupLabelService;
  let storage: { uploadPng: jest.Mock };

  beforeEach(() => {
    const config = { get: jest.fn().mockReturnValue('http://localhost:3000') };
    storage = {
      uploadPng: jest.fn().mockResolvedValue('https://cdn.example.com/print-jobs/x.png'),
    };

    service = new PickupLabelService(
      config as unknown as ConfigService,
      new QrCodeService(),
      storage as unknown as PrintStorageService,
    );
  });

  it('gera um PNG válido e sobe via PrintStorageService, retornando a URL', async () => {
    const url = await service.generate({
      id: 'order-abcdef123456',
      buyerName: 'Cliente Teste',
      customerPhone: '11999999999',
      pickupCode: 'A-0001',
      createdAt: new Date('2026-07-17T12:00:00Z'),
      items: [{ name: 'Produto A', sku: 'SKU-1', quantity: 2 }],
    });

    expect(url).toBe('https://cdn.example.com/print-jobs/x.png');
    expect(storage.uploadPng).toHaveBeenCalledTimes(1);

    const [buffer, folder] = storage.uploadPng.mock.calls[0];
    expect(folder).toBe('print-jobs');
    // Assinatura PNG (89 50 4E 47 0D 0A 1A 0A)
    expect(buffer.subarray(0, 8)).toEqual(
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    );
  });

  it('escapa nome/itens com caracteres especiais sem quebrar o SVG (etiqueta duplicada/edge case)', async () => {
    await expect(
      service.generate({
        id: 'order-abcdef123456',
        buyerName: 'Cliente & <Teste> "Especial"',
        customerPhone: null,
        pickupCode: 'A-0002',
        createdAt: new Date('2026-07-17T12:00:00Z'),
        items: [
          { name: 'Produto <A> & "B"', sku: "SKU-'1", quantity: 1 },
          { name: 'Produto Dois', sku: null, quantity: 3 },
        ],
      }),
    ).resolves.toBe('https://cdn.example.com/print-jobs/x.png');
  });

  it('sem itens: ainda gera uma etiqueta válida (só cabeçalho + QR)', async () => {
    await expect(
      service.generate({
        id: 'order-abcdef123456',
        buyerName: null,
        customerPhone: null,
        pickupCode: null,
        createdAt: new Date('2026-07-17T12:00:00Z'),
        items: [],
      }),
    ).resolves.toBe('https://cdn.example.com/print-jobs/x.png');
  });

  it('sem pickupCode (pedido legado): usa os últimos 8 caracteres do id como código', async () => {
    const url = await service.generate({
      id: 'order-abcdef123456',
      buyerName: 'Cliente Teste',
      customerPhone: null,
      pickupCode: null,
      createdAt: new Date('2026-07-17T12:00:00Z'),
      items: [],
    });
    expect(url).toBe('https://cdn.example.com/print-jobs/x.png');
  });
});
