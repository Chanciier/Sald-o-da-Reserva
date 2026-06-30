import { BadRequestException, Controller, Get, Param, Patch } from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { NotificationsService } from './notifications.service';

@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get()
  list(@CurrentUser('id') userId: string) {
    return this.notifications.listForUser(userId);
  }

  @Get('unread-count')
  unreadCount(@CurrentUser('id') userId: string) {
    return this.notifications.unreadCount(userId);
  }

  @Patch('read-all')
  markAllAsRead(@CurrentUser('id') userId: string) {
    return this.notifications.markAllAsRead(userId);
  }

  @Patch(':id/read')
  markAsRead(@CurrentUser('id') userId: string, @Param('id') notificationId: string) {
    if (!/^[a-z0-9]{20,32}$/i.test(notificationId)) {
      throw new BadRequestException('Identificador de notificação inválido.');
    }
    return this.notifications.markAsRead(userId, notificationId);
  }
}
