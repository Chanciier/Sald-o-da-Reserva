import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { MercadoPagoModule } from '../mercadopago/mercadopago.module';
import { StockModule } from '../stock/stock.module';
import { ExpedicaoController } from './expedicao.controller';
import { ExpedicaoService } from './expedicao.service';

@Module({
  imports: [PrismaModule, MercadoPagoModule, StockModule],
  controllers: [ExpedicaoController],
  providers: [ExpedicaoService],
})
export class ExpedicaoModule {}
