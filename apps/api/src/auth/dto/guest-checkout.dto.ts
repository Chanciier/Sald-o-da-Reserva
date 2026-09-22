import { IsNotEmpty, IsOptional, IsString, Matches, MaxLength } from 'class-validator';
import { Transform } from 'class-transformer';

export class GuestCheckoutDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  name: string;

  // Mesmo padrão de customerPhone em checkout/dto/create-order.dto.ts: só
  // dígitos, DDD + número (10 ou 11).
  @IsString()
  @Matches(/^\d{10,11}$/, {
    message: 'Telefone deve conter DDD + número (10 ou 11 dígitos).',
  })
  phone: string;

  @IsString()
  @Matches(/^\d{11}$/, { message: 'CPF deve conter 11 dígitos numéricos.' })
  cpf: string;

  @IsOptional()
  @IsString()
  turnstileToken?: string;
}
