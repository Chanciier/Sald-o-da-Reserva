import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Query,
  Req,
} from '@nestjs/common';
import { Request } from 'express';
import { AdminSection, Role } from '@prisma/client';
import { RbacService } from './rbac.service';
import { AssignRoleDto } from './dto/assign-role.dto';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthenticatedUser } from '../auth/types/auth.types';
import { RequireSection } from '../seller-permissions/decorators/require-section.decorator';

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

  // Listagem somente-leitura de clientes, liberada a vendedores com a seção
  // "Clientes" configurada — não expõe VENDEDOR/ADMIN nem permite troca de role.
  @Get('clientes')
  @Roles(Role.ADMIN, Role.VENDEDOR)
  @RequireSection(AdminSection.CLIENTES)
  @HttpCode(HttpStatus.OK)
  listClientes(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('search') search?: string,
  ) {
    return this.rbacService.listUsers({
      page: page ? parseInt(page, 10) : 1,
      limit: limit ? parseInt(limit, 10) : 20,
      role: Role.CLIENTE,
      search: search || undefined,
    });
  }

  @Get('users')
  @HttpCode(HttpStatus.OK)
  listUsers(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('role') role?: Role,
    @Query('search') search?: string,
  ) {
    return this.rbacService.listUsers({
      page: page ? parseInt(page, 10) : 1,
      limit: limit ? parseInt(limit, 10) : 20,
      role: role || undefined,
      search: search || undefined,
    });
  }

  @Get('audit-logs')
  @HttpCode(HttpStatus.OK)
  listAuditLogs(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('userId') userId?: string,
    @Query('action') action?: string,
  ) {
    return this.rbacService.listAuditLogs({
      page: page ? parseInt(page, 10) : 1,
      limit: limit ? parseInt(limit, 10) : 50,
      userId: userId || undefined,
      action: action || undefined,
    });
  }
}
