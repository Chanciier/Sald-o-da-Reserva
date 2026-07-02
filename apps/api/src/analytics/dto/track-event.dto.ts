import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsEnum,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  Length,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { AnalyticsEventType, DeviceType } from '@prisma/client';

export class TrackEventItemDto {
  @IsEnum(AnalyticsEventType)
  type: AnalyticsEventType;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  path?: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  productId?: string;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}

// Payload de um "flush" do cliente: contexto da sessão (enviado em toda
// chamada, mas só usado na criação) + lote de eventos ocorridos desde o
// último flush. sessionId/visitorId são gerados no navegador.
export class TrackSessionDto {
  @IsString()
  @Length(10, 100)
  sessionId: string;

  @IsString()
  @Length(10, 100)
  visitorId: string;

  @IsOptional()
  @IsEnum(DeviceType)
  device?: DeviceType;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  browser?: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  os?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  referrer?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  utmSource?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  utmMedium?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  utmCampaign?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  landingPath?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(86400)
  durationSeconds?: number;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(25)
  @ValidateNested({ each: true })
  @Type(() => TrackEventItemDto)
  events?: TrackEventItemDto[];
}
