import { Module } from '@nestjs/common';
import { WhatsappAccessService } from './whatsapp-access.service';
import { WhatsappAccessAdminController } from './whatsapp-access-admin.controller';

/**
 * Consumidor de eventos (order.paid / order.cancelled) para produtos do tipo
 * WHATSAPP_ACCESS. Prisma/EventBus/Redis/Whatsapp já são módulos globais —
 * nada precisa ser importado aqui (mesmo padrão do PrintCenterModule).
 */
@Module({
  controllers: [WhatsappAccessAdminController],
  providers: [WhatsappAccessService],
})
export class WhatsappAccessModule {}
