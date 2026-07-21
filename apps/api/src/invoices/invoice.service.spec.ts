import { PrismaService } from '../prisma/prisma.service';
import { MailService } from '../mail/mail.service';
import { FocusNfeProvider } from './focusnfe.provider';
import { InvoiceRepository } from './invoice.repository';
import { InvoiceService } from './invoice.service';

/**
 * Testes de contrato de payload para o Focus NF-e (InvoiceService.emitForOrder).
 * Cobre exatamente a mudança feita para perfis de recebimento: `customer.cpf`/
 * `customer.email` agora preferem o snapshot gravado no Order
 * (`recipientDocument`/`recipientEmail`), com fallback para `order.user.cpf`/
 * `order.user.email` — o comportamento de sempre — quando esses campos são
 * `null` (todo pedido criado antes desta feature). Nenhuma chamada real ao
 * Focus NF-e acontece aqui; `focus.issueInvoice` é mockado.
 */
describe('InvoiceService.emitForOrder — contrato de payload (Focus NF-e)', () => {
  let service: InvoiceService;
  let prisma: { order: { findUnique: jest.Mock } };
  let focus: { isConfigured: jest.Mock; issueInvoice: jest.Mock };
  let repo: { findByOrderId: jest.Mock; create: jest.Mock; update: jest.Mock };

  const ORDER_ID = 'order-1';

  function baseOrder(overrides: Record<string, unknown> = {}) {
    return {
      id: ORDER_ID,
      status: 'PAID',
      deliveryMethod: 'SHIPPING',
      pickupCode: null,
      buyerName: 'Cliente Snapshot',
      shippingAddress: null,
      total: 100,
      shipping: 10,
      discount: 0,
      items: [],
      payment: null,
      shipment: null,
      user: { name: 'Cliente Conta', email: 'conta-atual@example.com', cpf: '00011122233' },
      recipientDocument: null,
      recipientEmail: null,
      ...overrides,
    };
  }

  beforeEach(() => {
    prisma = { order: { findUnique: jest.fn() } };
    focus = {
      isConfigured: jest.fn().mockReturnValue(true),
      issueInvoice: jest.fn().mockResolvedValue({ status: 'AUTHORIZED' }),
    };
    repo = {
      findByOrderId: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue({ id: 'invoice-1' }),
      update: jest.fn().mockResolvedValue({}),
    };
    service = new InvoiceService(
      prisma as unknown as PrismaService,
      focus as unknown as FocusNfeProvider,
      repo as unknown as InvoiceRepository,
      {} as unknown as MailService,
    );
  });

  it('legacy order (no snapshot columns): falls back to the live User cpf/email — unchanged contract', async () => {
    prisma.order.findUnique.mockResolvedValue(baseOrder());

    await service.emitForOrder(ORDER_ID);

    expect(focus.issueInvoice).toHaveBeenCalledWith(
      expect.objectContaining({
        customer: expect.objectContaining({
          cpf: '00011122233',
          email: 'conta-atual@example.com',
        }),
      }),
    );
  });

  it('order with a recipient snapshot: prefers recipientDocument/recipientEmail over the live User', async () => {
    prisma.order.findUnique.mockResolvedValue(
      baseOrder({
        recipientDocument: '22233344400',
        recipientEmail: 'destinatario@example.com',
      }),
    );

    await service.emitForOrder(ORDER_ID);

    expect(focus.issueInvoice).toHaveBeenCalledWith(
      expect.objectContaining({
        customer: expect.objectContaining({
          cpf: '22233344400',
          email: 'destinatario@example.com',
        }),
      }),
    );
  });

  it('explicit overrides (admin reemission) still win over both the snapshot and the live User', async () => {
    prisma.order.findUnique.mockResolvedValue(
      baseOrder({ recipientDocument: '22233344400', recipientEmail: 'destinatario@example.com' }),
    );

    await service.emitForOrder(ORDER_ID, { cpf: '99999999999' });

    expect(focus.issueInvoice).toHaveBeenCalledWith(
      expect.objectContaining({ customer: expect.objectContaining({ cpf: '99999999999' }) }),
    );
  });
});
