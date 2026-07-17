import { IsBoolean, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class UpdatePrintDeviceDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  pickupPrinter?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  shippingPrinter?: string;

  /** true revoga o dispositivo (revokedAt = now); false reativa (revokedAt = null). */
  @IsOptional()
  @IsBoolean()
  revoked?: boolean;
}
