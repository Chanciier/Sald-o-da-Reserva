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

export class CreateRecipientProfileDto {
  @IsString()
  @MaxLength(60)
  label: string;

  @IsString()
  @MaxLength(150)
  name: string;

  @IsOptional()
  @IsEnum(DocumentType)
  documentType?: DocumentType;

  // Somente dígitos. O tamanho exato (11 para CPF, 14 para CNPJ) é validado no
  // service, cruzando com `documentType` — evita duplicar a regra em decorators.
  @IsString()
  @Matches(/^\d{11}$|^\d{14}$/, {
    message: 'Documento deve conter 11 (CPF) ou 14 (CNPJ) dígitos numéricos.',
  })
  document: string;

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
