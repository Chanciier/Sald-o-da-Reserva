import { Module } from '@nestjs/common';
import { MercadoPagoService } from './mercadopago.service';

@Module({
  providers: [MercadoPagoService],
  exports: [MercadoPagoService],
})
export class MercadoPagoModule {}
