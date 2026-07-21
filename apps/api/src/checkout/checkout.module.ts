import { Module } from '@nestjs/common';
import { CheckoutService } from './checkout.service';
import { CheckoutController } from './checkout.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { CartModule } from '../cart/cart.module';
import { ShippingModule } from '../shipping/shipping.module';
import { StockModule } from '../stock/stock.module';
import { FeatureFlagsModule } from '../feature-flags/feature-flags.module';
import { CheckoutIdentityNormalizer } from './recipient/checkout-identity.normalizer';

@Module({
  imports: [PrismaModule, CartModule, ShippingModule, StockModule, FeatureFlagsModule],
  controllers: [CheckoutController],
  providers: [CheckoutService, CheckoutIdentityNormalizer],
})
export class CheckoutModule {}
