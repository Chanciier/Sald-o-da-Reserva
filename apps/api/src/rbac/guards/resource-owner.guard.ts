import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Role } from '@prisma/client';
import { RESOURCE_OWNER_KEY } from '../../auth/decorators/resource-owner.decorator';
import { AuthenticatedUser } from '../../auth/types/auth.types';

@Injectable()
export class ResourceOwnerGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const paramName = this.reflector.getAllAndOverride<string>(RESOURCE_OWNER_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!paramName) return true;

    const req = context.switchToHttp().getRequest<{
      user?: AuthenticatedUser;
      params: Record<string, string>;
    }>();

    if (!req.user) return false;

    // ADMINs bypass ownership checks
    if (req.user.role === Role.ADMIN) return true;

    const resourceOwnerId = req.params[paramName];
    if (!resourceOwnerId) throw new ForbiddenException('Recurso não encontrado.');

    if (req.user.id !== resourceOwnerId) {
      throw new ForbiddenException('Você não tem permissão para acessar este recurso.');
    }

    return true;
  }
}
