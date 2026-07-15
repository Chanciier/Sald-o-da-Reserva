import { Module } from '@nestjs/common';
import { AnalyticsController } from './analytics.controller';
import { AnalyticsService } from './analytics.service';
import { ReportsService } from './reports.service';
import { TrackingService } from './tracking.service';
import { BehaviorService } from './behavior.service';
import { StockReportService } from './stock-report.service';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [AnalyticsController],
  providers: [
    AnalyticsService,
    ReportsService,
    TrackingService,
    BehaviorService,
    StockReportService,
  ],
})
export class AnalyticsModule {}
