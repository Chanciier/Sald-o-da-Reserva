import { Global, Module } from '@nestjs/common';
import { QueueService } from './queue.service';

/**
 * Fila leve do OMS. Global para que produtores (products, webhooks) e
 * consumidores (marketplace hub, orchestrator) compartilhem a mesma instância.
 * Depende de RedisModule e ScheduleModule, ambos já globais/registrados.
 */
@Global()
@Module({
  providers: [QueueService],
  exports: [QueueService],
})
export class QueueModule {}
