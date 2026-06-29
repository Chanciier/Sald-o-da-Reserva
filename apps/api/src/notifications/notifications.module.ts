import { Global, Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PrismaModule } from '../prisma/prisma.module';
import { NotificationsController } from './notifications.controller';
import { NotificationsGateway } from './notifications.gateway';
import { NotificationsService } from './notifications.service';
import { PushNotificationsService } from './push-notifications.service';
import { PushNotificationsController } from './push-notifications.controller';

@Global()
@Module({
  imports: [PrismaModule, JwtModule.register({})],
  controllers: [NotificationsController, PushNotificationsController],
  providers: [NotificationsGateway, NotificationsService, PushNotificationsService],
  exports: [NotificationsService],
})
export class NotificationsModule {}
