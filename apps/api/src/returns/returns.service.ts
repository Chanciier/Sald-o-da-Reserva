import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ShippingService } from '../shipping/shipping.service';
import { MercadoPagoService } from '../mercadopago/mercadopago.service';
import { MailService } from '../mail/mail.service';
import { AuthenticatedUser } from '../auth/types/auth.types';
import { CreateReturnDto } from './dto/create-return.dto';
import { UpdateReturnStatusDto } from './dto/update-return-status.dto';
import { CreateRefundDto } from './dto/create-refund.dto';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type PrismaAny = any;

const RETURN_WINDOW_DAYS = 7;

@Injectable()
export class ReturnsService {
  private readonly logger = new Logger(ReturnsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly shipping: ShippingService,
    private readonly mp: MercadoPagoService,
    private readonly mail: MailService,
  ) {}

  private get db(): PrismaAny {
    return this.prisma;
  }

  async create(dto: CreateReturnDto, user: AuthenticatedUser) {
    const order = await this.prisma.order.findUnique({
      where: { id: dto.orderId },
      include: { shipment: true },
    });

    if (!order) throw new NotFoundException('Pedido não encontrado.');

    if (order.userId !== user.id) {
      throw new ForbiddenException('Você não tem permissão para solicitar devolução deste pedido.');
    }

    if (order.status !== 'DELIVERED') {
      throw new BadRequestException('Só é possível solicitar devolução de pedidos entregues.');
    }

    const deliveredAt = order.shipment?.deliveredAt ?? order.updatedAt;
    const diffMs = Date.now() - new Date(deliveredAt).getTime();
    const diffDays = diffMs / (1000 * 60 * 60 * 24);
    if (diffDays > RETURN_WINDOW_DAYS) {
      throw new BadRequestException(
        `O prazo de ${RETURN_WINDOW_DAYS} dias para devolução já expirou.`,
      );
    }

    const existing = await this.db.returnRequest.findFirst({
      where: { orderId: dto.orderId, status: { in: ['PENDING', 'IN_REVIEW', 'APPROVED'] } },
    });
    if (existing) {
      throw new BadRequestException(
        'Já existe uma solicitação de devolução ativa para este pedido.',
      );
    }

    return this.db.returnRequest.create({
      data: {
        orderId: dto.orderId,
        userId: user.id,
        reason: dto.reason,
        notes: dto.notes,
      },
    });
  }

