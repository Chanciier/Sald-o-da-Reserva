import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { CheckoutSavedProfilesFlagService } from './checkout-saved-profiles-flag.service';

@Module({
  imports: [PrismaModule],
  providers: [CheckoutSavedProfilesFlagService],
  exports: [CheckoutSavedProfilesFlagService],
})
export class FeatureFlagsModule {}
