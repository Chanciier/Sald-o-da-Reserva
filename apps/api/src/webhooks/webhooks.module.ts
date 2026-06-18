import { Module } from '@nestjs/common';
import { WebhooksController } from './webhooks.controller';
import { WebhooksService } from './webhooks.service';
import { PrismaModule } from '../prisma/prisma.module';
import { MercadoPagoModule } from '../mercadopago/mercadopago.module';
import { InvoiceModule } from '../invoices/invoice.module';
import { ShippingModule } from '../shipping/shipping.module';
import { AffiliateModule } from '../affiliates/affiliate.module';

@Module({
  imports: [PrismaModule, MercadoPagoModule, InvoiceModule, ShippingModule, AffiliateModule],
  controllers: [WebhooksController],
  providers: [WebhooksService],
})
export class WebhooksModule {}
