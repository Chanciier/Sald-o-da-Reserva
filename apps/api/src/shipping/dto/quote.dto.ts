import { IsNotEmpty, IsString, Matches } from 'class-validator';

export class QuoteDto {
  @IsString()
  @IsNotEmpty()
  @Matches(/^\d{5}-?\d{3}$/, { message: 'CEP inválido.' })
  cep: string;
}
