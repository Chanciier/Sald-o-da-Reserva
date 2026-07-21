import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

// Estágios do rollout de CHECKOUT_SAVED_PROFILES_ENABLED, em ordem de alcance:
// false (ninguém) < dev (não-produção) < admins < beta (+ isBetaTester) < all/true (todos).
export type CheckoutSavedProfilesStage = 'false' | 'dev' | 'admins' | 'beta' | 'all';

@Injectable()
export class CheckoutSavedProfilesFlagService {
  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  stage(): CheckoutSavedProfilesStage {
    const raw = (this.config.get<string>('CHECKOUT_SAVED_PROFILES_ENABLED', 'false') || 'false')
      .trim()
      .toLowerCase();
    if (raw === 'true' || raw === 'all') return 'all';
    if (raw === 'beta') return 'beta';
    if (raw === 'admins') return 'admins';
    if (raw === 'dev') return 'dev';
    return 'false';
  }

  async isEnabledForUser(userId: string, role: Role): Promise<boolean> {
    const stage = this.stage();
    switch (stage) {
      case 'all':
        return true;
      case 'admins':
        return role === Role.ADMIN;
      case 'beta': {
        if (role === Role.ADMIN) return true;
        const user = await this.prisma.user.findUnique({
          where: { id: userId },
          select: { isBetaTester: true },
        });
        return !!user?.isBetaTester;
      }
      case 'dev':
        return this.config.get<string>('NODE_ENV', 'development') !== 'production';
      case 'false':
      default:
        return false;
    }
  }
}
