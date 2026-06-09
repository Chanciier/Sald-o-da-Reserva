import { Module } from '@nestjs/common';
import { LegalPagesController } from './legal-pages.controller';
import { LegalPagesService } from './legal-pages.service';
import { FaqController } from './faq.controller';
import { FaqService } from './faq.service';
import { ContactController } from './contact.controller';
import { ConsentController } from './consent.controller';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [LegalPagesController, FaqController, ContactController, ConsentController],
  providers: [LegalPagesService, FaqService],
})
export class ContentModule {}
