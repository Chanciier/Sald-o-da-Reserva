import { Module } from '@nestjs/common';
import { InvoiceController } from './invoice.controller';
import { InvoiceService } from './invoice.service';
import { InvoiceRepository } from './invoice.repository';
import { EnotasService } from './enotas.service';
import { InvoiceScheduler } from './invoice.scheduler';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [InvoiceController],
  providers: [InvoiceService, InvoiceRepository, EnotasService, InvoiceScheduler],
  exports: [InvoiceService],
})
export class InvoiceModule {}
