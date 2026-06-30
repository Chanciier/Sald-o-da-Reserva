import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { RedisService } from '../redis/redis.service';
import { WhatsappMarketingService } from './whatsapp-marketing.service';

const STATE_KEY = 'wa:broadcast:state';
const LOCK_PREFIX = 'wa:broadcast:lock:';
const STATE_TTL = 7 * 24 * 60 * 60;
const TIME_ZONE = 'America/Sao_Paulo';

export interface BroadcastDay {
  dayOfWeek: number;
  enabled: boolean;
  startTime: string;
  endTime: string;
  intervalMin: number;
}

export interface BroadcastState {
  running: boolean;
  startedAt: string;
  finishedAt: string | null;
  intervalMin: number;
  schedule: BroadcastDay[];
  total: number;
  sent: number;
  failed: number;
  remaining: number;
  queue: string[];
  nextAt: string | null;
  lastProductName: string | null;
  lastSentAt: string | null;
}

@Injectable()
export class WhatsappBroadcastService {
  private readonly logger = new Logger(WhatsappBroadcastService.name);

  constructor(
    private readonly redis: RedisService,
    private readonly marketing: WhatsappMarketingService,
  ) {}

  async getState(): Promise<BroadcastState | null> {
    const state = await this.redis.getJson<BroadcastState>(STATE_KEY);
    return state ? { ...state, remaining: state.queue.length } : null;
  }

  private shuffle(ids: string[]): string[] {
    const result = [...ids];
    for (let i = result.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [result[i], result[j]] = [result[j], result[i]];
    }
    return result;
  }

  private localParts(date: Date): { dayOfWeek: number; time: string } {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: TIME_ZONE,
      weekday: 'short',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(date);
    const value = (type: string) => parts.find((part) => part.type === type)?.value ?? '';
    const weekdays: Record<string, number> = {
      Sun: 0,
      Mon: 1,
      Tue: 2,
      Wed: 3,
      Thu: 4,
      Fri: 5,
      Sat: 6,
    };
    return { dayOfWeek: weekdays[value('weekday')], time: `${value('hour')}:${value('minute')}` };
  }

  private dayAt(date: Date, schedule: BroadcastDay[]): BroadcastDay | undefined {
    const local = this.localParts(date);
    return schedule.find(
      (day) =>
        day.enabled &&
        day.dayOfWeek === local.dayOfWeek &&
        local.time >= day.startTime &&
        local.time <= day.endTime,
    );
  }

  private scheduleOf(state: BroadcastState): BroadcastDay[] {
    if (state.schedule?.length) return state.schedule;
    return Array.from({ length: 7 }, (_, dayOfWeek) => ({
      dayOfWeek,
      enabled: true,
      startTime: '00:00',
      endTime: '23:59',
      intervalMin: state.intervalMin || 10,
    }));
  }

  private nextAllowed(from: Date, schedule: BroadcastDay[]): Date {
    const candidate = new Date(from);
    candidate.setSeconds(0, 0);
    for (let minute = 0; minute <= 8 * 24 * 60; minute++) {
      if (this.dayAt(candidate, schedule)) return candidate;
      candidate.setMinutes(candidate.getMinutes() + 1);
    }
    throw new BadRequestException('Não foi possível calcular o próximo horário da rotina.');
  }

  async start(schedule: BroadcastDay[]): Promise<BroadcastState> {
    if ((await this.getState())?.running)
      throw new BadRequestException('Já existe um disparo em andamento.');
    const enabledDays = schedule.filter((day) => day.enabled);
    if (!enabledDays.length) throw new BadRequestException('Selecione ao menos um dia de disparo.');
    if (new Set(schedule.map((day) => day.dayOfWeek)).size !== schedule.length) {
      throw new BadRequestException('Cada dia da semana deve aparecer apenas uma vez.');
    }
    if (enabledDays.some((day) => day.startTime >= day.endTime)) {
      throw new BadRequestException('O horário final deve ser posterior ao horário inicial.');
    }

    const ids = await this.marketing.getBroadcastProductIds();
    if (!ids.length)
      throw new BadRequestException('Nenhum produto ativo com estoque para disparar.');

    const queue = this.shuffle(ids);
    const now = new Date();
    const activeDay = this.dayAt(now, schedule);
    const firstId = activeDay ? queue.shift() : undefined;
    const first = firstId
      ? await this.marketing
          .broadcastSingleProduct(firstId)
          .catch(() => ({ ok: false, name: null as string | null }))
      : null;
    const done = !!first && queue.length === 0;
    const intervalMin = activeDay?.intervalMin ?? enabledDays[0].intervalMin;
    const nextFrom = new Date(now.getTime() + (first ? intervalMin : 0) * 60_000);
    const state: BroadcastState = {
      running: !done,
      startedAt: now.toISOString(),
      finishedAt: done ? now.toISOString() : null,
      intervalMin,
      schedule,
      total: ids.length,
      sent: first?.ok ? 1 : 0,
      failed: first && !first.ok ? 1 : 0,
      remaining: queue.length,
      queue,
      nextAt: done ? null : this.nextAllowed(nextFrom, schedule).toISOString(),
      lastProductName: first?.name ?? null,
      lastSentAt: first ? now.toISOString() : null,
    };
    await this.redis.setJson(STATE_KEY, state, STATE_TTL);
    this.logger.log(
      `Rotina iniciada: ${ids.length} produtos, ${enabledDays.length} dia(s) ativo(s)`,
    );
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
    return state;
  }

  @Cron(CronExpression.EVERY_MINUTE)
  async tick(): Promise<void> {
    const state = await this.redis.getJson<BroadcastState>(STATE_KEY);
    if (!state?.running || !state.nextAt || Date.now() < new Date(state.nextAt).getTime()) return;
    const owner = await this.redis.increment(`${LOCK_PREFIX}${state.nextAt}`, 5 * 60);
    if (owner !== 1) return;
    if (!state.queue.length) {
      state.running = false;
      state.finishedAt = new Date().toISOString();
      state.nextAt = null;
      await this.redis.setJson(STATE_KEY, state, STATE_TTL);
      return;
    }

    const result = await this.marketing
      .broadcastSingleProduct(state.queue.shift() as string)
      .catch(() => ({ ok: false, name: null as string | null }));
    result.ok ? state.sent++ : state.failed++;
    const now = new Date();
    state.lastProductName = result.name;
    state.lastSentAt = now.toISOString();
    if (state.queue.length) {
      state.schedule = this.scheduleOf(state);
      state.intervalMin = this.dayAt(now, state.schedule)?.intervalMin ?? state.intervalMin;
      state.nextAt = this.nextAllowed(
        new Date(now.getTime() + state.intervalMin * 60_000),
        state.schedule,
      ).toISOString();
    } else {
      state.running = false;
      state.finishedAt = now.toISOString();
      state.nextAt = null;
    }
    state.remaining = state.queue.length;
    await this.redis.setJson(STATE_KEY, state, STATE_TTL);
  }
}
