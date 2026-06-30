import { Module } from '@nestjs/common';
import { WebhooksController } from './webhooks.controller';
import { WebhooksService } from './webhooks.service';
import { MarketplaceWebhooksService } from './marketplace-webhooks.service';
import { PrismaModule } from '../prisma/prisma.module';
import { MercadoPagoModule } from '../mercadopago/mercadopago.module';
import { InvoiceModule } from '../invoices/invoice.module';
import { ShippingModule } from '../shipping/shipping.module';
import { MetaModule } from '../meta/meta.module';
import { StockModule } from '../stock/stock.module';
import { MarketplaceModule } from '../marketplace/marketplace.module';

@Module({
  imports: [
    PrismaModule,
    MercadoPagoModule,
    InvoiceModule,
    ShippingModule,
    MetaModule,
    StockModule,
    MarketplaceModule,
  ],
  controllers: [WebhooksController],
  providers: [WebhooksService, MarketplaceWebhooksService],
})
export class WebhooksModule {}
