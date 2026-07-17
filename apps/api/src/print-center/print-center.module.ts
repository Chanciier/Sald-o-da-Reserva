import { Module } from '@nestjs/common';
import { PrintCenterService } from './print-center.service';
import { PickupLabelService } from './pickup-label.service';
import { QrCodeService } from './qr-code.service';
import { ShippingPrintService } from './shipping-print.service';
import { PrintStorageService } from './print-storage.service';
import { PrintJobsService } from './print-jobs.service';
import { PrintDevicesService } from './print-devices.service';
import { PrintJobsController } from './print-jobs.controller';
import { PrintDevicesController } from './print-devices.controller';
import { PrintAgentController } from './print-agent.controller';
import { DeviceTokenGuard } from './guards/device-token.guard';

/**
 * Print Center: consumidor de eventos (order.paid / order.cancelled) que
 * prepara documentos de impressão e os enfileira para um Print Agent
 * autenticado por Device Token. Prisma/EventBus/Queue/Notifications/Redis já
 * são módulos globais — nada precisa ser importado aqui.
 */
@Module({
  controllers: [PrintJobsController, PrintDevicesController, PrintAgentController],
  providers: [
    PrintCenterService,
    PickupLabelService,
    QrCodeService,
    ShippingPrintService,
    PrintStorageService,
    PrintJobsService,
    PrintDevicesService,
    DeviceTokenGuard,
  ],
})
export class PrintCenterModule {}
