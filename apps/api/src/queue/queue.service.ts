import { Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { randomUUID } from 'crypto';
import { RedisService } from '../redis/redis.service';
import { JobHandler, QueueHandlerOptions, QueueJob } from './queue.types';

interface Registration {
  handler: JobHandler;
  maxAttempts: number;
}

/**
 * Fila de jobs leve sobre Redis (LIST), sem dependências externas (BullMQ).
 *
 * - `enqueue` faz RPUSH do job serializado na lista da fila.
 * - Um worker periódico (@Interval) drena cada fila registrada, executando o
 *   handler correspondente.
 * - Falhas são re-enfileiradas (RPUSH na cauda) até `maxAttempts`; esgotadas,
 *   vão para a dead-letter `<fila>:dead` e são logadas.
 *
 * A interface (register/enqueue) é deliberadamente compatível com BullMQ para
 * permitir uma migração futura sem alterar os produtores/consumidores.
 */
@Injectable()
export class QueueService {
  private readonly logger = new Logger(QueueService.name);
  private readonly registrations = new Map<string, Registration>();
  private processing = false;

  private static readonly BATCH_PER_TICK = 25;
  private static readonly DEFAULT_MAX_ATTEMPTS = 5;

  constructor(private readonly redis: RedisService) {}

  /** Registra o consumidor de uma fila. Idempotente por nome. */
  register<T>(name: string, handler: JobHandler<T>, options: QueueHandlerOptions = {}): void {
    this.registrations.set(name, {
      handler: handler as JobHandler,
      maxAttempts: options.maxAttempts ?? QueueService.DEFAULT_MAX_ATTEMPTS,
    });
    this.logger.log(`Fila registrada: ${name}`);
  }

  /** Enfileira um job. Nunca lança — falha de enfileiramento só é logada. */
  async enqueue<T>(name: string, data: T): Promise<void> {
    const job: QueueJob<T> = {
      id: randomUUID(),
      name,
      data,
      attempts: 0,
      enqueuedAt: Date.now(),
    };
    try {
      await this.redis.rpush(this.key(name), JSON.stringify(job));
    } catch (err) {
      this.logger.error(`Falha ao enfileirar em ${name}`, err as Error);
    }
  }

  /** Tamanho atual de uma fila (para painéis de saúde). */
  count(name: string): Promise<number> {
    return this.redis.llen(this.key(name));
  }

  /** Tamanho da dead-letter de uma fila. */
  countDead(name: string): Promise<number> {
    return this.redis.llen(this.deadKey(name));
  }

  @Interval('oms-queue-worker', 2000)
  async tick(): Promise<void> {
    if (this.processing || this.registrations.size === 0) return;
    this.processing = true;
    try {
      for (const [name, reg] of this.registrations) {
        await this.drain(name, reg);
      }
    } finally {
      this.processing = false;
    }
  }

  private async drain(name: string, reg: Registration): Promise<void> {
    for (let i = 0; i < QueueService.BATCH_PER_TICK; i++) {
      const raw = await this.redis.lpop(this.key(name));
      if (!raw) break;

      let job: QueueJob;
      try {
        job = JSON.parse(raw) as QueueJob;
      } catch {
        this.logger.warn(`Job inválido descartado na fila ${name}`);
        continue;
      }

      try {
        await reg.handler(job.data);
      } catch (err) {
        await this.handleFailure(name, reg, job, err as Error);
      }
    }
  }

  private async handleFailure(
    name: string,
    reg: Registration,
    job: QueueJob,
    err: Error,
  ): Promise<void> {
    job.attempts += 1;
    if (job.attempts < reg.maxAttempts) {
      this.logger.warn(
        `Job ${name}#${job.id} falhou (tentativa ${job.attempts}/${reg.maxAttempts}): ${err.message}`,
      );
      await this.redis.rpush(this.key(name), JSON.stringify(job));
    } else {
      this.logger.error(`Job ${name}#${job.id} esgotou tentativas — enviado para dead-letter`, err);
      await this.redis.rpush(
        this.deadKey(name),
        JSON.stringify({ ...job, error: err.message, failedAt: Date.now() }),
      );
    }
  }

  private key(name: string): string {
    return `oms:queue:${name}`;
  }

  private deadKey(name: string): string {
    return `oms:queue:${name}:dead`;
  }
}
