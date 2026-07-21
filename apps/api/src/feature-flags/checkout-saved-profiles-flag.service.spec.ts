import { ConfigService } from '@nestjs/config';
import { Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CheckoutSavedProfilesFlagService } from './checkout-saved-profiles-flag.service';

function makeService(env: Record<string, string>) {
  const config = {
    get: (key: string, def?: string) => env[key] ?? def,
  } as unknown as ConfigService;
  const prisma = { user: { findUnique: jest.fn() } };
  const service = new CheckoutSavedProfilesFlagService(config, prisma as unknown as PrismaService);
  return { service, prisma };
}

describe('CheckoutSavedProfilesFlagService', () => {
  it('defaults to disabled when the env var is unset', async () => {
    const { service } = makeService({});
    expect(service.stage()).toBe('false');
    expect(await service.isEnabledForUser('u1', Role.CLIENTE)).toBe(false);
  });

  it('"all" enables the feature for every role', async () => {
    const { service } = makeService({ CHECKOUT_SAVED_PROFILES_ENABLED: 'all' });
    expect(await service.isEnabledForUser('u1', Role.CLIENTE)).toBe(true);
    expect(await service.isEnabledForUser('u1', Role.ADMIN)).toBe(true);
  });

  it('"admins" only enables the feature for ADMIN', async () => {
    const { service } = makeService({ CHECKOUT_SAVED_PROFILES_ENABLED: 'admins' });
    expect(await service.isEnabledForUser('u1', Role.CLIENTE)).toBe(false);
    expect(await service.isEnabledForUser('u1', Role.ADMIN)).toBe(true);
  });

  it('"beta" enables for ADMIN and for CLIENTE with isBetaTester=true', async () => {
    const { service, prisma } = makeService({ CHECKOUT_SAVED_PROFILES_ENABLED: 'beta' });

    prisma.user.findUnique.mockResolvedValue({ isBetaTester: false });
    expect(await service.isEnabledForUser('u1', Role.CLIENTE)).toBe(false);

    prisma.user.findUnique.mockResolvedValue({ isBetaTester: true });
    expect(await service.isEnabledForUser('u1', Role.CLIENTE)).toBe(true);

    expect(await service.isEnabledForUser('u2', Role.ADMIN)).toBe(true);
  });

  it('"dev" enables outside production only', async () => {
    const { service: devService } = makeService({
      CHECKOUT_SAVED_PROFILES_ENABLED: 'dev',
      NODE_ENV: 'development',
    });
    expect(await devService.isEnabledForUser('u1', Role.CLIENTE)).toBe(true);

    const { service: prodService } = makeService({
      CHECKOUT_SAVED_PROFILES_ENABLED: 'dev',
      NODE_ENV: 'production',
    });
    expect(await prodService.isEnabledForUser('u1', Role.CLIENTE)).toBe(false);
  });
});
