import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { Permission, ROLE_PERMISSIONS } from './rbac.constants';

@Injectable()
export class RbacService {
  constructor(private readonly prisma: PrismaService) {}

  async assignRole(targetUserId: string, role: Role, adminId: string, ip: string): Promise<void> {
    const target = await this.prisma.user.findUnique({
      where: { id: targetUserId },
      select: { id: true, role: true },
    });
    if (!target) throw new NotFoundException('Usuário não encontrado.');

    const previousRole = target.role;

    await this.prisma.$transaction([
      this.prisma.user.update({ where: { id: targetUserId }, data: { role } }),
      // Revoke all sessions — user must re-login to get JWT with the new role
      this.prisma.refreshToken.updateMany({
        where: { userId: targetUserId, isRevoked: false },
        data: { isRevoked: true },
      }),
      this.prisma.auditLog.create({
        data: {
          action: 'ROLE_ASSIGNED',
          userId: adminId,
          ipAddress: ip,
          metadata: { targetUserId, previousRole, newRole: role },
        },
      }),
    ]);
  }

  getRolePermissions(role: Role): Permission[] {
    return ROLE_PERMISSIONS[role] ?? [];
  }

  async getUserPermissions(userId: string): Promise<Permission[]> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { role: true },
    });
    if (!user) throw new NotFoundException('Usuário não encontrado.');
    return this.getRolePermissions(user.role);
  }

  getRolesMatrix(): Record<Role, Permission[]> {
    return ROLE_PERMISSIONS;
  }

  async listUsers(params: { page: number; limit: number; role?: Role; search?: string }) {
    const where: Prisma.UserWhereInput = {
      ...(params.role ? { role: params.role } : {}),
      ...(params.search
        ? {
            OR: [
              { email: { contains: params.search, mode: 'insensitive' } },
              { name: { contains: params.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const [total, data] = await Promise.all([
      this.prisma.user.count({ where }),
      this.prisma.user.findMany({
        where,
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
          isActive: true,
          createdAt: true,
        },
        skip: (params.page - 1) * params.limit,
        take: params.limit,
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    return { data, total, page: params.page, pages: Math.ceil(total / params.limit) };
  }

  async listAuditLogs(params: { page: number; limit: number; userId?: string; action?: string }) {
    const where: Prisma.AuditLogWhereInput = {
      ...(params.userId ? { userId: params.userId } : {}),
      ...(params.action ? { action: { contains: params.action, mode: 'insensitive' } } : {}),
    };

    const [total, data] = await Promise.all([
      this.prisma.auditLog.count({ where }),
      this.prisma.auditLog.findMany({
        where,
        include: { user: { select: { email: true, name: true } } },
        skip: (params.page - 1) * params.limit,
        take: params.limit,
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    return { data, total, page: params.page, pages: Math.ceil(total / params.limit) };
  }
}
