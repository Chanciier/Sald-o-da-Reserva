import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { EventBusService } from '../events/event-bus.service';
import { OmsEvents } from '../events/oms-events';
import { IntermediadorService } from '../intermediador/intermediador.service';
import { OrderWhatsappService } from '../whatsapp/order-whatsapp.service';

const MEMBERSHIP_VALIDITY_YEARS = 1;

/**
 * Reage a OmsEvents.OrderPaid: se o pedido tem algum item "Clube Reversa"
 * (Product.isClubMembership), registra o sócio no Bling via intermediador e
 * avisa o cliente pelo WhatsApp. Zero mudança em checkout/payments/stock —
 * mesmo padrão de PrintCenterService/OrderOrchestratorService.
 *
 * Erro aqui nunca derruba o pagamento (EventBusService já isola handlers),
 * mas também nunca falha silenciosamente de um jeito impossível de notar:
 * tudo vira log de erro, pronto pra registrar o sócio manualmente se preciso.
 */
@Injectable()
export class ClubMembershipService implements OnModuleInit {
  private readonly logger = new Logger(ClubMembershipService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventBusService,
    private readonly intermediador: IntermediadorService,
    private readonly orderWa: OrderWhatsappService,
  ) {}

  onModuleInit(): void {
    this.events.on(OmsEvents.OrderPaid, (p) => this.handleOrderPaid(p.orderId));
  }

  private async handleOrderPaid(orderId: string): Promise<void> {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { items: { include: { product: { select: { isClubMembership: true } } } } },
    });
    if (!order) return;

    const hasClubMembershipItem = order.items.some((item) => item.product?.isClubMembership);
    if (!hasClubMembershipItem) return;

    if (!order.recipientDocument || !order.buyerName || !order.customerPhone) {
      // Não deveria acontecer — checkout.service.ts já exige CPF quando o
      // carrinho tem item de clube. Se chegou aqui, algo mudou nos dados do
      // pedido depois da criação; melhor logar alto do que registrar sócio
      // com dado incompleto no Bling.
      this.logger.error(
        `Pedido ${orderId} tem item de Clube Reversa mas está sem nome/CPF/telefone completos.`,
      );
      return;
    }

    if (!this.intermediador.isConfigured()) {
      this.logger.error(
        `Pedido ${orderId}: Clube Reversa comprado mas o intermediador não está configurado ` +
          '(INTERMEDIADOR_BASE_URL/INTERMEDIADOR_API_KEY) — sócio NÃO foi registrado no Bling.',
      );
      return;
    }

    const validUntil = new Date();
    validUntil.setFullYear(validUntil.getFullYear() + MEMBERSHIP_VALIDITY_YEARS);

    try {
      await this.intermediador.addClubMember({
        name: order.buyerName,
        document: order.recipientDocument,
        validUntil: validUntil.toISOString(),
        phone: order.customerPhone,
        // Sem checkbox de consentimento no checkout do site hoje — não presume
        // aceite. Sócio ainda recebe a confirmação abaixo (mensagem
        // transacional do próprio pedido, não é o lembrete de renovação do
        // Bling que esse campo controla).
        whatsappConsent: false,
      });
    } catch (error) {
      this.logger.error(
        `Falha ao registrar sócio do Clube Reversa no Bling (pedido ${orderId})`,
        error as Error,
      );
      return;
    }

    await this.orderWa
      .notifyClubMembershipActive(
        { phone: order.customerPhone, name: order.buyerName, orderId: order.id },
        validUntil,
      )
      .catch((error) => {
        this.logger.error(
          `Falha ao notificar sócio do Clube Reversa (pedido ${orderId})`,
          error as Error,
        );
      });
  }
}
