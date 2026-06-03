import { Module } from '@nestjs/common';
import { RbacService } from './rbac.service';
import { RbacController } from './rbac.controller';
import { RolesGuard } from './guards/roles.guard';
import { PermissionsGuard } from './guards/permissions.guard';
import { ResourceOwnerGuard } from './guards/resource-owner.guard';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [RbacController],
  providers: [RbacService, RolesGuard, PermissionsGuard, ResourceOwnerGuard],
  exports: [RbacService, RolesGuard, PermissionsGuard, ResourceOwnerGuard],
})
export class RbacModule {}
