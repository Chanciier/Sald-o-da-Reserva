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

  it('falls back to the auto-calculated package when no dimension override is given', async () => {
    prisma.shipment.findUnique.mockResolvedValue(baseShipment());

    await service.purchaseLabel('order-1');

    const body = firstCartCallBody();
    // Item único sem product (null) -> peso padrão 0.3kg/un, caixa padrão 10x15x20.
    expect(body.volumes).toEqual([{ height: 10, width: 15, length: 20, weight: 0.3 }]);
  });

  it('uses explicit dimension overrides in volumes instead of the auto-calculated package', async () => {
    prisma.shipment.findUnique.mockResolvedValue(baseShipment());

    await service.purchaseLabel('order-1', { height: 30, width: 25, length: 40, weight: 2.5 });

    const body = firstCartCallBody();
    expect(body.volumes).toEqual([{ height: 30, width: 25, length: 40, weight: 2.5 }]);
  });

  it('ignores invalid overrides (zero/negative/NaN) and falls back to the computed default', async () => {
    prisma.shipment.findUnique.mockResolvedValue(baseShipment());

    await service.purchaseLabel('order-1', { height: 0, width: -5, length: NaN, weight: -1 });

    const body = firstCartCallBody();
    expect(body.volumes).toEqual([{ height: 10, width: 15, length: 20, weight: 0.3 }]);
  });

  it('allows regenerating a label when the shipment was previously CANCELLED', async () => {
    prisma.shipment.findUnique.mockResolvedValue({ ...baseShipment(), status: 'CANCELLED' });

    await expect(service.purchaseLabel('order-1')).resolves.toEqual({
      meOrderId: 'me-order-1',
      labelUrl: 'https://label.example/x.pdf',
    });
  });

  it('still blocks regenerating a label that is already LABEL_PURCHASED', async () => {
    prisma.shipment.findUnique.mockResolvedValue({ ...baseShipment(), status: 'LABEL_PURCHASED' });

    await expect(service.purchaseLabel('order-1')).rejects.toThrow('Etiqueta já processada');
  });
});

/**
 * Testes de ShippingService.cancelLabel — cancelamento de etiqueta já
 * comprada, com reembolso solicitado ao Melhor Envio. Nenhuma chamada real à
 * API acontece aqui; `global.fetch` é mockado.
 */
describe('ShippingService.cancelLabel', () => {
  let service: ShippingService;
  let prisma: {
    shipment: { findUnique: jest.Mock };
    $transaction: jest.Mock;
  };
  let fetchMock: jest.Mock;
  let txShipmentUpdate: jest.Mock;

  function baseCancelableShipment(overrides: Record<string, unknown> = {}) {
    return {
      id: 'shipment-1',
      orderId: 'order-1',
      meOrderId: 'me-order-1',
      status: 'LABEL_PURCHASED',
      ...overrides,
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

    txShipmentUpdate = jest.fn().mockResolvedValue({});

    prisma = {
      shipment: { findUnique: jest.fn() },
      $transaction: jest.fn(async (cb) =>
        cb({
          shipment: { update: txShipmentUpdate },
          shipmentEvent: { create: jest.fn().mockResolvedValue({}) },
          auditLog: { create: jest.fn().mockResolvedValue({}) },
        }),
      ),
    };

    fetchMock = jest.fn().mockImplementation((url: string) => {
      if (url.includes('/me/shipment/cancel')) return Promise.resolve(jsonResponse({ ok: true }));
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

  function cancelCallBody() {
    const call = fetchMock.mock.calls.find(([url]) =>
      (url as string).includes('/me/shipment/cancel'),
    );
    return JSON.parse((call![1] as { body: string }).body);
  }

  it('sends reason_id=2 and the meOrderId to the ME cancel endpoint, then resets the shipment', async () => {
    prisma.shipment.findUnique.mockResolvedValue(baseCancelableShipment());

    const result = await service.cancelLabel('order-1', 'Dimensões erradas');

    expect(result).toEqual({ cancelled: true });
    expect(cancelCallBody()).toEqual({
      order: { id: 'me-order-1', reason_id: 2, description: 'Dimensões erradas' },
    });
    expect(txShipmentUpdate).toHaveBeenCalledWith({
      where: { id: 'shipment-1' },
      data: { status: 'CANCELLED', labelUrl: null, trackingCode: null },
    });
  });

  it('uses a default description when no reason is given', async () => {
    prisma.shipment.findUnique.mockResolvedValue(baseCancelableShipment());

    await service.cancelLabel('order-1');

    expect(cancelCallBody().order.description).toBe(
      'Cancelado pelo lojista via painel administrativo.',
    );
  });

  it('rejects when the shipment has no meOrderId yet', async () => {
    prisma.shipment.findUnique.mockResolvedValue(
      baseCancelableShipment({ meOrderId: null, status: 'PENDING' }),
    );

    await expect(service.cancelLabel('order-1')).rejects.toThrow(
      'Nenhuma etiqueta gerada para este pedido.',
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects when the shipment is not LABEL_PURCHASED (e.g. already SHIPPED)', async () => {
    prisma.shipment.findUnique.mockResolvedValue(baseCancelableShipment({ status: 'SHIPPED' }));

    await expect(service.cancelLabel('order-1')).rejects.toThrow(
      'Não é possível cancelar etiqueta com status atual: SHIPPED.',
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('surfaces the ME error body when cancellation is refused', async () => {
    prisma.shipment.findUnique.mockResolvedValue(baseCancelableShipment());
    fetchMock.mockImplementation(() =>
      Promise.resolve(jsonResponse({ message: 'já postado' }, false)),
    );

    await expect(service.cancelLabel('order-1')).rejects.toThrow('Erro ao cancelar etiqueta');
  });
});
