import { Module } from '@nestjs/common';
import { MarketplaceModule } from '../marketplace/marketplace.module';
import { OmsController } from './oms.controller';
import { OmsDashboardService } from './oms-dashboard.service';
import { OrderOrchestratorService } from './order-orchestrator.service';

/**
 * Módulo central do OMS: orquestrador de pedidos (reage a eventos) e dashboard.
 * Depende de Marketplace (Hub); NotificationsModule/EventBus/Queue/Prisma são globais.
 */
@Module({
  imports: [MarketplaceModule],
  controllers: [OmsController],
  providers: [OrderOrchestratorService, OmsDashboardService],
})
export class OmsModule {}
