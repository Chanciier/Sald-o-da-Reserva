import { Controller, Get } from '@nestjs/common';
import { Role } from '@prisma/client';
import { Roles } from '../auth/decorators/roles.decorator';
import { OmsDashboardService } from './oms-dashboard.service';

/** Painel inicial do OMS. Restrito a equipe (ADMIN/VENDEDOR). */
@Controller('oms')
@Roles(Role.ADMIN, Role.VENDEDOR)
export class OmsController {
  constructor(private readonly dashboard: OmsDashboardService) {}

  @Get('dashboard')
  getDashboard() {
    return this.dashboard.summary();
  }
}
