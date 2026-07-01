import { IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';
import { Transform } from 'class-transformer';

export class UpdateMeDto {
  @IsOptional()
  @IsString()
  @MinLength(2, { message: 'Nome deve ter ao menos 2 caracteres.' })
  @MaxLength(100)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  name?: string;

  @IsOptional()
  @IsString()
  @Matches(/^(\d{10,11})?$/, {
    message: 'Telefone inválido. Use DDD + número (10 ou 11 dígitos).',
  })
  @Transform(({ value }) => (typeof value === 'string' ? value.replace(/\D/g, '') : value))
  phone?: string;
}
