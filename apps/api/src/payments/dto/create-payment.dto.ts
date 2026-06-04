import {
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { PaymentMethod } from '@prisma/client';

class PayerIdentificationDto {
  @IsEnum(['CPF', 'CNPJ'])
  type: 'CPF' | 'CNPJ';

  @IsString()
  @IsNotEmpty()
  number: string;
}

class PayerDto {
  @IsOptional()
  @ValidateNested()
  @Type(() => PayerIdentificationDto)
  identification?: PayerIdentificationDto;
}

export class CreatePaymentDto {
  @IsEnum(PaymentMethod)
  method: PaymentMethod;

  @IsOptional()
  @IsString()
  cardToken?: string;

  @IsOptional()
  @IsString()
  paymentMethodId?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(12)
  installments?: number;

  @IsOptional()
  @IsString()
  boletoMethod?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => PayerDto)
  payer?: PayerDto;
}
