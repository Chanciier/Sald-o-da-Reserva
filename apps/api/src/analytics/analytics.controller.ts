import { Controller, Get } from '@nestjs/common';
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

  @Get('seller')
  @Roles(Role.ADMIN, Role.VENDEDOR)
  getSellerOverview(@CurrentUser('id') userId: string) {
    return this.analyticsService.getSellerOverview(userId);
  }

  @Get('customer')
  getCustomerOverview(@CurrentUser('id') userId: string) {
    return this.analyticsService.getCustomerOverview(userId);
  }
}
