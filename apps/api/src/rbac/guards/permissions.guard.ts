import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Permission, ROLE_PERMISSIONS } from '../rbac.constants';
import { PERMISSIONS_KEY } from '../../auth/decorators/permissions.decorator';
import { AuthenticatedUser } from '../../auth/types/auth.types';

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<Permission[]>(PERMISSIONS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!required || required.length === 0) return true;

    const req = context.switchToHttp().getRequest<{ user?: AuthenticatedUser }>();
    if (!req.user) return false;

    const userPerms = ROLE_PERMISSIONS[req.user.role] ?? [];
    const missing = required.filter((p) => !userPerms.includes(p));

    if (missing.length > 0) {
      throw new ForbiddenException(`Permissão insuficiente: ${missing.join(', ')}`);
    }

    return true;
  }
}
