import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class CreatePrintDeviceDto {
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  name: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  pickupPrinter?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  shippingPrinter?: string;
}
