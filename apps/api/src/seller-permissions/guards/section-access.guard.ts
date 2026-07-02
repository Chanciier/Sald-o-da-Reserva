import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AdminSection, Role } from '@prisma/client';
import { REQUIRE_SECTION_KEY } from '../decorators/require-section.decorator';
import { AuthenticatedUser } from '../../auth/types/auth.types';
import { SellerPermissionsService } from '../seller-permissions.service';

@Injectable()
export class SectionAccessGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly sellerPermissions: SellerPermissionsService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const required = this.reflector.getAllAndOverride<AdminSection[]>(REQUIRE_SECTION_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!required || required.length === 0) return true;

    const req = context.switchToHttp().getRequest<{ user?: AuthenticatedUser }>();
    if (!req.user) return false;

    // A granularidade por seção só existe para VENDEDOR; ADMIN sempre passa.
    if (req.user.role !== Role.VENDEDOR) return true;

    const allowed = await this.sellerPermissions.hasSectionAccess(req.user.id, required);
    if (!allowed) {
      throw new ForbiddenException('Você não tem acesso a esta seção do painel.');
    }
    return true;
  }
}
