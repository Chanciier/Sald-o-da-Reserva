import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class MercadoPagoService {
  private readonly logger = new Logger(MercadoPagoService.name);
  private readonly accessToken: string;

  constructor(private readonly config: ConfigService) {
    this.accessToken = this.config.get<string>('MERCADO_PAGO_ACCESS_TOKEN', '');
    if (!this.accessToken) {
      this.logger.warn('MERCADO_PAGO_ACCESS_TOKEN não configurado.');
    }
  }
}
