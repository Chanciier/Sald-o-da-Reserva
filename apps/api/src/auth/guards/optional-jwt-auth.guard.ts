import { ExecutionContext, Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

/**
 * Optional JWT guard for @Public() routes that return richer data to
 * authenticated staff (ADMIN/VENDEDOR). It runs the JWT strategy when a token
 * is present — populating req.user — but NEVER rejects anonymous requests.
 *
 * The global JwtAuthGuard short-circuits @Public() routes and skips the
 * strategy, so req.user is undefined there. Applying this guard on top
 * re-runs the strategy without blocking anonymous access.
 */
@Injectable()
export class OptionalJwtAuthGuard extends AuthGuard('jwt') {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    try {
      await super.canActivate(context);
    } catch {
      // No token / invalid token: proceed as anonymous.
    }
    return true;
  }

  // Override the default behaviour that throws when no user is found.
  handleRequest<TUser = unknown>(_err: unknown, user: TUser): TUser {
    return (user || undefined) as TUser;
  }
}
