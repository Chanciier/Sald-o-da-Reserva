import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { createHash, randomBytes, randomInt } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
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

// Sem 0/O/1/I — evita confusão quando o código é digitado à mão no primeiro acesso.
const PAIRING_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const PAIRING_CODE_LENGTH = 8;
const PAIRING_CODE_TTL_SECONDS = 15 * 60;

/**
 * CRUD dos computadores autorizados a puxar jobs de impressão. Nunca usa
 * login administrativo nem JWT de usuário para o próprio device — só o token
 * gerado aqui (hash SHA-256 persistido; o valor em texto puro é devolvido
 * apenas uma vez, na criação/regeneração).
 */
@Injectable()
export class PrintDevicesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

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

  /** Marca online/offline sem tocar `lastSeen` (usado pelo WS gateway ao conectar/desconectar). */
  async setOnline(id: string, online: boolean): Promise<void> {
    await this.prisma.printDevice.update({ where: { id }, data: { online } });
  }

  // ── Pareamento (primeiro acesso do Print Agent) ────────────────────────
  // Fluxo "código temporário → token": o admin gera um código de 8
  // caracteres (TTL 15min, uso único, guardado no Redis — mesmo padrão de
  // idempotência via chave que o resto do projeto já usa). O app desktop
  // troca esse código pelo token real em `redeemPairingCode`. Isso é
  // paralelo à criação normal de device (`create`, acima) — nada nela muda.

  async createPairingCode(id: string): Promise<{ code: string; expiresAt: string }> {
    await this.assertExists(id);
    const code = this.generatePairingCode();
    await this.redis.set(this.pairingKey(code), id, PAIRING_CODE_TTL_SECONDS);
    return {
      code,
      expiresAt: new Date(Date.now() + PAIRING_CODE_TTL_SECONDS * 1000).toISOString(),
    };
  }

  /** Troca o código por um token novo (rotaciona qualquer token anterior do device). Uso único. */
  async redeemPairingCode(code: string): Promise<{
    token: string;
    deviceId: string;
    deviceName: string;
    pickupPrinter: string | null;
    shippingPrinter: string | null;
  }> {
    const key = this.pairingKey(code);
    const deviceId = await this.redis.get(key);
    if (!deviceId) throw new BadRequestException('Código de pareamento inválido ou expirado.');
    await this.redis.del(key); // uso único — apagado antes de qualquer outra coisa

    const device = await this.prisma.printDevice.findUnique({ where: { id: deviceId } });
    if (!device || device.revokedAt) {
      throw new BadRequestException('Dispositivo não encontrado ou revogado.');
    }

    const { token, tokenHash } = this.generateToken();
    await this.prisma.printDevice.update({
      where: { id: deviceId },
      data: { tokenHash, online: true, lastSeen: new Date() },
    });

    return {
      token,
      deviceId: device.id,
      deviceName: device.name,
      pickupPrinter: device.pickupPrinter,
      shippingPrinter: device.shippingPrinter,
    };
  }

  private pairingKey(code: string): string {
    return `print:pairing:${code}`;
  }

  private generatePairingCode(): string {
    let code = '';
    for (let i = 0; i < PAIRING_CODE_LENGTH; i++) {
      code += PAIRING_CODE_ALPHABET[randomInt(PAIRING_CODE_ALPHABET.length)];
    }
    return code;
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
