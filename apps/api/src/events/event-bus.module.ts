import { Global, Module } from '@nestjs/common';
import { EventBusService } from './event-bus.service';

/**
 * Módulo global do barramento de eventos. Exposto globalmente para que qualquer
 * módulo possa injetar EventBusService sem criar dependências circulares.
 */
@Global()
@Module({
  providers: [EventBusService],
  exports: [EventBusService],
})
export class EventBusModule {}
