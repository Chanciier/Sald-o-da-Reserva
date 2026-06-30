import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsGateway } from './notifications.gateway';

interface NotifyInput {
  role: Role;
  type: string;
  title: string;
  message: string;
  orderId?: string | null;
  productId?: string | null;
  /** Se informado, notifica apenas este usuário; senão, todos da role. */
  userId?: string;
}

@Injectable()
export class NotificationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly gateway: NotificationsGateway,
  ) {}

  notifyNewOrder(orderId: string): Promise<void> {
    const shortId = orderId.slice(-8).toUpperCase();
    return this.notify({
      role: Role.VENDEDOR,
      type: 'ORDER_CREATED',
      title: 'Novo pedido',
      message: `O pedido #${shortId} foi criado e aguarda pagamento.`,
      orderId,
    });
  }

  notifyPaymentApproved(orderId: string): Promise<void> {
    const shortId = orderId.slice(-8).toUpperCase();
    return this.notify({
      role: Role.ADMIN,
      type: 'PAYMENT_APPROVED',
      title: 'Pagamento aprovado',
      message: `O pagamento do pedido #${shortId} foi aprovado.`,
      orderId,
    });
  }

  /**
   * Cria notificações (persiste + WebSocket + Web Push) para um usuário
   * específico ou para todos os usuários ativos de uma role. Usado tanto pelos
   * atalhos acima quanto pelo Order Orchestrator (produto reservado/vendido,
   * falha de publicação, etc.).
   */
  async notify(input: NotifyInput): Promise<void> {
    const targets = input.userId
      ? [{ id: input.userId }]
      : await this.prisma.user.findMany({
          where: { role: input.role, isActive: true },
          select: { id: true },
        });

    await Promise.all(targets.map(({ id }) => this.createForUser(id, input)));
  }

  private async createForUser(userId: string, input: NotifyInput): Promise<void> {
    try {
      const notification = await this.prisma.notification.create({
        data: {
          userId,
          roleTarget: input.role,
          type: input.type,
          title: input.title,
          message: input.message,
          orderId: input.orderId ?? null,
          productId: input.productId ?? null,
        },
      });
      this.gateway.emitToUser(userId, notification);
    } catch (error) {
      // P2002: notificação idêntica (mesmo usuário/tipo/pedido) já existe.
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        return;
      }
      throw error;
    }
  }

  async listForUser(userId: string) {
    const [data, unreadCount] = await Promise.all([
      this.prisma.notification.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        take: 30,
      }),
      this.prisma.notification.count({ where: { userId, readAt: null } }),
    ]);
    return { data, unreadCount };
  }

  async unreadCount(userId: string) {
    const unreadCount = await this.prisma.notification.count({
      where: { userId, readAt: null },
    });
    return { unreadCount };
  }

  async markAsRead(userId: string, notificationId: string) {
    const result = await this.prisma.notification.updateMany({
      where: { id: notificationId, userId },
      data: { readAt: new Date() },
    });
    if (result.count === 0) throw new NotFoundException('Notificação não encontrada.');
    return { read: true };
  }

  async markAllAsRead(userId: string) {
    const result = await this.prisma.notification.updateMany({
      where: { userId, readAt: null },
      data: { readAt: new Date() },
    });
    return { read: true, count: result.count };
  }
}
