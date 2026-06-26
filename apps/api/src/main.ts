import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import * as cookieParser from 'cookie-parser';
import type { Request, Response, NextFunction } from 'express';
import { AppModule } from './app.module';

async function bootstrap() {
  const logger = new Logger('Bootstrap');
  const app = await NestFactory.create(AppModule, { rawBody: true });

  app.use(cookieParser());

  // Security hardening: hide framework banner and add baseline headers.
  // CSP is intentionally omitted here — it belongs on the frontend and a wrong
  // policy would break the Mercado Pago/Turnstile flows.
  app.getHttpAdapter().getInstance().disable('x-powered-by');
  app.use((_req: Request, res: Response, next: NextFunction) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    next();
  });

  // /health is accessible without the prefix for load balancer / uptime checks
  app.setGlobalPrefix('api/v1', { exclude: ['health'] });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );

  // FRONTEND_URL supports comma-separated origins, e.g.:
  // https://app.vercel.app,https://staging.vercel.app,http://localhost:3000
  const allowedOrigins = (process.env.FRONTEND_URL || 'http://localhost:3000')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);

  app.enableCors({
    origin: allowedOrigins,
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
    credentials: true,
  });

  // Auditoria de configuração em produção. NÃO derruba o boot (para não quebrar
  // a produção), apenas alerta sobre segredos ausentes/inseguros que reduzem a
  // postura de segurança.
  if (process.env.NODE_ENV === 'production') {
    const warnCfg = (msg: string) => logger.warn(`[CONFIG] ${msg}`);
    if (!process.env.MERCADO_PAGO_WEBHOOK_SECRET) {
      warnCfg('MERCADO_PAGO_WEBHOOK_SECRET ausente — webhooks do MP sem validação de assinatura.');
    }
    if ((process.env.TURNSTILE_SECRET_KEY ?? 'skip') === 'skip') {
      warnCfg('TURNSTILE_SECRET_KEY=skip — proteção anti-bot desativada em login/registro.');
    }
    if ((process.env.MERCADO_PAGO_ACCESS_TOKEN ?? '').startsWith('TEST-')) {
      warnCfg('MERCADO_PAGO_ACCESS_TOKEN é credencial de TESTE (TEST-) em produção.');
    }
    for (const key of ['JWT_ACCESS_SECRET', 'JWT_REFRESH_SECRET']) {
      if ((process.env[key] ?? '').startsWith('CHANGE_ME')) {
        warnCfg(`${key} ainda usa o valor placeholder do .env.example — troque imediatamente.`);
      }
    }
  }

  const port = process.env.PORT || 3001;
  await app.listen(port);

  logger.log(`Application running on http://localhost:${port}/api/v1`);
}

bootstrap();
