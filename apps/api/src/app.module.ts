import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './prisma/prisma.module';
import { RedisModule } from './redis/redis.module';
import { AuthModule } from './auth/auth.module';
import { RbacModule } from './rbac/rbac.module';
import { CategoriesModule } from './categories/categories.module';
import { ProductsModule } from './products/products.module';
import { StorageModule } from './storage/storage.module';
import { CartModule } from './cart/cart.module';
import { CouponsModule } from './coupons/coupons.module';
import { CheckoutModule } from './checkout/checkout.module';
import { PaymentsModule } from './payments/payments.module';
import { MercadoPagoModule } from './mercadopago/mercadopago.module';
import { ShippingModule } from './shipping/shipping.module';
import { AnalyticsModule } from './analytics/analytics.module';
import { InvoiceModule } from './invoices/invoice.module';
import { WebhooksModule } from './webhooks/webhooks.module';
import { ExpedicaoModule } from './expedicao/expedicao.module';
import { ReturnsModule } from './returns/returns.module';
import { MailModule } from './mail/mail.module';
import { ContentModule } from './content/content.module';
import { ReviewsModule } from './reviews/reviews.module';
import { WhatsappModule } from './whatsapp/whatsapp.module';
import { CommunityModule } from './community/community.module';
import { NotificationsModule } from './notifications/notifications.module';
import { EventBusModule } from './events/event-bus.module';
import { QueueModule } from './queue/queue.module';
import { MarketplaceModule } from './marketplace/marketplace.module';
import { OmsModule } from './oms/oms.module';
import { VisionModule } from './vision/vision.module';
import { IdentificationModule } from './identification/identification.module';
import { MarketResearchModule } from './market-research/market-research.module';
import { PricingModule } from './pricing/pricing.module';
import { LearningModule } from './learning/learning.module';
import { VirtualEmployeeModule } from './virtual-employee/virtual-employee.module';
import { ScheduleModule } from '@nestjs/schedule';
import { JwtAuthGuard } from './auth/guards/jwt-auth.guard';
import { RolesGuard } from './rbac/guards/roles.guard';
import { PermissionsGuard } from './rbac/guards/permissions.guard';
import { ResourceOwnerGuard } from './rbac/guards/resource-owner.guard';
import { SellerPermissionsModule } from './seller-permissions/seller-permissions.module';
import { SectionAccessGuard } from './seller-permissions/guards/section-access.guard';
import { envValidation } from './config/env.validation';
import { RecipientProfilesModule } from './recipient-profiles/recipient-profiles.module';
import { FeatureFlagsModule } from './feature-flags/feature-flags.module';
import { PrintCenterModule } from './print-center/print-center.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: envValidation,
    }),
    ScheduleModule.forRoot(),
    ThrottlerModule.forRoot([
      { name: 'short', ttl: 1000, limit: 20 },
      { name: 'medium', ttl: 60000, limit: 300 },
    ]),
    PrismaModule,
    RedisModule,
    AuthModule,
    RbacModule,
    CategoriesModule,
    ProductsModule,
    StorageModule,
    CartModule,
    CouponsModule,
    CheckoutModule,
    PaymentsModule,
    MercadoPagoModule,
    ShippingModule,
    AnalyticsModule,
    InvoiceModule,
    WebhooksModule,
    ExpedicaoModule,
    ReturnsModule,
    MailModule,
    ContentModule,
    ReviewsModule,
    WhatsappModule,
    CommunityModule,
    NotificationsModule,
    EventBusModule,
    QueueModule,
    MarketplaceModule,
    OmsModule,
    VisionModule,
    IdentificationModule,
    MarketResearchModule,
    PricingModule,
    LearningModule,
    VirtualEmployeeModule,
    SellerPermissionsModule,
    FeatureFlagsModule,
    RecipientProfilesModule,
    PrintCenterModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    { provide: APP_GUARD, useClass: PermissionsGuard },
    { provide: APP_GUARD, useClass: ResourceOwnerGuard },
    { provide: APP_GUARD, useClass: SectionAccessGuard },
  ],
})
export class AppModule {}
