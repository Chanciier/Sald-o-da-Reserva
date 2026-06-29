import { Controller, Get, Param, Patch } from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { NotificationsService } from './notifications.service';

@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get()
  list(@CurrentUser('id') userId: string) {
    return this.notifications.listForUser(userId);
  }

  @Patch(':id/read')
  markAsRead(@CurrentUser('id') userId: string, @Param('id') notificationId: string) {
    return this.notifications.markAsRead(userId, notificationId);
  }
}
