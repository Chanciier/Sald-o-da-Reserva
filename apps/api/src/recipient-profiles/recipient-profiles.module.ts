import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { FeatureFlagsModule } from '../feature-flags/feature-flags.module';
import { RecipientProfilesService } from './recipient-profiles.service';
import { RecipientProfilesController } from './recipient-profiles.controller';

@Module({
  imports: [PrismaModule, FeatureFlagsModule],
  controllers: [RecipientProfilesController],
  providers: [RecipientProfilesService],
  exports: [RecipientProfilesService],
})
export class RecipientProfilesModule {}
