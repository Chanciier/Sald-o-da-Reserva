import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { createHash } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';

interface DeviceRequest {
  headers: Record<string, string | string[] | undefined>;
  device?: { id: string; name: string };
}

/**
 * Autentica o Print Agent pelo header `X-Print-Device-Token` — nunca por JWT
 * de usuário nem login administrativo. O token é comparado pelo hash SHA-256
 * (mesmo padrão de "segredo estático hasheado" já usado para tokens de API);
 * nunca é logado ou persistido em texto puro.
 */
@Injectable()
export class DeviceTokenGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<DeviceRequest>();

    const header = req.headers['x-print-device-token'];
    const token = Array.isArray(header) ? header[0] : header;
    if (!token) throw new UnauthorizedException('Token do dispositivo ausente.');

    const tokenHash = createHash('sha256').update(token).digest('hex');
    const device = await this.prisma.printDevice.findUnique({ where: { tokenHash } });

    if (!device || device.revokedAt) {
      throw new UnauthorizedException('Token do dispositivo inválido ou revogado.');
    }

    req.device = { id: device.id, name: device.name };
    return true;
  }
}
