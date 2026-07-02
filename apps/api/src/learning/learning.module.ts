import { Module } from '@nestjs/common';
import { MarketResearchModule } from '../market-research/market-research.module';
import { PrismaModule } from '../prisma/prisma.module';
import { LearningController } from './learning.controller';
import { LearningService } from './learning.service';

/**
 * LearningModule — fecha o ciclo do Funcionário Virtual: observa vendas
 * (evento `product.sold`), estoque parado (varredura diária) e acessos
 * (tracking público) para aprender um viés por categoria, consumido pelo
 * PricingModule na próxima sugestão. RedisModule/EventBusModule são globais.
 */
@Module({
  imports: [PrismaModule, MarketResearchModule],
  controllers: [LearningController],
  providers: [LearningService],
  exports: [LearningService],
})
export class LearningModule {}
