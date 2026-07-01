import { Controller, Get, Query } from '@nestjs/common';
import { Role } from '@prisma/client';
import { AnalyticsService } from './analytics.service';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

@Controller('analytics')
export class AnalyticsController {
  constructor(private readonly analyticsService: AnalyticsService) {}

  @Get('admin')
  @Roles(Role.ADMIN)
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
