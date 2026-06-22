import { Module } from '@nestjs/common';
import { CheckoutService } from './checkout.service';
import { CheckoutController } from './checkout.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { CartModule } from '../cart/cart.module';
import { ShippingModule } from '../shipping/shipping.module';
import { MetaModule } from '../meta/meta.module';

@Module({
  imports: [PrismaModule, CartModule, ShippingModule, MetaModule],
  controllers: [CheckoutController],
  providers: [CheckoutService],
})
export class CheckoutModule {}
