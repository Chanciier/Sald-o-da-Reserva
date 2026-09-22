import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { StockService } from '../stock/stock.service';
import { NotificationsService } from '../notifications/notifications.service';
import { EventBusService } from '../events/event-bus.service';
import { OmsEvents } from '../events/oms-events';
import { recordOrderEvent } from '../common/order-timeline';
import { AuthService } from '../auth/auth.service';
import { GuestCheckoutDto } from '../auth/dto/guest-checkout.dto';
import type { PublicUser } from '../auth/types/auth.types';
import { IntermediadorService } from '../intermediador/intermediador.service';
import type { ClubMembershipStatus } from '../intermediador/intermediador.types';

export interface ClubSignupResult {
  orderId: string;
  // Ausentes quando quem assinou já estava logado — o front já tem sessão
  // válida nesse caso, nada pra persistir de novo (ver ClubSignupController).
  user?: PublicUser;
  accessToken?: string;
  refreshToken?: string;
}

/**
 * Assinatura do Clube Reversa: "clica pra assinar, preenche os dados,
 * paga" — sem carrinho, sem escolha de frete/entrega, sem cupom. Pedido é
 * criado direto pelo produto (isClubMembership), sem depender do CartService.
 *
 * Quem já está logado (existingUserId via OptionalJwtAuthGuard) usa a
 * própria conta; sem sessão, cria a conta-convidado na mesma chamada
 * (AuthService.guestCheckout) — nunca duplica conta pra quem já tem uma.
 *
 * A partir daqui o pedido segue o pipeline de pagamento normal e inalterado
 * (POST /payments/pix ou /payments/card com este orderId) — o registro do
 * sócio no Bling continua disparado por ClubMembershipService via
 * OmsEvents.OrderPaid, igual a qualquer outro pedido.
 */
@Injectable()
export class ClubSignupService {
  private readonly logger = new Logger(ClubSignupService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly authService: AuthService,
    private readonly stock: StockService,
    private readonly notifications: NotificationsService,
    private readonly events: EventBusService,
    private readonly intermediador: IntermediadorService,
  ) {}

  // Consulta usada pela tela ao sair do campo CPF, pra avisar "você já é
  // sócio até DD/MM" antes mesmo de escolher forma de pagamento. Fail-open:
  // se o intermediador não responder, não trava a UI — trata como "não é
  // sócio" e deixa seguir (a checagem que realmente importa é a de
  // subscribe() abaixo, que roda de novo na hora de criar o pedido).
  async checkCpfStatus(cpf: string): Promise<ClubMembershipStatus> {
    if (!/^\d{11}$/.test(cpf)) {
      throw new BadRequestException('CPF deve conter 11 dígitos numéricos.');
    }
    try {
      return await this.intermediador.checkClubMembership(cpf);
    } catch (error) {
      this.logger.warn(`Falha ao checar status de sócio: ${(error as Error).message}`);
      return { isMember: false, validUntil: null };
    }
  }

  async subscribe(
    dto: GuestCheckoutDto,
    ip: string,
    userAgent: string,
    existingUserId?: string,
  ): Promise<ClubSignupResult> {
    await this.rejectIfAlreadyMember(dto.cpf);

    let userId: string;
    let session: { user: PublicUser; accessToken: string; refreshToken: string } | undefined;

    if (existingUserId) {
      userId = existingUserId;
    } else {
      const auth = await this.authService.guestCheckout(dto, ip, userAgent);
      userId = auth.user.id;
      session = auth;
    }

    const product = await this.prisma.product.findFirst({
      where: { isClubMembership: true, status: 'ACTIVE' },
    });
    if (!product) {
      throw new NotFoundException('Clube Reversa não está disponível no momento.');
    }

    const order = await this.prisma.order.create({
      data: {
        userId,
        deliveryMethod: 'PICKUP',
        subtotal: product.price,
        discount: 0,
        shipping: 0,
        total: product.price,
        shippingAddress: Prisma.JsonNull,
        shippingMethod: 'PICKUP',
        buyerName: dto.name,
        customerPhone: dto.phone,
        recipientDocument: dto.cpf,
        recipientDocumentType: 'CPF',
        items: {
          create: [
            {
              productId: product.id,
              name: product.name,
              sku: product.sku,
              price: product.price,
              quantity: 1,
              subtotal: product.price,
            },
          ],
        },
      },
    });

    await recordOrderEvent(this.prisma, {
      orderId: order.id,
      status: 'PENDING',
      title: 'Assinatura do Clube Reversa iniciada',
    });

    await this.notifications.notifyNewOrder(order.id).catch((error) => {
      this.logger.error(`Notificação falhou para assinatura ${order.id}`, error as Error);
    });

    // isUnique é sempre false pro Clube Reversa — na prática isso não reserva
    // nada, mas mantém o mesmo caminho do checkout normal, sem exceção.
    await this.stock.reserveForOrder(order.id).catch((error) => {
      this.logger.error(`Reserva de estoque falhou para assinatura ${order.id}`, error as Error);
    });
    this.events.emit(OmsEvents.OrderCreated, { orderId: order.id });

    return { ...session, orderId: order.id };
  }

  // Enforço real (não só o aviso de checkCpfStatus) — bloqueia criar pedido
  // novo pra quem já é sócio ativo, seja pela loja física ou por uma
  // assinatura anterior do site. Fail-open na falha da checagem em si: uma
  // instabilidade do intermediador não pode impedir uma compra legítima.
  private async rejectIfAlreadyMember(cpf: string): Promise<void> {
    let status: ClubMembershipStatus;
    try {
      status = await this.intermediador.checkClubMembership(cpf);
    } catch (error) {
      this.logger.warn(
        `Não foi possível checar sócio existente antes da assinatura: ${(error as Error).message}`,
      );
      return;
    }

    if (!status.isMember) return;

    const until = status.validUntil
      ? new Date(status.validUntil).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })
      : null;
    throw new ConflictException(
      until
        ? `Este CPF já é sócio do Clube Reversa (válido até ${until}).`
        : 'Este CPF já é sócio do Clube Reversa.',
    );
  }
}
