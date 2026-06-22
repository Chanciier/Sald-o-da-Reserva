import { Module } from '@nestjs/common';
import { MetaCatalogService } from './meta-catalog.service';
import { MetaCatalogController } from './meta-catalog.controller';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [MetaCatalogController],
  providers: [MetaCatalogService],
  exports: [MetaCatalogService],
})
export class MetaCatalogModule {}
