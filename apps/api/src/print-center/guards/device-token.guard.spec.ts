import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { createHash } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { DeviceTokenGuard } from './device-token.guard';

function contextWithHeaders(headers: Record<string, string | undefined>): ExecutionContext {
  const req: Record<string, unknown> = { headers };
  return {
    switchToHttp: () => ({ getRequest: () => req }),
  } as unknown as ExecutionContext;
}

describe('DeviceTokenGuard', () => {
  let guard: DeviceTokenGuard;
  let prisma: { printDevice: { findUnique: jest.Mock } };

  beforeEach(() => {
    prisma = { printDevice: { findUnique: jest.fn() } };
    guard = new DeviceTokenGuard(prisma as unknown as PrismaService);
  });

  it('sem header X-Print-Device-Token: rejeita', async () => {
    const ctx = contextWithHeaders({});
    await expect(guard.canActivate(ctx)).rejects.toThrow(UnauthorizedException);
    expect(prisma.printDevice.findUnique).not.toHaveBeenCalled();
  });

  it('token que não bate com nenhum hash: rejeita', async () => {
    prisma.printDevice.findUnique.mockResolvedValue(null);
    const ctx = contextWithHeaders({ 'x-print-device-token': 'token-invalido' });

    await expect(guard.canActivate(ctx)).rejects.toThrow(UnauthorizedException);
  });

  it('device revogado: rejeita mesmo com hash correto', async () => {
    prisma.printDevice.findUnique.mockResolvedValue({
      id: 'device-1',
      name: 'PDV 1',
      revokedAt: new Date(),
    });
    const ctx = contextWithHeaders({ 'x-print-device-token': 'token-valido' });

    await expect(guard.canActivate(ctx)).rejects.toThrow(UnauthorizedException);
  });

  it('token válido e ativo: autentica e anexa o device na request', async () => {
    const token = 'token-valido';
    const tokenHash = createHash('sha256').update(token).digest('hex');
    prisma.printDevice.findUnique.mockResolvedValue({
      id: 'device-1',
      name: 'PDV 1',
      revokedAt: null,
    });

    const req: Record<string, unknown> = { headers: { 'x-print-device-token': token } };
    const ctx = {
      switchToHttp: () => ({ getRequest: () => req }),
    } as unknown as ExecutionContext;

    const result = await guard.canActivate(ctx);

    expect(result).toBe(true);
    expect(prisma.printDevice.findUnique).toHaveBeenCalledWith({ where: { tokenHash } });
    expect(req.device).toEqual({ id: 'device-1', name: 'PDV 1' });
  });
});
