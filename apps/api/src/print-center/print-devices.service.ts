import { Injectable, NotFoundException } from '@nestjs/common';
import { createHash, randomBytes } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { CreatePrintDeviceDto } from './dto/create-print-device.dto';
import { UpdatePrintDeviceDto } from './dto/update-print-device.dto';

const DEVICE_LIST_SELECT = {
  id: true,
  name: true,
  online: true,
  lastSeen: true,
  pickupPrinter: true,
  shippingPrinter: true,
  revokedAt: true,
  createdAt: true,
} as const;

/**
 * CRUD dos computadores autorizados a puxar jobs de impressão. Nunca usa
 * login administrativo nem JWT de usuário para o próprio device — só o token
 * gerado aqui (hash SHA-256 persistido; o valor em texto puro é devolvido
 * apenas uma vez, na criação/regeneração).
 */
@Injectable()
export class PrintDevicesService {
  constructor(private readonly prisma: PrismaService) {}

  list() {
    return this.prisma.printDevice.findMany({
      orderBy: { createdAt: 'desc' },
      select: DEVICE_LIST_SELECT,
    });
  }

  async create(dto: CreatePrintDeviceDto) {
    const { token, tokenHash } = this.generateToken();
    const device = await this.prisma.printDevice.create({
      data: {
        name: dto.name,
        tokenHash,
        pickupPrinter: dto.pickupPrinter,
        shippingPrinter: dto.shippingPrinter,
      },
      select: DEVICE_LIST_SELECT,
    });
    return { ...device, token };
  }

  async update(id: string, dto: UpdatePrintDeviceDto) {
    await this.assertExists(id);
    return this.prisma.printDevice.update({
      where: { id },
      data: {
        name: dto.name,
        pickupPrinter: dto.pickupPrinter,
        shippingPrinter: dto.shippingPrinter,
        revokedAt: dto.revoked === undefined ? undefined : dto.revoked ? new Date() : null,
      },
      select: DEVICE_LIST_SELECT,
    });
  }

  async regenerateToken(id: string) {
    await this.assertExists(id);
    const { token, tokenHash } = this.generateToken();
    await this.prisma.printDevice.update({ where: { id }, data: { tokenHash } });
    return { id, token };
  }

  async heartbeat(id: string): Promise<{ ok: true }> {
    await this.prisma.printDevice.update({
      where: { id },
      data: { online: true, lastSeen: new Date() },
    });
    return { ok: true };
  }

  private generateToken(): { token: string; tokenHash: string } {
    const token = randomBytes(24).toString('base64url');
    const tokenHash = createHash('sha256').update(token).digest('hex');
    return { token, tokenHash };
  }

  private async assertExists(id: string): Promise<void> {
    const exists = await this.prisma.printDevice.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!exists) throw new NotFoundException('Dispositivo não encontrado.');
  }
}
