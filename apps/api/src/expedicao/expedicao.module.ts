import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { MercadoPagoModule } from '../mercadopago/mercadopago.module';
import { InvoiceModule } from '../invoices/invoice.module';
import { ExpedicaoController } from './expedicao.controller';
import { ExpedicaoService } from './expedicao.service';

@Module({
  imports: [PrismaModule, MercadoPagoModule, InvoiceModule],
  controllers: [ExpedicaoController],
  providers: [ExpedicaoService],
})
export class ExpedicaoModule {}
