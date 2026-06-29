import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsGateway } from './notifications.gateway';

interface RoleNotificationInput {
  role: Role;
  type: 'ORDER_CREATED' | 'PAYMENT_APPROVED';
  title: string;
  message: string;
  orderId: string;
}

@Injectable()
export class NotificationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly gateway: NotificationsGateway,
  ) {}

  notifyNewOrder(orderId: string): Promise<void> {
    const shortId = orderId.slice(-8).toUpperCase();
    return this.notifyRole({
      role: Role.VENDEDOR,
      type: 'ORDER_CREATED',
      title: 'Novo pedido',
      message: `O pedido #${shortId} foi criado e aguarda pagamento.`,
      orderId,
    });
  }

  notifyPaymentApproved(orderId: string): Promise<void> {
    const shortId = orderId.slice(-8).toUpperCase();
    return this.notifyRole({
      role: Role.ADMIN,
      type: 'PAYMENT_APPROVED',
      title: 'Pagamento aprovado',
      message: `O pagamento do pedido #${shortId} foi aprovado.`,
      orderId,
    });
  }

  private async notifyRole(input: RoleNotificationInput): Promise<void> {
    const users = await this.prisma.user.findMany({
      where: { role: input.role, isActive: true },
      select: { id: true },
    });

    await Promise.all(
      users.map(async ({ id: userId }) => {
        try {
          const notification = await this.prisma.notification.create({
            data: {
              userId,
              roleTarget: input.role,
              type: input.type,
              title: input.title,
              message: input.message,
              orderId: input.orderId,
            },
          });
          this.gateway.emitToUser(userId, notification);
        } catch (error) {
          if (
            error instanceof Prisma.PrismaClientKnownRequestError &&
            error.code === 'P2002'
          ) {
            return;
          }
          throw error;
        }
      }),
    );
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

  async markAsRead(userId: string, notificationId: string) {
    const result = await this.prisma.notification.updateMany({
      where: { id: notificationId, userId },
      data: { readAt: new Date() },
    });
    if (result.count === 0) throw new NotFoundException('Notificação não encontrada.');
    return { read: true };
  }
}
