import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { Public } from '../auth/decorators/public.decorator';
import { PrintDevicesService } from './print-devices.service';
import { PairDeviceDto } from './dto/pair-device.dto';

/**
 * Controller separado (mesmo prefixo `print-agent`, sem `DeviceTokenGuard`)
 * porque este é o único momento em que o Print Agent ainda não tem token —
 * é assim que ele ganha um. `PrintAgentController` continua exigindo o
 * device token em todas as outras rotas.
 */
@Controller('print-agent')
@Public()
export class PrintAgentPairingController {
  constructor(private readonly devices: PrintDevicesService) {}

  @Post('pair')
  @HttpCode(HttpStatus.OK)
  pair(@Body() dto: PairDeviceDto) {
    return this.devices.redeemPairingCode(dto.code);
  }
}
