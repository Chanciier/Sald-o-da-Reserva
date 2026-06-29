import { plainToInstance } from 'class-transformer';
import {
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUrl,
  MinLength,
  ValidateIf,
  validateSync,
} from 'class-validator';

enum Environment {
  Development = 'development',
  Production = 'production',
  Test = 'test',
}

class EnvironmentVariables {
  @IsEnum(Environment)
  @IsOptional()
  NODE_ENV: Environment = Environment.Development;

  @IsNumber()
  @IsOptional()
  PORT: number = 3001;

  @IsString()
  @IsNotEmpty()
  DATABASE_URL: string;

  @IsString()
  @IsNotEmpty()
  REDIS_URL: string;

  @IsString()
  @IsOptional()
  FRONTEND_URL: string = 'http://localhost:3000';

  @IsString()
  @MinLength(32)
  JWT_ACCESS_SECRET: string;

  @IsString()
  @MinLength(32)
  JWT_REFRESH_SECRET: string;

  @IsString()
  @IsOptional()
  TURNSTILE_SECRET_KEY: string = 'skip';

  @IsString()
  @IsOptional()
  MERCADO_PAGO_ACCESS_TOKEN: string = '';

  @IsString()
  @IsOptional()
  MERCADO_PAGO_WEBHOOK_SECRET: string = '';

  @IsString()
  @MinLength(40)
  @ValidateIf((_object, value) => value !== undefined && value !== '')
  VAPID_PUBLIC_KEY?: string;

  @IsString()
  @MinLength(40)
  @ValidateIf((_object, value) => value !== undefined && value !== '')
  VAPID_PRIVATE_KEY?: string;

  @IsString()
  @IsOptional()
  VAPID_SUBJECT?: string;

  @IsUrl({ require_tld: false })
  @IsOptional()
  API_PUBLIC_URL: string = 'http://localhost:3001';

  @IsString()
  @IsOptional()
  MELHOR_ENVIO_TOKEN: string = '';

  @IsString()
  @IsOptional()
  MELHOR_ENVIO_SANDBOX: string = 'true';

  @IsString()
  @IsOptional()
  MELHOR_ENVIO_WEBHOOK_TOKEN: string = '';

  @IsString()
  @IsOptional()
  MELHOR_ENVIO_FROM_NAME: string = '';

  @IsString()
  @IsOptional()
  MELHOR_ENVIO_FROM_EMAIL: string = '';

  @IsString()
  @IsOptional()
  MELHOR_ENVIO_FROM_DOCUMENT: string = '';

  @IsString()
  @IsOptional()
  MELHOR_ENVIO_FROM_PHONE: string = '';

  @IsString()
  @IsOptional()
  MELHOR_ENVIO_FROM_CEP: string = '';

  @IsString()
  @IsOptional()
  MELHOR_ENVIO_FROM_ADDRESS: string = '';

  @IsString()
  @IsOptional()
  MELHOR_ENVIO_FROM_NUMBER: string = '';

  @IsString()
  @IsOptional()
  MELHOR_ENVIO_FROM_COMPLEMENT: string = '';

  @IsString()
  @IsOptional()
  MELHOR_ENVIO_FROM_DISTRICT: string = '';

  @IsString()
  @IsOptional()
  MELHOR_ENVIO_FROM_CITY: string = '';

  @IsString()
  @IsOptional()
  MELHOR_ENVIO_FROM_STATE: string = '';

  @IsString()
  @IsOptional()
  ENOTAS_API_KEY: string = '';

  @IsString()
  @IsOptional()
  ENOTAS_COMPANY_ID: string = '';

  @IsString()
  @IsOptional()
  ENOTAS_ENVIRONMENT: string = 'sandbox';

  @IsString()
  @IsOptional()
  ENOTAS_WEBHOOK_SECRET: string = '';

  @IsString()
  @IsOptional()
  RESEND_API_KEY: string = '';

  @IsString()
  @IsOptional()
  RESEND_FROM_EMAIL: string = 'noreply@saldaodareserva.com.br';

  @IsString()
  @IsOptional()
  EVOLUTION_API_URL: string = '';

  @IsString()
  @IsOptional()
  EVOLUTION_API_KEY: string = '';

  @IsString()
  @IsOptional()
  EVOLUTION_INSTANCE: string = '';

  @IsString()
  @IsOptional()
  META_PIXEL_ID: string = '';

  @IsString()
  @IsOptional()
  META_CONVERSIONS_API_TOKEN: string = '';

  @IsString()
  @IsOptional()
  META_CATALOG_ID: string = '';

  @IsString()
  @IsOptional()
  META_CATALOG_ACCESS_TOKEN: string = '';
}

export function envValidation(config: Record<string, unknown>) {
  const validated = plainToInstance(EnvironmentVariables, config, {
    enableImplicitConversion: true,
  });

  const errors = validateSync(validated, { skipMissingProperties: false });

  if (errors.length > 0) {
    throw new Error(
      `Environment validation failed:\n${errors.map((e) => Object.values(e.constraints ?? {}).join(', ')).join('\n')}`,
    );
  }

  return validated;
}
