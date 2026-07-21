import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { Role } from '@prisma/client';
import { Roles } from '../auth/decorators/roles.decorator';
import { PrintDevicesService } from './print-devices.service';
import { CreatePrintDeviceDto } from './dto/create-print-device.dto';
import { UpdatePrintDeviceDto } from './dto/update-print-device.dto';

@Controller('print-center/devices')
@Roles(Role.ADMIN)
export class PrintDevicesController {
  constructor(private readonly devices: PrintDevicesService) {}

  @Get()
  list() {
    return this.devices.list();
  }

  @Post()
  create(@Body() dto: CreatePrintDeviceDto) {
    return this.devices.create(dto);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdatePrintDeviceDto) {
    return this.devices.update(id, dto);
  }

  @Post(':id/regenerate-token')
  regenerateToken(@Param('id') id: string) {
    return this.devices.regenerateToken(id);
  }

  @Post(':id/pairing-code')
  createPairingCode(@Param('id') id: string) {
    return this.devices.createPairingCode(id);
  }
}
