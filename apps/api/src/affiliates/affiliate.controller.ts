import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { CommissionStatus, Role } from '@prisma/client';
import { AffiliateService } from './affiliate.service';
import { UpdateAffiliateConfigDto } from './dto/update-config.dto';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';

@Controller('affiliates')
export class AffiliateController {
  constructor(private readonly affiliates: AffiliateService) {}

  // ── Afiliado (usuário autenticado) ─────────────────────────────────────────

  @Get('me')
  getMine(@CurrentUser('id') userId: string) {
    return this.affiliates.getMyDashboard(userId);
  }

  @Post('me/activate')
  @HttpCode(HttpStatus.OK)
  activate(@CurrentUser('id') userId: string) {
    return this.affiliates.activate(userId);
  }

  // ── Admin ───────────────────────────────────────────────────────────────────

  @Get('admin/list')
  @Roles(Role.ADMIN)
  list() {
    return this.affiliates.listAffiliates();
  }

  @Get('admin/commissions')
  @Roles(Role.ADMIN)
  commissions(@Query('status') status?: string) {
    const valid =
      status && (Object.values(CommissionStatus) as string[]).includes(status)
        ? (status as CommissionStatus)
        : undefined;
    return this.affiliates.listCommissions(valid);
  }

  @Post('admin/commissions/:id/pay')
  @Roles(Role.ADMIN)
  @HttpCode(HttpStatus.OK)
  pay(@Param('id') id: string) {
    return this.affiliates.payCommission(id);
  }

  @Get('admin/config')
  @Roles(Role.ADMIN)
  getConfig() {
    return this.affiliates.getPublicConfig();
  }

  @Put('admin/config')
  @Roles(Role.ADMIN)
  updateConfig(@Body() dto: UpdateAffiliateConfigDto) {
    return this.affiliates.updateConfig(dto);
  }
}
