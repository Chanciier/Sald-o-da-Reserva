import {
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
  Validate,
  ValidationArguments,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';
import { Transform } from 'class-transformer';

@ValidatorConstraint({ name: 'atLeastOneSocial', async: false })
class AtLeastOneSocialConstraint implements ValidatorConstraintInterface {
  validate(_value: unknown, args?: ValidationArguments) {
    const o = (args?.object ?? {}) as Partial<ApplyAffiliateDto>;
    return Boolean(o.instagram?.trim() || o.facebook?.trim() || o.tiktok?.trim());
  }

  defaultMessage() {
    return 'Informe ao menos uma rede social (Instagram, Facebook ou TikTok).';
  }
}

export class ApplyAffiliateDto {
  @IsString()
  @MinLength(2)
  @MaxLength(150)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  fullName: string;

  @IsString()
  @Transform(({ value }) => (typeof value === 'string' ? value.replace(/\D/g, '') : value))
  @Matches(/^\d{11}$/, { message: 'CPF deve conter 11 dígitos numéricos.' })
  cpf: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  instagram?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  facebook?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @Validate(AtLeastOneSocialConstraint)
  tiktok?: string;
}
