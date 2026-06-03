import { Role } from '@prisma/client';

export { Role };

export interface JwtPayload {
  sub: string;
  email: string;
  role: Role;
}

export interface JwtRefreshPayload {
  sub: string;
  jti: string;
}

export interface AuthenticatedUser {
  id: string;
  email: string;
  role: Role;
}

export interface AuthResult {
  user: AuthenticatedUser;
  accessToken: string;
  refreshToken: string;
}
