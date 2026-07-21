import {
  IsBoolean,
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';
import { DocumentType } from '@prisma/client';

// @nestjs/mapped-types não está instalado neste projeto (mesma convenção de
// UpdateCouponDto) — campos redeclarados manualmente, todos opcionais.
export class UpdateRecipientProfileDto {
  @IsOptional()
  @IsString()
  @MaxLength(60)
  label?: string;

  @IsOptional()
  @IsString()
  @MaxLength(150)
  name?: string;

  @IsOptional()
  @IsEnum(DocumentType)
  documentType?: DocumentType;

  @IsOptional()
  @IsString()
  @Matches(/^\d{11}$|^\d{14}$/, {
    message: 'Documento deve conter 11 (CPF) ou 14 (CNPJ) dígitos numéricos.',
  })
  document?: string;

  @IsOptional()
  @IsString()
  @Matches(/^\d{10,11}$/, { message: 'Telefone deve conter DDD + número (10 ou 11 dígitos).' })
  phone?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;
}
