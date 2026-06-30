import { Module } from '@nestjs/common';
import { MarketplaceController } from './marketplace.controller';
import { MarketplaceHubService } from './marketplace-hub.service';
import { SiteProvider } from './providers/site.provider';
import { MercadoLivreProvider } from './providers/mercadolivre.provider';
import { ShopeeProvider } from './providers/shopee.provider';
import { MlTokenService } from './providers/ml-token.service';
import { RedisModule } from '../redis/redis.module';

@Module({
  imports: [RedisModule],
  controllers: [MarketplaceController],
  providers: [
    MarketplaceHubService,
    SiteProvider,
    MercadoLivreProvider,
    ShopeeProvider,
    MlTokenService,
  ],
  exports: [MarketplaceHubService],
})
export class MarketplaceModule {}
