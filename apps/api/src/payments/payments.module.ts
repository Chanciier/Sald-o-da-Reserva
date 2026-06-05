import { Module } from '@nestjs/common';
import { PaymentsService } from './payments.service';
import { PaymentsController } from './payments.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { InvoiceModule } from '../invoices/invoice.module';
import { MercadoPagoModule } from '../mercadopago/mercadopago.module';

@Module({
  imports: [PrismaModule, InvoiceModule, MercadoPagoModule],
  controllers: [PaymentsController],
  providers: [PaymentsService],
  exports: [PaymentsService],
})
export class PaymentsModule {}
