import { IsEmail, IsOptional, IsString, IsStrongPassword, MaxLength } from 'class-validator';
import { Transform } from 'class-transformer';

export class RegisterDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  name?: string;

  @IsEmail({}, { message: 'Email inválido.' })
  @Transform(({ value }) => (typeof value === 'string' ? value.toLowerCase().trim() : value))
  email: string;

  @IsStrongPassword(
    { minLength: 8, minLowercase: 1, minUppercase: 1, minNumbers: 1, minSymbols: 1 },
    { message: 'Senha deve ter ao menos 8 caracteres com maiúscula, minúscula, número e símbolo.' },
  )
  password: string;

  @IsOptional()
  @IsString()
  turnstileToken?: string;
}
