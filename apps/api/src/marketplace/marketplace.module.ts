import { Module } from '@nestjs/common';
import { MarketplaceController } from './marketplace.controller';
import { ShopeeOauthController } from './shopee-oauth.controller';
import { MarketplaceHubService } from './marketplace-hub.service';
import { SiteProvider } from './providers/site.provider';
import { MercadoLivreProvider } from './providers/mercadolivre.provider';
import { ShopeeProvider } from './providers/shopee.provider';
import { MlTokenService } from './providers/ml-token.service';
import { MlCatalogService } from './providers/ml-catalog.service';
import { MlOrderImportService } from './providers/ml-order-import.service';
import { ShopeeTokenService } from './providers/shopee-token.service';
import { ShopeeCatalogService } from './providers/shopee-catalog.service';
import { ShopeeOrderImportService } from './providers/shopee-order-import.service';
import { RedisModule } from '../redis/redis.module';
import { StockModule } from '../stock/stock.module';

@Module({
  imports: [RedisModule, StockModule],
  controllers: [MarketplaceController, ShopeeOauthController],
  providers: [
    MarketplaceHubService,
    SiteProvider,
    MercadoLivreProvider,
    ShopeeProvider,
    MlTokenService,
    MlCatalogService,
    MlOrderImportService,
    ShopeeTokenService,
    ShopeeCatalogService,
    ShopeeOrderImportService,
  ],
  exports: [MarketplaceHubService, MlOrderImportService, ShopeeOrderImportService],
})
export class MarketplaceModule {}
