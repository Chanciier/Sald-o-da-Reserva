import { ConflictException, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Prisma, WhatsappRelayRole } from '@prisma/client';
import type { WAMessage } from '@whiskeysockets/baileys';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { BaileysService } from './baileys.service';
import { describeRelayMessage } from './relay-message';

const ENABLED_KEY = 'wa:relay:enabled';
const SEEN_PREFIX = 'wa:relay:seen:';
const SEEN_TTL_SECONDS = 24 * 60 * 60;
/** Mensagem mais antiga que isso não é repassada (ex.: reentrega após reconexão). */
const MAX_AGE_MS = 10 * 60 * 1000;
/** Pausa entre um envio e outro — espaçar reduz o risco de bloqueio pelo WhatsApp. */
const SEND_DELAY_MS = 2_000;
const SEND_JITTER_MS = 1_000;

export interface RelayGroupInput {
  jid: string;
  name: string;
  role: WhatsappRelayRole;
  active?: boolean;
}

/**
 * Repasse automático de mensagens: tudo que o número da loja posta (inclusive
 * pelo celular) num grupo de lotes (SOURCE) é copiado, como mensagem nova, para
 * cada grupo de venda (TARGET) ativo — um grupo por vez, com uma pausa entre os
 * envios. Mensagens de outros participantes são ignoradas.
 *
 * As mensagens são processadas em fila, na ordem em que chegam, para que um
 * álbum de fotos + texto saia na mesma ordem nos grupos de venda.
 */
@Injectable()
export class WhatsappRelayService implements OnModuleInit {
  private readonly logger = new Logger(WhatsappRelayService.name);
  private chain: Promise<void> = Promise.resolve();

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly baileys: BaileysService,
  ) {}

  onModuleInit(): void {
    this.baileys.onGroupMessage((message) => this.enqueue(message));
  }

  enqueue(message: WAMessage): Promise<void> {
    this.chain = this.chain
      .then(() => this.handle(message))
      .catch((err) => this.logger.error('Falha no repasse de mensagem', err as Error));
    return this.chain;
  }

  async handle(message: WAMessage, now: number = Date.now()): Promise<void> {
    const sourceJid = message.key.remoteJid;
    const messageId = message.key.id;
    if (!message.key.fromMe || !sourceJid || !messageId) return;

    const sentAt = Number(message.messageTimestamp ?? 0) * 1000;
    if (!sentAt || now - sentAt > MAX_AGE_MS) return;

    const info = describeRelayMessage(message);
    if (!info) return;

    if (!(await this.isEnabled())) return;
    const source = await this.prisma.whatsappRelayGroup.findUnique({ where: { jid: sourceJid } });
    if (!source || !source.active || source.role !== WhatsappRelayRole.SOURCE) return;

    // O WhatsApp pode reentregar a mesma mensagem — repassa uma vez só.
    const firstTime =
      (await this.redis.increment(`${SEEN_PREFIX}${messageId}`, SEEN_TTL_SECONDS)) === 1;
    if (!firstTime) return;

    const targets = await this.prisma.whatsappRelayGroup.findMany({
      where: { role: WhatsappRelayRole.TARGET, active: true },
      orderBy: { name: 'asc' },
    });

    const copy: WAMessage = { ...message, message: info.content };
    for (const [index, target] of targets.entries()) {
      if (index > 0) await this.pause();
      let sentId: string | undefined;
      let error: string | null = null;
      try {
        sentId = await this.baileys.copyMessage(target.jid, copy);
      } catch (err) {
        error = (err as Error).message;
        this.logger.warn(`Repasse para ${target.name} falhou: ${error}`);
      }
      await this.prisma.whatsappRelayLog.create({
        data: {
          sourceJid,
          sourceName: source.name,
          sourceMessageId: messageId,
          targetJid: target.jid,
          targetName: target.name,
          kind: info.kind,
          preview: info.preview,
          success: !error,
          error,
          messageId: sentId ?? null,
        },
      });
    }
  }

  protected pause(): Promise<void> {
    const ms = SEND_DELAY_MS + Math.floor(Math.random() * SEND_JITTER_MS);
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  // ── Configuração (painel admin) ──────────────────────────────────────────

  async isEnabled(): Promise<boolean> {
    return (await this.redis.get(ENABLED_KEY)) === '1';
  }

  async getConfig() {
    const [enabled, groups] = await Promise.all([
      this.isEnabled(),
      this.prisma.whatsappRelayGroup.findMany({ orderBy: [{ role: 'asc' }, { name: 'asc' }] }),
    ]);
    return { enabled, groups };
  }

  async setEnabled(enabled: boolean) {
    if (enabled) await this.redis.set(ENABLED_KEY, '1');
    else await this.redis.del(ENABLED_KEY);
    return this.getConfig();
  }

  async addGroup(input: RelayGroupInput) {
    try {
      return await this.prisma.whatsappRelayGroup.create({ data: input });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new ConflictException('Esse grupo já está no repasse.');
      }
      throw err;
    }
  }

  updateGroup(id: string, data: Partial<Pick<RelayGroupInput, 'role' | 'active'>>) {
    return this.prisma.whatsappRelayGroup.update({ where: { id }, data });
  }

  async removeGroup(id: string): Promise<void> {
    await this.prisma.whatsappRelayGroup.delete({ where: { id } });
  }

  logs(limit = 100) {
    return this.prisma.whatsappRelayLog.findMany({ orderBy: { createdAt: 'desc' }, take: limit });
  }
}
