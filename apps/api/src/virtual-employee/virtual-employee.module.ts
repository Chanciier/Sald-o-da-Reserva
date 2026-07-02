import { Module } from '@nestjs/common';
import { IdentificationModule } from '../identification/identification.module';
import { LearningModule } from '../learning/learning.module';
import { MarketResearchModule } from '../market-research/market-research.module';
import { PricingModule } from '../pricing/pricing.module';
import { PrismaModule } from '../prisma/prisma.module';
import { ProductsModule } from '../products/products.module';
import { VisionModule } from '../vision/vision.module';
import { VirtualEmployeeController } from './virtual-employee.controller';
import { VirtualEmployeeService } from './virtual-employee.service';

/**
 * VirtualEmployeeModule — orquestrador de ponta a ponta: Vision →
 * Identification → Market Research → Pricing → Learning → criação do
 * produto. Depende de todos os módulos do pipeline, cada um mantendo sua
 * própria responsabilidade isolada e testável.
 */
@Module({
  imports: [
    VisionModule,
    IdentificationModule,
    MarketResearchModule,
    PricingModule,
    LearningModule,
    ProductsModule,
    PrismaModule,
  ],
  controllers: [VirtualEmployeeController],
  providers: [VirtualEmployeeService],
  exports: [VirtualEmployeeService],
})
export class VirtualEmployeeModule {}
