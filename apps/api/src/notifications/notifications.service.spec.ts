import { BadRequestException } from '@nestjs/common';
import { Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsGateway } from './notifications.gateway';
import { NotificationsService } from './notifications.service';

describe('NotificationsService', () => {
  let service: NotificationsService;
  let prisma: {
    user: { findMany: jest.Mock; findUnique: jest.Mock };
    order: { findUnique: jest.Mock };
    notification: { create: jest.Mock };
  };
  let gateway: { emitToUser: jest.Mock };

  beforeEach(() => {
    prisma = {
      user: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
      },
      order: {
        findUnique: jest.fn(),
      },
      notification: {
        create: jest.fn(),
      },
    };
    gateway = { emitToUser: jest.fn() };
    service = new NotificationsService(
      prisma as unknown as PrismaService,
      gateway as unknown as NotificationsGateway,
    );
  });

  it('sends approved-payment notifications only to active admins', async () => {
    prisma.order.findUnique.mockResolvedValue({ total: { toString: () => '199.9' } });
    prisma.user.findMany.mockResolvedValue([{ id: 'admin-1' }, { id: 'admin-2' }]);
    prisma.notification.create.mockImplementation(({ data }) =>
      Promise.resolve({ id: `notif-${data.userId}`, ...data }),
    );

    await service.notifyPaymentApproved('order-1');

    expect(prisma.user.findMany).toHaveBeenCalledWith({
      where: { role: Role.ADMIN, isActive: true },
      select: { id: true },
    });
    expect(prisma.notification.create).toHaveBeenCalledTimes(2);
    expect(prisma.notification.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId: 'admin-1',
          roleTarget: Role.ADMIN,
          type: 'PAYMENT_APPROVED',
        }),
      }),
    );
    expect(gateway.emitToUser).toHaveBeenCalledTimes(2);
  });

  it('blocks approved-sale notifications for the customer role', async () => {
    await expect(
      service.notify({
        role: Role.CLIENTE,
        type: 'PAYMENT_APPROVED',
        title: 'Pagamento aprovado',
        message: 'Venda aprovada.',
        orderId: 'order-1',
      }),
    ).rejects.toThrow(BadRequestException);

    expect(prisma.user.findMany).not.toHaveBeenCalled();
    expect(prisma.notification.create).not.toHaveBeenCalled();
    expect(gateway.emitToUser).not.toHaveBeenCalled();
  });

  it('rejects direct notifications when the target user role does not match', async () => {
    prisma.user.findUnique.mockResolvedValue({
      id: 'customer-1',
      role: Role.CLIENTE,
      isActive: true,
    });

    await expect(
      service.notify({
        role: Role.ADMIN,
        type: 'PAYMENT_APPROVED',
        title: 'Pagamento aprovado',
        message: 'Venda aprovada.',
        orderId: 'order-1',
        userId: 'customer-1',
      }),
    ).rejects.toThrow(BadRequestException);

    expect(prisma.notification.create).not.toHaveBeenCalled();
    expect(gateway.emitToUser).not.toHaveBeenCalled();
  });
});
