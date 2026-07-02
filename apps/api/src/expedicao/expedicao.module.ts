import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { MercadoPagoModule } from '../mercadopago/mercadopago.module';
import { ExpedicaoController } from './expedicao.controller';
import { ExpedicaoService } from './expedicao.service';

@Module({
  imports: [PrismaModule, MercadoPagoModule],
  controllers: [ExpedicaoController],
  providers: [ExpedicaoService],
})
export class ExpedicaoModule {}
