import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Put,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { Roles } from '../auth/decorators/roles.decorator';
import { WhatsappRelayService } from './whatsapp-relay.service';
import { CreateRelayGroupDto, SetRelayEnabledDto, UpdateRelayGroupDto } from './dto/relay.dto';

// Repasse automático: grupos de lotes (origem) → grupos de venda (destino).
@Controller('whatsapp/relay')
@Roles(Role.ADMIN)
export class WhatsappRelayController {
  constructor(private readonly relay: WhatsappRelayService) {}

  @Get()
  getConfig() {
    return this.relay.getConfig();
  }

  @Put('enabled')
  setEnabled(@Body() dto: SetRelayEnabledDto) {
    return this.relay.setEnabled(dto.enabled);
  }

  @Post('groups')
  @HttpCode(HttpStatus.CREATED)
  addGroup(@Body() dto: CreateRelayGroupDto) {
    return this.relay.addGroup(dto);
  }

  @Patch('groups/:id')
  updateGroup(@Param('id') id: string, @Body() dto: UpdateRelayGroupDto) {
    return this.relay.updateGroup(id, dto);
  }

  @Delete('groups/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  removeGroup(@Param('id') id: string) {
    return this.relay.removeGroup(id);
  }

  @Get('logs')
  logs() {
    return this.relay.logs();
  }
}
