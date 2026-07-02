import { Body, Controller, Get, HttpCode, HttpStatus, Param, Patch, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Role } from '@prisma/client';
import { SellerPermissionsService } from './seller-permissions.service';
import { UpdateSellerPermissionsDto } from './dto/update-permissions.dto';
import { RequestSectionAccessDto } from './dto/request-access.dto';
import { ValidateSectionPasswordDto } from './dto/validate-password.dto';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthenticatedUser } from '../auth/types/auth.types';

@Controller('seller-permissions')
export class SellerPermissionsController {
  constructor(private readonly sellerPermissions: SellerPermissionsService) {}

  @Get('vendedores')
  @Roles(Role.ADMIN)
  @HttpCode(HttpStatus.OK)
  listForAdmin() {
    return this.sellerPermissions.listForAdmin();
  }

  @Get('me')
  @Roles(Role.ADMIN, Role.VENDEDOR)
  @HttpCode(HttpStatus.OK)
  getMyPermissions(@CurrentUser() user: AuthenticatedUser) {
    return this.sellerPermissions.getMyPermissions(user.id, user.role);
  }

  @Patch('vendedores/:userId')
  @Roles(Role.ADMIN)
  @HttpCode(HttpStatus.OK)
  updatePermissions(
    @Param('userId') userId: string,
    @Body() dto: UpdateSellerPermissionsDto,
    @CurrentUser() admin: AuthenticatedUser,
  ) {
    return this.sellerPermissions.updatePermissions(userId, admin.id, dto.permissions);
  }

  @Post('request')
  @Roles(Role.VENDEDOR)
  @HttpCode(HttpStatus.CREATED)
  requestAccess(@Body() dto: RequestSectionAccessDto, @CurrentUser() user: AuthenticatedUser) {
    return this.sellerPermissions.requestAccess(user.id, dto.section, dto.message);
  }

  @Patch('requests/:id/approve')
  @Roles(Role.ADMIN)
  @HttpCode(HttpStatus.OK)
  approveRequest(@Param('id') id: string, @CurrentUser() admin: AuthenticatedUser) {
    return this.sellerPermissions.approveRequest(id, admin.id);
  }

  @Patch('requests/:id/deny')
  @Roles(Role.ADMIN)
  @HttpCode(HttpStatus.OK)
  denyRequest(@Param('id') id: string, @CurrentUser() admin: AuthenticatedUser) {
    return this.sellerPermissions.denyRequest(id, admin.id);
  }

  @Post('validate-password')
  @Roles(Role.VENDEDOR)
  @HttpCode(HttpStatus.OK)
  @Throttle({ medium: { limit: 10, ttl: 60_000 } })
  validatePassword(
    @Body() dto: ValidateSectionPasswordDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.sellerPermissions.validatePassword(user.id, dto.section, dto.password);
  }
}
