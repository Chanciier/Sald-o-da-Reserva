import { Module } from '@nestjs/common';
import { MarketplaceController } from './marketplace.controller';
import { MarketplaceHubService } from './marketplace-hub.service';
import { SiteProvider } from './providers/site.provider';
import { MercadoLivreProvider } from './providers/mercadolivre.provider';
import { ShopeeProvider } from './providers/shopee.provider';

/**
 * Marketplace Hub. Depende de Redis/Queue/EventBus (globais) e Prisma (global).
 * Exporta o Hub para que products/orchestrator possam enfileirar publicações e
 * sincronizações.
 */
@Module({
  controllers: [MarketplaceController],
  providers: [MarketplaceHubService, SiteProvider, MercadoLivreProvider, ShopeeProvider],
  exports: [MarketplaceHubService],
})
export class MarketplaceModule {}
