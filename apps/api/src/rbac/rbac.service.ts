import { Injectable, NotFoundException } from '@nestjs/common';
import { Role } from '@prisma/client';
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
}
