import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsEmail,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  Length,
  Matches,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export const MANUAL_PAYMENT_METHODS = [
  'PIX',
  'CREDIT_CARD',
  'DEBIT_CARD',
  'BOLETO',
  'CASH',
  'OTHER',
] as const;
export type ManualPaymentMethod = (typeof MANUAL_PAYMENT_METHODS)[number];

export class ManualInvoiceAddressDto {
  @Matches(/^\d{5}-?\d{3}$/, { message: 'CEP inválido.' })
  cep!: string;

  @IsString()
  @Length(1, 120)
  street!: string;

  @IsString()
  @Length(1, 20)
  number!: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  complement?: string;

  @IsString()
  @Length(1, 60)
  neighborhood!: string;

  @IsString()
  @Length(1, 60)
  city!: string;

  @Matches(/^[A-Za-z]{2}$/, { message: 'UF deve ter 2 letras.' })
  state!: string;
}

export class ManualInvoiceBuyerDto {
  @IsString()
  @Length(2, 120)
  name!: string;

  @IsString()
  @Matches(/^[\d.\-/\s]+$/, { message: 'CPF/CNPJ deve conter apenas números.' })
  document!: string;

  @IsOptional()
  @IsEmail({}, { message: 'E-mail inválido.' })
  email?: string;

  @ValidateNested()
  @Type(() => ManualInvoiceAddressDto)
  address!: ManualInvoiceAddressDto;
}

export class ManualInvoiceItemDto {
  @IsString()
  @Length(1, 120)
  description!: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  sku?: string;

  @IsOptional()
  @Matches(/^\d{4}\.?\d{2}\.?\d{2}$/, { message: 'NCM deve ter 8 dígitos.' })
  ncm?: string;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0.0001)
  quantity!: number;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  unitPrice!: number;
}

export class CreateManualInvoiceDto {
  @ValidateNested()
  @Type(() => ManualInvoiceBuyerDto)
  buyer!: ManualInvoiceBuyerDto;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => ManualInvoiceItemDto)
  items!: ManualInvoiceItemDto[];

  @IsIn(MANUAL_PAYMENT_METHODS)
  paymentMethod!: ManualPaymentMethod;

  @IsOptional()
  @IsBoolean()
  inPerson?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  additionalInfo?: string;
}
