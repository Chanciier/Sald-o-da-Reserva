import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { MailService } from '../mail/mail.service';
import { OrderWhatsappService } from '../whatsapp/order-whatsapp.service';
import { ShippingService } from './shipping.service';

// OrderWhatsappService -> BaileysService depends on the ESM-only
// @whiskeysockets/baileys package, which Jest can't parse. Stub at the source,
// same pattern used by checkout.service.spec.ts.
jest.mock('../whatsapp/baileys.service', () => ({ BaileysService: jest.fn() }));

function jsonResponse(body: unknown, ok = true) {
  return {
    ok,
    status: ok ? 200 : 400,
    json: async () => body,
    text: async () => JSON.stringify(body),
  };
}

/**
 * Testes de contrato de payload para o Melhor Envio (ShippingService.purchaseLabel).
 * Cobre exatamente a mudança feita para perfis de recebimento: `to.email`/
 * `to.document` agora preferem o snapshot gravado no Order
 * (`recipientEmail`/`recipientDocument`), com fallback para `order.user.email`/
 * `order.user.cpf` — o comportamento de sempre — quando esses campos são
 * `null`. Nenhuma chamada real à API do Melhor Envio acontece aqui;
 * `global.fetch` é mockado.
 */
describe('ShippingService.purchaseLabel — contrato de payload (Melhor Envio)', () => {
  let service: ShippingService;
  let prisma: {
    shipment: { findUnique: jest.Mock };
    $transaction: jest.Mock;
  };
  let fetchMock: jest.Mock;

  function baseShipment(orderOverrides: Record<string, unknown> = {}) {
    return {
      id: 'shipment-1',
      status: 'PENDING',
      serviceId: 1,
      order: {
        id: 'order-1',
        shippingAddress: {
          name: 'Fulano',
          cep: '12345-678',
          street: 'Rua A',
          number: '10',
          neighborhood: 'Centro',
          city: 'SJC',
          state: 'SP',
        },
        items: [{ price: { toNumber: () => 100 }, quantity: 1, name: 'Item', product: null }],
        user: { email: 'conta-atual@example.com', cpf: '00011122233' },
        recipientDocument: null,
        recipientEmail: null,
        ...orderOverrides,
      },
    };
  }

  beforeEach(() => {
    const env: Record<string, string> = {
      MELHOR_ENVIO_TOKEN: 'fake-token',
      MELHOR_ENVIO_SANDBOX: 'true',
    };
    const config = {
      get: (key: string, def?: string) => env[key] ?? def,
    } as unknown as ConfigService;

    prisma = {
      shipment: { findUnique: jest.fn() },
      $transaction: jest.fn(async (cb) =>
        cb({
          shipment: { update: jest.fn().mockResolvedValue({}) },
          shipmentEvent: { create: jest.fn().mockResolvedValue({}) },
          auditLog: { create: jest.fn().mockResolvedValue({}) },
        }),
      ),
    };

    fetchMock = jest.fn().mockImplementation((url: string) => {
      if (url.includes('/me/cart')) return Promise.resolve(jsonResponse({ id: 'me-order-1' }));
      if (url.includes('/me/shipment/checkout')) return Promise.resolve(jsonResponse({}));
      if (url.includes('/me/shipment/generate')) return Promise.resolve(jsonResponse({}));
      if (url.includes('/me/shipment/print'))
        return Promise.resolve(jsonResponse({ url: 'https://label.example/x.pdf' }));
      return Promise.resolve(jsonResponse({}, false));
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    service = new ShippingService(
      prisma as unknown as PrismaService,
      config,
      {} as unknown as MailService,
      {} as unknown as OrderWhatsappService,
    );
  });

  function firstCartCallBody() {
    const call = fetchMock.mock.calls.find(([url]) => (url as string).includes('/me/cart'));
    return JSON.parse((call![1] as { body: string }).body);
  }

  it('legacy order (no snapshot columns): falls back to the live User email/cpf — unchanged contract', async () => {
    prisma.shipment.findUnique.mockResolvedValue(baseShipment());

    await service.purchaseLabel('order-1');

    const body = firstCartCallBody();
    expect(body.to.email).toBe('conta-atual@example.com');
    expect(body.to.document).toBe('00011122233');
  });

  it('order with a recipient snapshot: prefers recipientEmail/recipientDocument over the live User', async () => {
    prisma.shipment.findUnique.mockResolvedValue(
      baseShipment({
        recipientDocument: '22233344400',
        recipientEmail: 'destinatario@example.com',
      }),
    );

    await service.purchaseLabel('order-1');

    const body = firstCartCallBody();
    expect(body.to.email).toBe('destinatario@example.com');
    expect(body.to.document).toBe('22233344400');
  });

  it('omits to.document entirely when neither the snapshot nor the live User has one', async () => {
    prisma.shipment.findUnique.mockResolvedValue(
      baseShipment({ user: { email: 'conta@example.com', cpf: null } }),
    );

    await service.purchaseLabel('order-1');

    const body = firstCartCallBody();
    expect(body.to.document).toBeUndefined();
  });
});
