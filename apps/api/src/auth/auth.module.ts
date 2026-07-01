import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { HashService } from './services/hash.service';
import { TokenService } from './services/token.service';
import { RateLimitService } from './services/rate-limit.service';
import { TurnstileService } from './services/turnstile.service';
import { AuditService } from './services/audit.service';
import { MailService } from './services/mail.service';
import { JwtStrategy } from './strategies/jwt.strategy';
import { JwtRefreshStrategy } from './strategies/jwt-refresh.strategy';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { JwtRefreshGuard } from './guards/jwt-refresh.guard';
import { TurnstileGuard } from './guards/turnstile.guard';
import { StorageModule } from '../storage/storage.module';

@Module({
  imports: [
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        secret: configService.get<string>('JWT_ACCESS_SECRET'),
        signOptions: { expiresIn: '15m' },
      }),
    }),
    StorageModule,
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    HashService,
    TokenService,
    RateLimitService,
    TurnstileService,
    AuditService,
    MailService,
    JwtStrategy,
    JwtRefreshStrategy,
    JwtAuthGuard,
    JwtRefreshGuard,
    TurnstileGuard,
  ],
  exports: [JwtAuthGuard],
})
export class AuthModule {}
