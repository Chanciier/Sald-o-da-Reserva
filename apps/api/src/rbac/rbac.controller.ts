import { Body, Controller, Get, HttpCode, HttpStatus, Param, Patch, Req } from '@nestjs/common';
import { Request } from 'express';
import { Role } from '@prisma/client';
import { RbacService } from './rbac.service';
import { AssignRoleDto } from './dto/assign-role.dto';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthenticatedUser } from '../auth/types/auth.types';

@Controller('admin/rbac')
@Roles(Role.ADMIN)
export class RbacController {
  constructor(private readonly rbacService: RbacService) {}

  @Get('roles')
  @HttpCode(HttpStatus.OK)
  getRolesMatrix() {
    return this.rbacService.getRolesMatrix();
  }

  @Patch('users/:id/role')
  @HttpCode(HttpStatus.OK)
  async assignRole(
    @Param('id') targetUserId: string,
    @Body() dto: AssignRoleDto,
    @CurrentUser() admin: AuthenticatedUser,
    @Req() req: Request,
  ) {
    const ip =
      (req.headers['cf-connecting-ip'] as string) ||
      (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
      req.ip ||
      'unknown';

    await this.rbacService.assignRole(targetUserId, dto.role, admin.id, ip);
    return { message: `Perfil atualizado para ${dto.role}. Sessões revogadas.` };
  }

  @Get('users/:id/permissions')
  @HttpCode(HttpStatus.OK)
  async getUserPermissions(@Param('id') userId: string) {
    const permissions = await this.rbacService.getUserPermissions(userId);
    return { userId, permissions };
  }
}
