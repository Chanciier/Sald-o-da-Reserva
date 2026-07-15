import { Body, Controller, Get, HttpCode, HttpStatus, Post, Query } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { AdminSection, Role } from '@prisma/client';
import { AnalyticsService } from './analytics.service';
import { Roles } from '../auth/decorators/roles.decorator';
import { Public } from '../auth/decorators/public.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { ReportsService } from './reports.service';
import { TrackingService } from './tracking.service';
import { BehaviorService } from './behavior.service';
import { StockReportService } from './stock-report.service';
import { TrackSessionDto } from './dto/track-event.dto';
import { RequireSection } from '../seller-permissions/decorators/require-section.decorator';

@Controller('analytics')
export class AnalyticsController {
  constructor(
    private readonly analyticsService: AnalyticsService,
    private readonly reportsService: ReportsService,
    private readonly trackingService: TrackingService,
    private readonly behaviorService: BehaviorService,
    private readonly stockReportService: StockReportService,
  ) {}

  // Ingestão de eventos de comportamento (cliques, page views, funil...).
  // Público e sem cookies de sessão — visitante anônimo identificado só pelo
  // sessionId/visitorId gerados no navegador. Throttle mais generoso que o
  // padrão pois o cliente agrupa vários eventos por flush.
  @Public()
  @Post('track')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Throttle({ medium: { limit: 60, ttl: 60_000 } })
  track(@Body() dto: TrackSessionDto) {
    return this.trackingService.ingest(dto);
  }

  @Get('behavior')
  @Roles(Role.ADMIN, Role.VENDEDOR)
  @RequireSection(AdminSection.RELATORIOS)
  getBehavior(@Query('from') from?: string, @Query('to') to?: string) {
    return this.behaviorService.overview(from, to);
  }

  @Get('reports')
  @Roles(Role.ADMIN, Role.VENDEDOR)
  @RequireSection(AdminSection.VENDAS, AdminSection.RELATORIOS)
  getReports(@Query('from') from?: string, @Query('to') to?: string) {
    return this.reportsService.overview(from, to);
  }

  @Get('estoque')
  @Roles(Role.ADMIN, Role.VENDEDOR)
  @RequireSection(AdminSection.PRODUTOS, AdminSection.RELATORIOS)
  getStockReport(@Query('from') from?: string, @Query('to') to?: string) {
    return this.stockReportService.overview(from, to);
  }

  @Get('admin')
  @Roles(Role.ADMIN, Role.VENDEDOR)
  @RequireSection(AdminSection.DASHBOARD)
  getAdminOverview() {
    return this.analyticsService.getAdminOverview();
  }

  @Get('marketing')
  @Roles(Role.ADMIN)
  getMarketingOverview(@Query('days') days?: string) {
    return this.analyticsService.getMarketingOverview(days ? parseInt(days, 10) : 30);
  }

  @Get('seller')
  @Roles(Role.ADMIN, Role.VENDEDOR)
  getSellerOverview(@CurrentUser('id') userId: string, @Query('days') days?: string) {
    const parsed = days ? parseInt(days, 10) : 30;
    return this.analyticsService.getSellerOverview(
      userId,
      Number.isFinite(parsed) && parsed > 0 ? parsed : 30,
    );
  }

  @Get('customer')
  getCustomerOverview(@CurrentUser('id') userId: string) {
    return this.analyticsService.getCustomerOverview(userId);
  }
}
