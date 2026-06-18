import { IsIn, IsNotEmpty, IsString, MaxLength } from 'class-validator';
import { Transform } from 'class-transformer';

const PIX_KEY_TYPES = ['CPF', 'CNPJ', 'EMAIL', 'PHONE', 'RANDOM'] as const;

export class UpdatePixDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(140)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  pixKey: string;

  @IsString()
  @IsIn(PIX_KEY_TYPES)
  pixKeyType: (typeof PIX_KEY_TYPES)[number];
}
