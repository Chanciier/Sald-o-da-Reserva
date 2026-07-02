import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { MailService } from './mail.service';

const STATE_KEY = 'mail:campaign:announcement';
const STATE_TTL = 30 * 24 * 60 * 60; // 30 dias
// Resend limita o plano padrão a 2 req/s — manda 2 por vez com 1s de intervalo
// pra não estourar o rate limit e inflar a contagem de falhas por 429.
const BATCH_SIZE = 2;
const BATCH_DELAY_MS = 1000;

export interface CampaignState {
  subject: string;
  message: string;
  running: boolean;
  total: number;
  sent: number;
  failed: number;
  startedAt: string;
  finishedAt: string | null;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

@Injectable()
export class MailCampaignService {
  private readonly logger = new Logger(MailCampaignService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly mail: MailService,
  ) {}

  async getStatus(): Promise<CampaignState | null> {
    return this.redis.getJson<CampaignState>(STATE_KEY);
  }

  async recipientCount(): Promise<number> {
    return this.prisma.user.count({ where: { role: Role.CLIENTE, isActive: true } });
  }

  async send(subject: string, message: string): Promise<CampaignState> {
    const existing = await this.getStatus();
    if (existing?.running) throw new BadRequestException('Este disparo já está em andamento.');

    const recipients = await this.prisma.user.findMany({
      where: { role: Role.CLIENTE, isActive: true },
      select: { email: true, name: true },
    });
    if (!recipients.length) throw new BadRequestException('Nenhum cliente ativo encontrado.');

    const state: CampaignState = {
      subject,
      message,
      running: true,
      total: recipients.length,
      sent: 0,
      failed: 0,
      startedAt: new Date().toISOString(),
      finishedAt: null,
    };
    await this.redis.setJson(STATE_KEY, state, STATE_TTL);

    // Fire-and-forget: o disparo roda em segundo plano, o admin acompanha via polling do status.
    void this.run(subject, message, recipients);

    return state;
  }

  private async run(
    subject: string,
    message: string,
    recipients: { email: string; name: string | null }[],
  ) {
    let sent = 0;
    let failed = 0;

    for (let i = 0; i < recipients.length; i += BATCH_SIZE) {
      const batch = recipients.slice(i, i + BATCH_SIZE);
      const results = await Promise.allSettled(
        batch.map((r) => this.mail.sendAnnouncementEmail(r.email, r.name, subject, message)),
      );
      for (const r of results) {
        if (r.status === 'fulfilled' && r.value) sent++;
        else failed++;
      }

      const state = await this.getStatus();
      if (state) {
        state.sent = sent;
        state.failed = failed;
        await this.redis.setJson(STATE_KEY, state, STATE_TTL);
      }

      if (i + BATCH_SIZE < recipients.length) await sleep(BATCH_DELAY_MS);
    }

    const state = await this.getStatus();
    if (state) {
      state.running = false;
      state.finishedAt = new Date().toISOString();
      await this.redis.setJson(STATE_KEY, state, STATE_TTL);
    }
    this.logger.log(`Campanha concluída: ${sent} enviados, ${failed} falharam`);
  }
}
