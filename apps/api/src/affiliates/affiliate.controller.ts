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
import { ApplicationStatus, CommissionStatus, Role, WithdrawalStatus } from '@prisma/client';
import { AffiliateService } from './affiliate.service';
import { UpdateAffiliateConfigDto } from './dto/update-config.dto';
import { ApplyAffiliateDto } from './dto/apply.dto';
import { UpdatePixDto } from './dto/update-pix.dto';
import { ReviewApplicationDto } from './dto/review-application.dto';
import { TrackAffiliateDto } from './dto/track.dto';
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

  @Post('me/apply')
  @HttpCode(HttpStatus.CREATED)
  apply(@CurrentUser('id') userId: string, @Body() dto: ApplyAffiliateDto) {
    return this.affiliates.apply(userId, dto);
  }

  @Put('me/pix')
  updatePix(@CurrentUser('id') userId: string, @Body() dto: UpdatePixDto) {
    return this.affiliates.updatePix(userId, dto);
  }

  @Post('me/withdraw')
  @HttpCode(HttpStatus.CREATED)
  withdraw(@CurrentUser('id') userId: string) {
    return this.affiliates.requestWithdrawal(userId);
  }

  // ── Atribuição ──────────────────────────────────────────────────────────────

  @Post('track')
  @HttpCode(HttpStatus.OK)
  track(@CurrentUser('id') userId: string, @Body() dto: TrackAffiliateDto) {
    return this.affiliates.track(userId, dto.code);
  }

  // ── Admin: afiliados / comissões ────────────────────────────────────────────

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

  // ── Admin: candidaturas ─────────────────────────────────────────────────────

  @Get('admin/applications')
  @Roles(Role.ADMIN)
  applications(@Query('status') status?: string) {
    const valid =
      status && (Object.values(ApplicationStatus) as string[]).includes(status)
        ? (status as ApplicationStatus)
        : undefined;
    return this.affiliates.listApplications(valid);
  }

  @Post('admin/applications/:id/approve')
  @Roles(Role.ADMIN)
  @HttpCode(HttpStatus.OK)
  approve(@Param('id') id: string) {
    return this.affiliates.approveApplication(id);
  }

  @Post('admin/applications/:id/reject')
  @Roles(Role.ADMIN)
  @HttpCode(HttpStatus.OK)
  reject(@Param('id') id: string, @Body() dto: ReviewApplicationDto) {
    return this.affiliates.rejectApplication(id, dto.note);
  }

  // ── Admin: saques ───────────────────────────────────────────────────────────

  @Get('admin/withdrawals')
  @Roles(Role.ADMIN)
  withdrawals(@Query('status') status?: string) {
    const valid =
      status && (Object.values(WithdrawalStatus) as string[]).includes(status)
        ? (status as WithdrawalStatus)
        : undefined;
    return this.affiliates.listWithdrawals(valid);
  }

  @Post('admin/withdrawals/:id/pay')
  @Roles(Role.ADMIN)
  @HttpCode(HttpStatus.OK)
  payWithdrawal(@Param('id') id: string) {
    return this.affiliates.payWithdrawal(id);
  }

  @Post('admin/withdrawals/:id/reject')
  @Roles(Role.ADMIN)
  @HttpCode(HttpStatus.OK)
  rejectWithdrawal(@Param('id') id: string, @Body() dto: ReviewApplicationDto) {
    return this.affiliates.rejectWithdrawal(id, dto.note);
  }

  // ── Admin: config ─────────────────────────────────────────────────────────────

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
