import { Global, Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { BaileysService } from './baileys.service';
import { WhatsappProvider } from './whatsapp.provider';
import { WhatsappMarketingService } from './whatsapp-marketing.service';
import { AIContentService } from './ai-content.service';
import { WhatsappController } from './whatsapp.controller';

@Global()
@Module({
  imports: [PrismaModule],
  controllers: [WhatsappController],
  providers: [BaileysService, WhatsappProvider, WhatsappMarketingService, AIContentService],
  exports: [WhatsappMarketingService, AIContentService],
})
export class WhatsappModule {}
