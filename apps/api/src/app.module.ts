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
import { ScheduleModule } from '@nestjs/schedule';
import { JwtAuthGuard } from './auth/guards/jwt-auth.guard';
import { RolesGuard } from './rbac/guards/roles.guard';
import { PermissionsGuard } from './rbac/guards/permissions.guard';
import { ResourceOwnerGuard } from './rbac/guards/resource-owner.guard';
import { envValidation } from './config/env.validation';

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
  ],
  controllers: [AppController],
  providers: [
    AppService,
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    { provide: APP_GUARD, useClass: PermissionsGuard },
    { provide: APP_GUARD, useClass: ResourceOwnerGuard },
  ],
})
export class AppModule {}
