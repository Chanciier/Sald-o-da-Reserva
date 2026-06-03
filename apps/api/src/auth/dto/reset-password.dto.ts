import { IsNotEmpty, IsString, IsStrongPassword } from 'class-validator';

export class ResetPasswordDto {
  @IsString()
  @IsNotEmpty({ message: 'Token é obrigatório.' })
  token: string;

  @IsStrongPassword(
    { minLength: 8, minLowercase: 1, minUppercase: 1, minNumbers: 1, minSymbols: 1 },
    { message: 'Senha deve ter ao menos 8 caracteres com maiúscula, minúscula, número e símbolo.' },
  )
  password: string;

  @IsString()
  @IsNotEmpty({ message: 'Confirmação de senha é obrigatória.' })
  confirmPassword: string;
}
