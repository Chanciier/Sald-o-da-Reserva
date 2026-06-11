import { plainToInstance } from 'class-transformer';
import {
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUrl,
  MinLength,
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

  @IsUrl({ require_tld: false })
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

  @IsUrl({ require_tld: false })
  @IsOptional()
  API_PUBLIC_URL: string = 'http://localhost:3001';

  // legado - removido
  // MELHOR_ENVIO_TOKEN
  // MELHOR_ENVIO_SANDBOX
  // MELHOR_ENVIO_WEBHOOK_TOKEN
  // MELHOR_ENVIO_FROM_NAME
  // MELHOR_ENVIO_FROM_EMAIL
  // MELHOR_ENVIO_FROM_DOCUMENT
  // MELHOR_ENVIO_FROM_PHONE
  // MELHOR_ENVIO_FROM_CEP
  // MELHOR_ENVIO_FROM_ADDRESS
  // MELHOR_ENVIO_FROM_NUMBER
  // MELHOR_ENVIO_FROM_COMPLEMENT
  // MELHOR_ENVIO_FROM_DISTRICT
  // MELHOR_ENVIO_FROM_CITY
  // MELHOR_ENVIO_FROM_STATE

  @IsString()
  @IsOptional()
  FRENET_TOKEN: string = '';

  @IsString()
  @IsOptional()
  FRENET_SELLER_CEP: string = '';

  @IsString()
  @IsOptional()
  FRENET_SENDER_NAME: string = '';

  @IsString()
  @IsOptional()
  FRENET_SENDER_CPF_CNPJ: string = '';

  @IsString()
  @IsOptional()
  FRENET_SENDER_EMAIL: string = '';

  @IsString()
  @IsOptional()
  FRENET_SENDER_PHONE: string = '';

  @IsString()
  @IsOptional()
  FRENET_SENDER_ADDRESS: string = '';

  @IsString()
  @IsOptional()
  FRENET_SENDER_NUMBER: string = '';

  @IsString()
  @IsOptional()
  FRENET_SENDER_COMPLEMENT: string = '';

  @IsString()
  @IsOptional()
  FRENET_SENDER_DISTRICT: string = '';

  @IsString()
  @IsOptional()
  FRENET_SENDER_CITY: string = '';

  @IsString()
  @IsOptional()
  FRENET_SENDER_STATE: string = '';

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
