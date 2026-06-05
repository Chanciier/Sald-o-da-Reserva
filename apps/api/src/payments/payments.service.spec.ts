import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PaymentMethod, PaymentStatus, OrderStatus } from '@prisma/client';
import Stripe from 'stripe';
import { PaymentsService } from './payments.service';
import { PrismaService } from '../prisma/prisma.service';
import { InvoiceService } from '../invoices/invoice.service';

// ── Mocks ────────────────────────────────────────────────────────────────────

const mockStripe = {
  paymentIntents: {
    create: jest.fn(),
    retrieve: jest.fn(),
  },
  webhooks: {
    constructEvent: jest.fn(),
  },
};

type MockPrisma = {
  order: { findFirst: jest.Mock; update: jest.Mock };
  payment: {
    create: jest.Mock;
    findUnique: jest.Mock;
    findFirst: jest.Mock;
    delete: jest.Mock;
    update: jest.Mock;
    count: jest.Mock;
    findMany: jest.Mock;
  };
  paymentLog: { create: jest.Mock; findFirst: jest.Mock };
  auditLog: { create: jest.Mock };
  $transaction: jest.Mock;
};

const mockPrisma: MockPrisma = {
  order: { findFirst: jest.fn(), update: jest.fn() },
  payment: {
    create: jest.fn(),
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    delete: jest.fn(),
    update: jest.fn(),
    count: jest.fn(),
    findMany: jest.fn(),
  },
  paymentLog: { create: jest.fn(), findFirst: jest.fn() },
  auditLog: { create: jest.fn() },
  $transaction: jest.fn((cb: (tx: MockPrisma) => unknown) => cb(mockPrisma)),
};

const mockConfig = {
  get: jest.fn((key: string, def?: string): string => {
    const vals: Record<string, string> = {
      STRIPE_SECRET_KEY: 'sk_test_mock',
      STRIPE_WEBHOOK_SECRET: 'whsec_mock',
      FRONTEND_URL: 'http://localhost:3000',
    };
    return vals[key] ?? def ?? '';
  }),
};

const mockInvoiceService = {
  emitForOrder: jest.fn().mockResolvedValue(undefined),
};

// ── Fixtures ─────────────────────────────────────────────────────────────────

const mockOrder = {
  id: 'order-1',
  userId: 'user-1',
  status: 'PENDING',
  total: { toNumber: () => 100 },
  payment: null,
  user: { id: 'user-1', name: 'João Silva', email: 'joao@test.com' },
  shippingAddress: {
    street: 'Rua das Flores',
    number: '123',
    complement: 'Apto 1',
    neighborhood: 'Centro',
    city: 'São Paulo',
    state: 'SP',
    cep: '01310100',
  },
};

// Use unknown cast to avoid fighting Stripe SDK's exhaustive next_action union type
const mockBoletoPI = {
  id: 'pi_boleto_123',
  status: 'requires_action',
  client_secret: 'pi_boleto_123_secret',
  next_action: {
    type: 'boleto_display_details',
    boleto_display_details: {
      hosted_voucher_url: 'https://hosted.stripe.com/boleto/abc',
      number: '12345.67890 12345.678901 12345.678901 1 12340000010000',
      expires_at: Math.floor(Date.now() / 1000) + 259200,
    },
  },
  latest_charge: null,
  metadata: { orderId: 'order-1', userId: 'user-1' },
} as unknown as Stripe.PaymentIntent;

const mockCardPI = {
  id: 'pi_card_123',
  status: 'requires_payment_method',
  client_secret: 'pi_card_123_secret',
  next_action: null,
  latest_charge: null,
  metadata: { orderId: 'order-1', userId: 'user-1' },
} as unknown as Stripe.PaymentIntent;

const makePaymentRecord = (
  overrides: Partial<{
    id: string;
    method: PaymentMethod;
    status: PaymentStatus;
    boletoUrl: string | null;
    boletoCode: string | null;
    rawStatus: string;
  }> = {},
) => ({
  id: overrides.id ?? 'pay-1',
  orderId: 'order-1',
  gatewayPaymentId: 'pi_boleto_123',
  clientSecret: 'pi_boleto_123_secret',
  method: overrides.method ?? PaymentMethod.BOLETO,
  status: overrides.status ?? PaymentStatus.PENDING,
  amount: { toNumber: () => 100 },
  pixQrCode: null,
  pixQrCodeBase64: null,
  pixExpiresAt: null,
  boletoUrl:
    overrides.boletoUrl !== undefined
      ? overrides.boletoUrl
      : 'https://hosted.stripe.com/boleto/abc',
  boletoCode: overrides.boletoCode !== undefined ? overrides.boletoCode : '12345.67890',
  boletoExpiresAt: new Date(),
  cardBrand: null,
  cardLast4: null,
  installments: null,
  rawStatus: overrides.rawStatus ?? 'requires_action',
  statusDetail: null,
  createdAt: new Date(),
  updatedAt: new Date(),
});

