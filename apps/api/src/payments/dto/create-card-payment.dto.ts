import { IsInt, IsNotEmpty, IsOptional, IsString, Min } from 'class-validator';

export class CreateCardPaymentDto {
  @IsString()
  @IsNotEmpty()
  orderId: string;

  @IsString()
  @IsNotEmpty()
  token: string;

  @IsInt()
  @Min(1)
  installments: number;

  @IsString()
  @IsNotEmpty()
  paymentMethodId: string;

  @IsOptional()
  @IsString()
  issuerId?: string;

  @IsOptional()
  @IsString()
  identificationNumber?: string;
}
