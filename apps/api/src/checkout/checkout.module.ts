import { Module } from '@nestjs/common';
import { CheckoutService } from './checkout.service';
import { CheckoutController } from './checkout.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { CartModule } from '../cart/cart.module';

@Module({
  imports: [PrismaModule, CartModule],
  controllers: [CheckoutController],
  providers: [CheckoutService],
})
export class CheckoutModule {}
