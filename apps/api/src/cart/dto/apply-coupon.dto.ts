import { IsString, IsNotEmpty } from 'class-validator';
import { Transform } from 'class-transformer';

export class ApplyCouponDto {
  @IsString()
  @IsNotEmpty()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toUpperCase() : value))
  code: string;
}
