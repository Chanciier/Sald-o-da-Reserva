import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ShippingService } from './shipping.service';

@Injectable()
export class ShippingScheduler {
  private readonly logger = new Logger(ShippingScheduler.name);

  constructor(private readonly shipping: ShippingService) {}

  // A cada 30 min: sincroniza com o Melhor Envio todos os envios com etiqueta
  // gerada que ainda não foram entregues, para o rastreio avançar mesmo sem
  // webhook (postado → em trânsito → entregue).
  @Cron(CronExpression.EVERY_30_MINUTES)
  async syncActive() {
    try {
      const synced = await this.shipping.syncActiveShipments();
      if (synced) {
        this.logger.log(`Scheduler: ${synced} envio(s) sincronizado(s) com o Melhor Envio`);
      }
    } catch (err) {
      this.logger.warn('Scheduler: sincronização de envios falhou', err);
    }
  }
}
