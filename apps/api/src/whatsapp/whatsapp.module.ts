import { Global, Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { WhatsappProvider } from './whatsapp.provider';
import { WhatsappMarketingService } from './whatsapp-marketing.service';
import { WhatsappController } from './whatsapp.controller';

@Global()
@Module({
  imports: [PrismaModule],
  controllers: [WhatsappController],
  providers: [WhatsappProvider, WhatsappMarketingService],
  exports: [WhatsappMarketingService],
})
export class WhatsappModule {}
