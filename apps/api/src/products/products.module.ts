import { Module } from '@nestjs/common';
import { ProductsService } from './products.service';
import { ProductsController } from './products.controller';
import { AnalyzeImageService } from './analyze-image.service';
import { PrismaModule } from '../prisma/prisma.module';
import { RedisModule } from '../redis/redis.module';
import { StorageModule } from '../storage/storage.module';
import { MarketplaceModule } from '../marketplace/marketplace.module';

@Module({
  imports: [PrismaModule, RedisModule, StorageModule, MarketplaceModule],
  controllers: [ProductsController],
  providers: [ProductsService, AnalyzeImageService],
  exports: [ProductsService],
})
export class ProductsModule {}
