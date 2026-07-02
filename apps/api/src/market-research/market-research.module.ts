import { Module } from '@nestjs/common';
import { AnthropicModule } from '../anthropic/anthropic.module';
import { MarketResearchController } from './market-research.controller';
import { MarketResearchService } from './market-research.service';

/**
 * MarketResearchModule — terceira etapa do Funcionário Virtual ("Hermes
 * Agent"). Pesquisa preços de mercado (Mercado Livre + Shopee) para o produto
 * identificado, em background, com cache — nunca bloqueia o cadastro.
 *
 * RedisModule e QueueModule são globais (não precisam import aqui).
 */
@Module({
  imports: [AnthropicModule],
  controllers: [MarketResearchController],
  providers: [MarketResearchService],
  exports: [MarketResearchService],
})
export class MarketResearchModule {}
