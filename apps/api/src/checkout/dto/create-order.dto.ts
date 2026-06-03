import {
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
  Length,
  Matches,
} from 'class-validator';
import { Type } from 'class-transformer';

export class ShippingAddressDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name: string;

  @IsString()
  @Matches(/^\d{5}-?\d{3}$/, { message: 'CEP inválido.' })
  cep: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  street: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(20)
  number: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  complement?: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  neighborhood: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  city: string;

  @IsString()
  @Length(2, 2)
  state: string;
}

export type ShippingMethod = 'PAC' | 'SEDEX' | 'FREE';

export class CreateOrderDto {
  @ValidateNested()
  @Type(() => ShippingAddressDto)
  shippingAddress: ShippingAddressDto;

  @IsEnum(['PAC', 'SEDEX', 'FREE'])
  shippingMethod: ShippingMethod;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  couponCode?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}
