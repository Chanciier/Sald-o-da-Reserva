import { Module } from '@nestjs/common';
import { SellerPermissionsService } from './seller-permissions.service';
import { SellerPermissionsController } from './seller-permissions.controller';
import { SectionAccessGuard } from './guards/section-access.guard';
import { PrismaModule } from '../prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [PrismaModule, AuthModule],
  controllers: [SellerPermissionsController],
  providers: [SellerPermissionsService, SectionAccessGuard],
  exports: [SellerPermissionsService, SectionAccessGuard],
})
export class SellerPermissionsModule {}
