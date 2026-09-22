import { PrismaService } from '../prisma/prisma.service';
import { EventBusService } from '../events/event-bus.service';
import { OmsEvents } from '../events/oms-events';
import { IntermediadorService } from '../intermediador/intermediador.service';
import { OrderWhatsappService } from '../whatsapp/order-whatsapp.service';
import { ClubMembershipService } from './club-membership.service';

// OrderWhatsappService -> BaileysService -> o pacote ESM-only
// `@whiskeysockets/baileys`, que o Jest não consegue parsear sem uma conexão
// WhatsApp de verdade de qualquer forma. Mesmo stub de checkout.service.spec.ts.
jest.mock('../whatsapp/baileys.service', () => ({
  BaileysService: jest.fn(),
}));

/**
 * Testes do listener de OmsEvents.OrderPaid que registra sócios do Clube
 * Reversa no Bling (via intermediador) e avisa o cliente pelo WhatsApp.
 * Nada aqui toca banco, HTTP ou WhatsApp de verdade — todos os colaboradores
 * são mocks.
 */
describe('ClubMembershipService', () => {
  let service: ClubMembershipService;
  let prisma: { order: { findUnique: jest.Mock } };
  let events: { on: jest.Mock; handlers: Record<string, (payload: unknown) => Promise<void>> };
  let intermediador: { isConfigured: jest.Mock; addClubMember: jest.Mock };
  let orderWa: { notifyClubMembershipActive: jest.Mock };

  const ORDER_ID = 'order-1';

  function orderWithClubItem(overrides: Record<string, unknown> = {}) {
    return {
      id: ORDER_ID,
      buyerName: 'Cliente Teste',
      customerPhone: '11999999999',
      recipientDocument: '11122233396',
      items: [{ product: { isClubMembership: true } }],
      ...overrides,
    };
  }

  beforeEach(() => {
    prisma = { order: { findUnique: jest.fn() } };
    events = {
      handlers: {},
      on: jest.fn((event: string, handler: (payload: unknown) => Promise<void>) => {
        events.handlers[event] = handler;
      }),
    };
    intermediador = {
      isConfigured: jest.fn().mockReturnValue(true),
      addClubMember: jest
        .fn()
        .mockResolvedValue({ document: '11122233396', name: 'Cliente Teste', validUntil: null }),
    };
    orderWa = { notifyClubMembershipActive: jest.fn().mockResolvedValue(true) };

    service = new ClubMembershipService(
      prisma as unknown as PrismaService,
      events as unknown as EventBusService,
      intermediador as unknown as IntermediadorService,
      orderWa as unknown as OrderWhatsappService,
    );
    service.onModuleInit();
  });

  it('ignora pedidos sem nenhum item de Clube Reversa', async () => {
    prisma.order.findUnique.mockResolvedValue(
      orderWithClubItem({ items: [{ product: { isClubMembership: false } }] }),
    );

    await events.handlers[OmsEvents.OrderPaid]({ orderId: ORDER_ID });

    expect(intermediador.addClubMember).not.toHaveBeenCalled();
    expect(orderWa.notifyClubMembershipActive).not.toHaveBeenCalled();
  });

  it('registra o sócio no Bling e avisa o cliente quando o pedido tem item de Clube Reversa', async () => {
    prisma.order.findUnique.mockResolvedValue(orderWithClubItem());

    await events.handlers[OmsEvents.OrderPaid]({ orderId: ORDER_ID });

    expect(intermediador.addClubMember).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Cliente Teste',
        document: '11122233396',
        phone: '11999999999',
        whatsappConsent: false,
      }),
    );
    expect(orderWa.notifyClubMembershipActive).toHaveBeenCalledWith(
      expect.objectContaining({ phone: '11999999999', name: 'Cliente Teste', orderId: ORDER_ID }),
      expect.any(Date),
    );
  });

  it('não registra sócio se faltar CPF, nome ou telefone no pedido', async () => {
    prisma.order.findUnique.mockResolvedValue(orderWithClubItem({ recipientDocument: null }));

    await events.handlers[OmsEvents.OrderPaid]({ orderId: ORDER_ID });

    expect(intermediador.addClubMember).not.toHaveBeenCalled();
    expect(orderWa.notifyClubMembershipActive).not.toHaveBeenCalled();
  });

  it('não chama o intermediador quando ele não está configurado', async () => {
    intermediador.isConfigured.mockReturnValue(false);
    prisma.order.findUnique.mockResolvedValue(orderWithClubItem());

    await events.handlers[OmsEvents.OrderPaid]({ orderId: ORDER_ID });

    expect(intermediador.addClubMember).not.toHaveBeenCalled();
    expect(orderWa.notifyClubMembershipActive).not.toHaveBeenCalled();
  });

  it('não notifica o cliente se o registro no Bling falhar', async () => {
    intermediador.addClubMember.mockRejectedValue(new Error('Bling fora do ar'));
    prisma.order.findUnique.mockResolvedValue(orderWithClubItem());

    await events.handlers[OmsEvents.OrderPaid]({ orderId: ORDER_ID });

    expect(orderWa.notifyClubMembershipActive).not.toHaveBeenCalled();
  });
});
