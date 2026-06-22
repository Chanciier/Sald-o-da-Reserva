import { Module } from '@nestjs/common';
import { ShippingService } from './shipping.service';
import { ShippingController } from './shipping.controller';
import { ShippingScheduler } from './shipping.scheduler';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [ShippingController],
  providers: [ShippingService, ShippingScheduler],
  exports: [ShippingService],
})
export class ShippingModule {}
