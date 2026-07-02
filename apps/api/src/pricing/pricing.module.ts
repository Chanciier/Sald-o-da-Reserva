import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { PricingController } from './pricing.controller';
import { PricingService } from './pricing.service';

/**
 * PricingModule — quarta etapa do Funcionário Virtual. Sugere preço a partir
 * do resultado do MarketResearchModule (Hermes) + catálogo próprio, sem
 * depender de nenhum dos dois módulos em código (recebe números simples).
 */
@Module({
  imports: [PrismaModule],
  controllers: [PricingController],
  providers: [PricingService],
  exports: [PricingService],
})
export class PricingModule {}
