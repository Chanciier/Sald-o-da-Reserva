import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { RedisService } from '../redis/redis.service';
import { WhatsappMarketingService } from './whatsapp-marketing.service';

const STATE_KEY = 'wa:broadcast:state';
const LOCK_PREFIX = 'wa:broadcast:lock:';
const INTERVAL_MIN = 10; // 1 produto a cada 10 minutos
const STATE_TTL = 7 * 24 * 60 * 60; // mantém o estado por 7 dias

export interface BroadcastState {
  running: boolean;
  startedAt: string;
  finishedAt: string | null;
  intervalMin: number;
  total: number;
  sent: number;
  failed: number;
  remaining: number;
  queue: string[]; // produtos restantes, em ordem aleatória
  nextAt: string | null; // quando o próximo produto deve ser enviado
  lastProductName: string | null;
  lastSentAt: string | null;
}

/**
 * Dispara os produtos ativos para os grupos do WhatsApp de forma ESPAÇADA: um
 * produto a cada `INTERVAL_MIN` minutos, em ordem aleatória, sem repetir, até
 * completar o ciclo. O estado vive no Redis (sobrevive a redeploys) e um cron
 * de 1 minuto avança a fila quando chega a hora.
 */
@Injectable()
export class WhatsappBroadcastService {
  private readonly logger = new Logger(WhatsappBroadcastService.name);

  constructor(
    private readonly redis: RedisService,
    private readonly marketing: WhatsappMarketingService,
  ) {}

  async getState(): Promise<BroadcastState | null> {
    const s = await this.redis.getJson<BroadcastState>(STATE_KEY);
    if (!s) return null;
    return { ...s, remaining: s.queue.length };
  }

  private shuffle(ids: string[]): string[] {
    const a = [...ids];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  async start(): Promise<BroadcastState> {
    const current = await this.getState();
    if (current?.running) {
      throw new BadRequestException('Já existe um disparo em andamento.');
    }

    const ids = await this.marketing.getBroadcastProductIds();
    if (!ids.length) {
      throw new BadRequestException('Nenhum produto ativo com estoque para disparar.');
    }

    const queue = this.shuffle(ids);
    const now = new Date();

    // O primeiro produto vai imediatamente (feedback instantâneo); o restante é
    // espaçado em INTERVAL_MIN minutos pelo cron `tick`.
    const firstId = queue.shift() as string;
    const first = await this.marketing
      .broadcastSingleProduct(firstId)
      .catch(() => ({ ok: false, name: null as string | null }));

    const done = queue.length === 0;
    const state: BroadcastState = {
      running: !done,
      startedAt: now.toISOString(),
      finishedAt: done ? now.toISOString() : null,
      intervalMin: INTERVAL_MIN,
      total: ids.length,
      sent: first.ok ? 1 : 0,
      failed: first.ok ? 0 : 1,
      remaining: queue.length,
      queue,
      nextAt: done ? null : new Date(now.getTime() + INTERVAL_MIN * 60_000).toISOString(),
      lastProductName: first.name,
      lastSentAt: now.toISOString(),
    };

    await this.redis.setJson(STATE_KEY, state, STATE_TTL);
    this.logger.log(`Broadcast iniciado: ${ids.length} produtos, 1 a cada ${INTERVAL_MIN}min`);
    return state;
  }

  async cancel(): Promise<BroadcastState | null> {
    const state = await this.getState();
    if (!state) return null;
    state.running = false;
    state.finishedAt = new Date().toISOString();
    state.queue = [];
    state.remaining = 0;
    state.nextAt = null;
    await this.redis.setJson(STATE_KEY, state, STATE_TTL);
    this.logger.log('Broadcast cancelado manualmente.');
    return state;
  }

  @Cron(CronExpression.EVERY_MINUTE)
  async tick(): Promise<void> {
    const state = await this.redis.getJson<BroadcastState>(STATE_KEY);
    if (!state || !state.running || !state.nextAt) return;
    if (Date.now() < new Date(state.nextAt).getTime()) return;

    // Lock por "slot" (nextAt) — evita envio duplicado caso haja mais de uma
    // instância da API executando o cron simultaneamente.
    const owner = await this.redis.increment(`${LOCK_PREFIX}${state.nextAt}`, 5 * 60);
    if (owner !== 1) return;

    if (!state.queue.length) {
      state.running = false;
      state.finishedAt = new Date().toISOString();
      state.nextAt = null;
      await this.redis.setJson(STATE_KEY, state, STATE_TTL);
      return;
    }

    const productId = state.queue.shift() as string;
    const res = await this.marketing
      .broadcastSingleProduct(productId)
      .catch(() => ({ ok: false, name: null as string | null }));
    if (res.ok) state.sent++;
    else state.failed++;

    const now = new Date();
    state.lastProductName = res.name;
    state.lastSentAt = now.toISOString();
    if (state.queue.length) {
      state.nextAt = new Date(now.getTime() + state.intervalMin * 60_000).toISOString();
    } else {
      state.running = false;
      state.finishedAt = now.toISOString();
      state.nextAt = null;
    }
    state.remaining = state.queue.length;
    await this.redis.setJson(STATE_KEY, state, STATE_TTL);
    this.logger.log(`Broadcast: enviado=${res.ok} (${res.name}) — restam ${state.queue.length}`);
  }
}
