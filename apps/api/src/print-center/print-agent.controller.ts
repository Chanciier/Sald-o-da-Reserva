import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { PrintJobType } from '@prisma/client';
import { Public } from '../auth/decorators/public.decorator';
import { DeviceTokenGuard } from './guards/device-token.guard';
import { CurrentDevice } from './decorators/current-device.decorator';
import { PrintJobsService } from './print-jobs.service';
import { PrintDevicesService } from './print-devices.service';
import { UpdatePrintJobStatusDto } from './dto/update-print-job-status.dto';

/**
 * API consumida pelo Print Agent (computador da loja). Autenticada só pelo
 * Device Token (`DeviceTokenGuard`) — `@Public()` a mantém fora do
 * JwtAuthGuard/RolesGuard globais, que exigem login administrativo.
 */
@Controller('print-agent')
@Public()
@UseGuards(DeviceTokenGuard)
export class PrintAgentController {
  constructor(
    private readonly printJobs: PrintJobsService,
    private readonly devices: PrintDevicesService,
  ) {}

  @Get('jobs')
  listClaimable(@Query('type') type?: PrintJobType) {
    return this.printJobs.listClaimable(type);
  }

  @Post('jobs/:id/claim')
  claim(@Param('id') id: string, @CurrentDevice('id') deviceId: string) {
    return this.printJobs.claim(id, deviceId);
  }

  @Patch('jobs/:id/status')
  updateStatus(
    @Param('id') id: string,
    @CurrentDevice('id') deviceId: string,
    @Body() dto: UpdatePrintJobStatusDto,
  ) {
    return this.printJobs.updateStatus(id, deviceId, dto.status, dto.error);
  }

  @Post('heartbeat')
  heartbeat(@CurrentDevice('id') deviceId: string) {
    return this.devices.heartbeat(deviceId);
  }
}
