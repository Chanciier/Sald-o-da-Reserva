import {
  IsInt,
  IsNotEmpty,
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

export class CreateOrderDto {
  @ValidateNested()
  @Type(() => ShippingAddressDto)
  shippingAddress: ShippingAddressDto;

  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  shippingMethod: string;

  @IsNumber()
  @Min(0)
  shippingPrice: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  meServiceId?: number;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  meCarrier?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  deliveryMin?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  deliveryMax?: number;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  couponCode?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}
