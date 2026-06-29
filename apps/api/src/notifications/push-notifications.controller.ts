import { Body, Controller, Delete, Get, Post } from '@nestjs/common';
import { Role } from '@prisma/client';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import {
  RemovePushSubscriptionDto,
  SavePushSubscriptionDto,
} from './dto/push-subscription.dto';
import { PushNotificationsService } from './push-notifications.service';

@Controller('notifications/push')
@Roles(Role.ADMIN)
export class PushNotificationsController {
  constructor(private readonly push: PushNotificationsService) {}

  @Get('public-key')
  getPublicKey() {
    return this.push.getPublicKey();
  }

  @Post('subscription')
  subscribe(
    @CurrentUser('id') userId: string,
    @Body() dto: SavePushSubscriptionDto,
  ) {
    return this.push.subscribe(userId, dto);
  }

  @Delete('subscription')
  unsubscribe(
    @CurrentUser('id') userId: string,
    @Body() dto: RemovePushSubscriptionDto,
  ) {
    return this.push.unsubscribe(userId, dto);
  }
}
