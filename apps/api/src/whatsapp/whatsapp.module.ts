import { Global, Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { BaileysService } from './baileys.service';
import { WhatsappProvider } from './whatsapp.provider';
import { WhatsappMarketingService } from './whatsapp-marketing.service';
import { WhatsappBroadcastService } from './whatsapp-broadcast.service';
import { AIContentService } from './ai-content.service';
import { OrderWhatsappService } from './order-whatsapp.service';
import { WhatsappController } from './whatsapp.controller';
import { WhatsappRelayService } from './whatsapp-relay.service';
import { WhatsappRelayController } from './whatsapp-relay.controller';

@Global()
@Module({
  imports: [PrismaModule],
  controllers: [WhatsappController, WhatsappRelayController],
  providers: [
    BaileysService,
    WhatsappProvider,
    WhatsappMarketingService,
    WhatsappBroadcastService,
    AIContentService,
    OrderWhatsappService,
    WhatsappRelayService,
  ],
  exports: [BaileysService, WhatsappMarketingService, AIContentService, OrderWhatsappService],
})
export class WhatsappModule {}