// ── Suite ─────────────────────────────────────────────────────────────────────

describe('PaymentsService', () => {
  let service: PaymentsService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PaymentsService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: ConfigService, useValue: mockConfig },
        { provide: InvoiceService, useValue: mockInvoiceService },
      ],
    }).compile();

    service = module.get<PaymentsService>(PaymentsService);

    // Replace private stripe instance with our mock
    (service as unknown as { stripe: typeof mockStripe }).stripe = mockStripe;

    // Default $transaction passthrough
    mockPrisma.$transaction.mockImplementation((cb: (tx: MockPrisma) => unknown) => cb(mockPrisma));
    mockPrisma.paymentLog.create.mockResolvedValue({});
    mockPrisma.auditLog.create.mockResolvedValue({});
  });

  // ── BOLETO ────────────────────────────────────────────────────────────────

  describe('create — BOLETO', () => {
    it('gera boleto com CPF válido e monta billing_details do endereço', async () => {
      mockPrisma.order.findFirst.mockResolvedValue(mockOrder);
      mockStripe.paymentIntents.create.mockResolvedValue(mockBoletoPI);
      mockPrisma.payment.create.mockResolvedValue(makePaymentRecord());

      const result = await service.create('order-1', 'user-1', {
        method: PaymentMethod.BOLETO,
        taxId: '52998224725',
      });

      expect(mockStripe.paymentIntents.create).toHaveBeenCalledWith(
        expect.objectContaining({
          payment_method_types: ['boleto'],
          payment_method_data: expect.objectContaining({
            type: 'boleto',
            boleto: { tax_id: '52998224725' },
            billing_details: expect.objectContaining({
              name: 'João Silva',
              email: 'joao@test.com',
              address: expect.objectContaining({
                line1: 'Rua das Flores, 123',
                city: 'São Paulo',
                state: 'SP',
                postal_code: '01310100',
                country: 'BR',
              }),
            }),
          }),
        }),
      );
      expect(result.boletoUrl).toBe('https://hosted.stripe.com/boleto/abc');
      expect(result.status).toBe(PaymentStatus.PENDING);
    });

    it('rejeita boleto sem CPF (campo ausente)', async () => {
      mockPrisma.order.findFirst.mockResolvedValue(mockOrder);

      await expect(
        service.create('order-1', 'user-1', { method: PaymentMethod.BOLETO }),
      ).rejects.toThrow(BadRequestException);

      expect(mockStripe.paymentIntents.create).not.toHaveBeenCalled();
    });

    it('rejeita boleto com CPF vazio', async () => {
      mockPrisma.order.findFirst.mockResolvedValue(mockOrder);

      await expect(
        service.create('order-1', 'user-1', { method: PaymentMethod.BOLETO, taxId: '' }),
      ).rejects.toThrow('CPF é obrigatório');
    });

    it('retorna pagamento com boletoUrl e boletoCode nulos quando Stripe não os fornece', async () => {
      const piSemDetalhes = {
        ...mockBoletoPI,
        next_action: { type: 'boleto_display_details', boleto_display_details: {} },
      } as unknown as Stripe.PaymentIntent;

      mockPrisma.order.findFirst.mockResolvedValue(mockOrder);
      mockStripe.paymentIntents.create.mockResolvedValue(piSemDetalhes);
      mockPrisma.payment.create.mockResolvedValue(
        makePaymentRecord({ boletoUrl: null, boletoCode: null }),
      );

      const result = await service.create('order-1', 'user-1', {
        method: PaymentMethod.BOLETO,
        taxId: '52998224725',
      });

      // Should still return a payment object; frontend shows friendly error for null URL/code
      expect(result.boletoUrl).toBeNull();
      expect(result.boletoCode).toBeNull();
    });

    it('lança BadRequestException quando Stripe retorna erro', async () => {
      mockPrisma.order.findFirst.mockResolvedValue(mockOrder);
      const stripeError = Object.assign(new Error('card_declined'), {
        type: 'StripeCardError',
      });
      mockStripe.paymentIntents.create.mockRejectedValue(stripeError);

      await expect(
        service.create('order-1', 'user-1', {
          method: PaymentMethod.BOLETO,
          taxId: '52998224725',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('lança NotFoundException quando pedido não existe', async () => {
      mockPrisma.order.findFirst.mockResolvedValue(null);

      await expect(
        service.create('order-1', 'user-1', {
          method: PaymentMethod.BOLETO,
          taxId: '52998224725',
        }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ── CARTÃO ────────────────────────────────────────────────────────────────

  describe('create — CREDIT_CARD', () => {
    it('cria PaymentIntent e retorna clientSecret', async () => {
      mockPrisma.order.findFirst.mockResolvedValue(mockOrder);
      mockStripe.paymentIntents.create.mockResolvedValue(mockCardPI);
      mockPrisma.payment.create.mockResolvedValue(
        makePaymentRecord({
          method: PaymentMethod.CREDIT_CARD,
          boletoUrl: null,
          boletoCode: null,
          rawStatus: 'requires_payment_method',
        }),
      );

      const result = await service.create('order-1', 'user-1', {
        method: PaymentMethod.CREDIT_CARD,
      });

      expect(mockStripe.paymentIntents.create).toHaveBeenCalledWith(
        expect.objectContaining({ payment_method_types: ['card'] }),
      );
      expect(result.clientSecret).toBe('pi_boleto_123_secret'); // from mock record
    });

    it('retorna pagamento existente não terminal (idempotência para cartão)', async () => {
      const orderWithPayment = {
        ...mockOrder,
        payment: makePaymentRecord({
          method: PaymentMethod.CREDIT_CARD,
          status: PaymentStatus.APPROVED,
        }),
      };
      mockPrisma.order.findFirst.mockResolvedValue(orderWithPayment);

      const result = await service.create('order-1', 'user-1', {
        method: PaymentMethod.CREDIT_CARD,
      });

      expect(mockStripe.paymentIntents.create).not.toHaveBeenCalled();
      expect(result.status).toBe(PaymentStatus.APPROVED);
    });
  });

  // ── SINCRONIZAÇÃO DE STATUS ───────────────────────────────────────────────

  describe('mapStatus', () => {
    type SvcWithPrivate = { mapStatus: (s: Stripe.PaymentIntent.Status) => PaymentStatus };

    const cases: Array<[Stripe.PaymentIntent.Status, PaymentStatus]> = [
      ['succeeded', PaymentStatus.APPROVED],
      ['canceled', PaymentStatus.CANCELLED],
      ['requires_capture', PaymentStatus.AUTHORIZED],
      ['processing', PaymentStatus.PENDING],
      ['requires_action', PaymentStatus.PENDING],
      ['requires_confirmation', PaymentStatus.PENDING],
      ['requires_payment_method', PaymentStatus.PENDING],
    ];

    it.each(cases)('Stripe "%s" → %s', (stripeStatus, expected) => {
      const svc = service as unknown as SvcWithPrivate;
      expect(svc.mapStatus(stripeStatus)).toBe(expected);
    });
  });

  // ── WEBHOOKS ──────────────────────────────────────────────────────────────

  describe('handleWebhook', () => {
    function buildEvent(type: string, obj: Record<string, unknown>) {
      return { type, data: { object: obj } } as unknown as Stripe.Event;
    }

    beforeEach(() => {
      mockStripe.webhooks.constructEvent.mockImplementation(
        (_raw: Buffer, _sig: string, _secret: string) => {
          throw new Error('invalid sig'); // default: bypass sig check via empty secret
        },
      );
    });

    it('processa payment_intent.succeeded → APPROVED + atualiza pedido', async () => {
      const piSucceeded = { ...mockBoletoPI, id: 'pi_boleto_123', status: 'succeeded' };
      const event = buildEvent('payment_intent.succeeded', piSucceeded as Record<string, unknown>);
      (service as unknown as { webhookSecret: string }).webhookSecret = '';
      mockStripe.webhooks.constructEvent.mockReturnValue(event);

      mockPrisma.payment.findUnique.mockResolvedValue(
        makePaymentRecord({ status: PaymentStatus.PENDING }),
      );
      mockPrisma.payment.update.mockResolvedValue({});
      mockPrisma.order.update.mockResolvedValue({});

      await service.handleWebhook(Buffer.from(JSON.stringify(event)), '');

      expect(mockPrisma.payment.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: PaymentStatus.APPROVED }),
        }),
      );
      expect(mockPrisma.order.update).toHaveBeenCalledWith({
        where: { id: 'order-1' },
        data: { status: OrderStatus.PAID },
      });
      expect(mockInvoiceService.emitForOrder).toHaveBeenCalledWith('order-1');
    });

    it('ignora evento duplicado (status já APPROVED → idempotência)', async () => {
      const piSucceeded = { ...mockBoletoPI, id: 'pi_boleto_123', status: 'succeeded' };
      const event = buildEvent('payment_intent.succeeded', piSucceeded as Record<string, unknown>);
      (service as unknown as { webhookSecret: string }).webhookSecret = '';

      mockPrisma.payment.findUnique.mockResolvedValue(
        makePaymentRecord({ status: PaymentStatus.APPROVED }),
      );

      await service.handleWebhook(Buffer.from(JSON.stringify(event)), '');

      expect(mockPrisma.payment.update).not.toHaveBeenCalled();
      expect(mockInvoiceService.emitForOrder).not.toHaveBeenCalled();
    });

    it('processa payment_intent.payment_failed → CANCELLED', async () => {
      const piFailed = { ...mockCardPI, id: 'pi_card_123', status: 'canceled' };
      const event = buildEvent(
        'payment_intent.payment_failed',
        piFailed as Record<string, unknown>,
      );
      (service as unknown as { webhookSecret: string }).webhookSecret = '';

      mockPrisma.payment.findUnique.mockResolvedValue(
        makePaymentRecord({
          id: 'pay-2',
          method: PaymentMethod.CREDIT_CARD,
          status: PaymentStatus.PENDING,
        }),
      );
      mockPrisma.payment.update.mockResolvedValue({});

      await service.handleWebhook(Buffer.from(JSON.stringify(event)), '');

      expect(mockPrisma.payment.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: PaymentStatus.CANCELLED }),
        }),
      );
    });

    it('processa charge.succeeded → busca PaymentIntent e atualiza', async () => {
      const chargeEvent = buildEvent('charge.succeeded', {
        payment_intent: 'pi_boleto_123',
        status: 'succeeded',
        id: 'ch_123',
      });
      (service as unknown as { webhookSecret: string }).webhookSecret = '';

      mockStripe.paymentIntents.retrieve.mockResolvedValue({
        ...mockBoletoPI,
        id: 'pi_boleto_123',
        status: 'succeeded',
      });

      mockPrisma.payment.findUnique.mockResolvedValue(
        makePaymentRecord({ status: PaymentStatus.PENDING }),
      );
      mockPrisma.payment.update.mockResolvedValue({});
      mockPrisma.order.update.mockResolvedValue({});

      await service.handleWebhook(Buffer.from(JSON.stringify(chargeEvent)), '');

      expect(mockStripe.paymentIntents.retrieve).toHaveBeenCalledWith('pi_boleto_123');
      expect(mockPrisma.payment.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: PaymentStatus.APPROVED }),
        }),
      );
    });

    it('processa charge.failed → busca PaymentIntent e marca CANCELLED', async () => {
      const chargeEvent = buildEvent('charge.failed', {
        payment_intent: 'pi_card_123',
        status: 'failed',
        failure_message: 'Card declined',
        id: 'ch_456',
      });
      (service as unknown as { webhookSecret: string }).webhookSecret = '';

      mockStripe.paymentIntents.retrieve.mockResolvedValue({
        ...mockCardPI,
        id: 'pi_card_123',
        status: 'canceled',
      });

      mockPrisma.payment.findUnique.mockResolvedValue(
        makePaymentRecord({
          id: 'pay-3',
          method: PaymentMethod.CREDIT_CARD,
          status: PaymentStatus.PENDING,
        }),
      );
      mockPrisma.payment.update.mockResolvedValue({});

      await service.handleWebhook(Buffer.from(JSON.stringify(chargeEvent)), '');

      expect(mockPrisma.payment.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: PaymentStatus.CANCELLED }),
        }),
      );
    });

    it('rejeita webhook com assinatura inválida', async () => {
      (service as unknown as { webhookSecret: string }).webhookSecret = 'whsec_real';
      mockStripe.webhooks.constructEvent.mockImplementation(() => {
        throw new Error('No signatures found matching the expected signature for payload');
      });

      await expect(service.handleWebhook(Buffer.from('{}'), 'bad_sig')).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  // ── getStatus ─────────────────────────────────────────────────────────────

  describe('getStatus', () => {
    it('retorna pagamento existente do usuário', async () => {
      mockPrisma.payment.findFirst.mockResolvedValue(makePaymentRecord());

      const result = await service.getStatus('pay-1', 'user-1');

      expect(result.id).toBe('pay-1');
      expect(mockPrisma.payment.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'pay-1', order: { userId: 'user-1' } } }),
      );
    });

    it('lança NotFoundException para pagamento inexistente', async () => {
      mockPrisma.payment.findFirst.mockResolvedValue(null);

      await expect(service.getStatus('pay-nope', 'user-1')).rejects.toThrow(NotFoundException);
    });
  });
});