  async findMine(user: AuthenticatedUser) {
    return this.db.returnRequest.findMany({
      where: { userId: user.id },
      include: {
        order: {
          select: {
            id: true,
            total: true,
            createdAt: true,
            items: { take: 1, select: { name: true } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findByOrder(orderId: string, user: AuthenticatedUser) {
    const order = await this.prisma.order.findUnique({ where: { id: orderId } });
    if (!order) throw new NotFoundException('Pedido não encontrado.');

    if (user.role === Role.CLIENTE && order.userId !== user.id) {
      throw new ForbiddenException('Acesso negado.');
    }

    return this.db.returnRequest.findMany({
      where: { orderId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findAll(page = 1, limit = 20, status?: string) {
    const where = status ? { status } : {};
    const [data, total] = await Promise.all([
      this.db.returnRequest.findMany({
        where,
        include: {
          user: { select: { id: true, name: true, email: true } },
          order: {
            select: {
              id: true,
              total: true,
              deliveryMethod: true,
              pickupCode: true,
              items: { take: 1, select: { name: true } },
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.db.returnRequest.count({ where }),
    ]);

    return { data, total, page, limit, pages: Math.ceil(total / limit) };
  }

  async updateStatus(id: string, dto: UpdateReturnStatusDto, user: AuthenticatedUser) {
    const request = await this.db.returnRequest.findUnique({
      where: { id },
      include: { order: { select: { deliveryMethod: true, pickupCode: true } } },
    });
    if (!request) throw new NotFoundException('Solicitação não encontrada.');

    const isPickup = request.order?.deliveryMethod === 'PICKUP' || !!request.order?.pickupCode;

    const updates: PrismaAny = { status: dto.status };
    if (dto.adminNotes !== undefined) updates.adminNotes = dto.adminNotes;

    // Gera etiqueta de devolução Melhor Envio apenas para pedidos com envio (não retirada)
    if (
      dto.status === 'APPROVED' &&
      request.status !== 'APPROVED' &&
      !request.meOrderId &&
      !isPickup
    ) {
      try {
        const { meOrderId, labelUrl } = await this.shipping.generateReverseLabel(request.orderId);
        updates.meOrderId = meOrderId;
        updates.labelUrl = labelUrl;
      } catch (err) {
        this.logger.warn(
          `Failed to generate reverse label for return ${id}: ${(err as Error).message}`,
        );
      }
    }

    const updated = await this.db.returnRequest.update({ where: { id }, data: updates });

    if (dto.status === 'APPROVED' && request.status !== 'APPROVED') {
      this.sendReturnApprovedEmailSilently(request.orderId, updated.labelUrl);
    }

    if (dto.status === 'COMPLETED' && request.status !== 'COMPLETED' && !request.refundedAt) {
      await this.executeRefundSilently(id, request.orderId, user);
    }

    return this.db.returnRequest.findUnique({
      where: { id },
      include: {
        user: { select: { id: true, name: true, email: true } },
        order: {
          select: {
            id: true,
            total: true,
            deliveryMethod: true,
            pickupCode: true,
            items: { take: 1, select: { name: true } },
          },
        },
      },
    });
  }

  async syncTracking(id: string, user: AuthenticatedUser) {
    const request = await this.db.returnRequest.findUnique({ where: { id } });
    if (!request) throw new NotFoundException('Solicitação não encontrada.');

    if (user.role === Role.CLIENTE && request.userId !== user.id) {
      throw new ForbiddenException('Acesso negado.');
    }

    if (!request.meOrderId) return request;

    const tracking = await this.shipping.fetchMeTrackingRaw(request.meOrderId);
    if (!tracking) return request;

    const updates: PrismaAny = {};

    if (tracking.tracking && tracking.tracking !== request.trackingCode) {
      updates.trackingCode = tracking.tracking;
    }
    if (tracking.posted_at && !request.postedAt) {
      updates.postedAt = new Date(tracking.posted_at);
    }
    if (tracking.delivered_at && !request.returnDeliveredAt) {
      updates.returnDeliveredAt = new Date(tracking.delivered_at);
      if (request.status === 'APPROVED') {
        updates.status = 'COMPLETED';
      }
    }

    if (Object.keys(updates).length > 0) {
      await this.db.returnRequest.update({ where: { id }, data: updates });
    }

    if (updates.status === 'COMPLETED' && !request.refundedAt) {
      await this.executeRefundSilently(id, request.orderId, user);
    }

    return this.db.returnRequest.findUnique({ where: { id } });
  }

  async processRefund(id: string, dto: CreateRefundDto, user: AuthenticatedUser) {
    const request = await this.db.returnRequest.findUnique({
      where: { id },
      include: { order: { include: { payment: true, user: true } } },
    });
    if (!request) throw new NotFoundException('Solicitação não encontrada.');

    if (request.status !== 'COMPLETED') {
      throw new BadRequestException(
        'A devolução precisa estar concluída para processar reembolso.',
      );
    }
    if (request.refundedAt) {
      throw new BadRequestException('Reembolso já foi processado para esta devolução.');
    }

    const payment = request.order.payment;
    if (!payment?.gatewayPaymentId) {
      throw new BadRequestException('Pagamento não encontrado para este pedido.');
    }
    if (!['APPROVED', 'AUTHORIZED'].includes(payment.status)) {
      throw new BadRequestException(
        `Pagamento com status "${payment.status}" não é elegível para reembolso.`,
      );
    }

    const refundAmount = dto.amount ?? payment.amount.toNumber();
    const refundResult = await this.mp.createRefund(payment.gatewayPaymentId, dto.amount);

    await this.prisma.$transaction(async (tx) => {
      await (tx as PrismaAny).returnRequest.update({
        where: { id },
        data: {
          refundId: String(refundResult.id),
          refundAmount,
          refundStatus: refundResult.status,
          refundedAt: new Date(),
        },
      });

      await tx.payment.update({
        where: { id: payment.id },
        data: { status: 'REFUNDED' },
      });

      await tx.order.update({
        where: { id: request.orderId },
        data: { status: 'REFUNDED' },
      });

      await tx.auditLog.create({
        data: {
          action: 'return.refund.processed',
          metadata: {
            returnId: id,
            orderId: request.orderId,
            mpPaymentId: payment.gatewayPaymentId,
            refundId: refundResult.id,
            amount: refundAmount,
            processedBy: user.id,
          },
        },
      });
    });

    this.logger.log(
      `Refund processed: returnId=${id} refundId=${refundResult.id} amount=${refundAmount}`,
    );

    try {
      await this.mail.sendRefundProcessedEmail(
        request.order.user.email,
        request.order.user.name ?? undefined,
        request.orderId,
        refundAmount,
        String(refundResult.id),
      );
    } catch (err) {
      this.logger.warn(`Failed to send refund email: ${(err as Error).message}`);
    }

    return this.db.returnRequest.findUnique({ where: { id } });
  }

  private async executeRefundSilently(
    returnId: string,
    orderId: string,
    user: AuthenticatedUser,
  ): Promise<void> {
    try {
      await this.processRefund(returnId, {}, user);
    } catch (err) {
      this.logger.warn(`Auto-refund failed for return ${returnId}: ${(err as Error).message}`);
    }
  }

  private sendReturnApprovedEmailSilently(orderId: string, labelUrl: string | null): void {
    this.prisma.order
      .findUnique({
        where: { id: orderId },
        include: { user: true },
      })
      .then((order) => {
        if (!order) return;
        this.mail
          .sendReturnApprovedEmail(
            order.user.email,
            order.user.name ?? undefined,
            orderId,
            labelUrl,
          )
          .catch((err) => {
            this.logger.warn(`Failed to send return approved email: ${(err as Error).message}`);
          });
      })
      .catch(() => {});
  }
}
