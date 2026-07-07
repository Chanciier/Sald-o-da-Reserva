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

export interface PublicUser {
  id: string;
  email: string;
  name: string | null;
  role: Role;
  phone: string | null;
  avatarUrl: string | null;
  emailVerifiedAt: Date | null;
}

export interface AuthResult {
  user: PublicUser;
  accessToken: string;
  refreshToken: string;
}
