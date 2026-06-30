import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter } from 'events';
import type { OmsEvent, OmsEventPayloads } from './oms-events';

type Handler<E extends OmsEvent> = (payload: OmsEventPayloads[E]) => void | Promise<void>;

/**
 * Barramento de eventos interno do OMS.
 *
 * Implementado sobre o EventEmitter nativo do Node (zero dependências). A
 * emissão é assíncrona e isolada: handlers rodam fora da stack do emissor e
 * qualquer erro é capturado e logado — emitir um evento jamais derruba o fluxo
 * que o disparou (checkout, webhook de pagamento, etc.).
 *
 * A interface (emit/on tipados) é compatível com uma futura troca por
 * @nestjs/event-emitter ou um broker externo, sem alterar os call sites.
 */
@Injectable()
export class EventBusService {
  private readonly logger = new Logger(EventBusService.name);
  private readonly emitter = new EventEmitter();

  constructor() {
    // Vários módulos escutam o mesmo evento; evita o aviso de memory-leak.
    this.emitter.setMaxListeners(100);
  }

  /** Emite um evento. Retorna imediatamente; handlers rodam de forma assíncrona. */
  emit<E extends OmsEvent>(event: E, payload: OmsEventPayloads[E]): void {
    setImmediate(() => {
      try {
        this.emitter.emit(event, payload);
      } catch (err) {
        this.logger.error(`Falha ao emitir evento ${event}`, err as Error);
      }
    });
  }

  /** Registra um handler. Erros são capturados e nunca propagam para o emissor. */
  on<E extends OmsEvent>(event: E, handler: Handler<E>): void {
    this.emitter.on(event, (payload: OmsEventPayloads[E]) => {
      Promise.resolve()
        .then(() => handler(payload))
        .catch((err) => this.logger.error(`Handler do evento ${event} falhou`, err as Error));
    });
  }
}
