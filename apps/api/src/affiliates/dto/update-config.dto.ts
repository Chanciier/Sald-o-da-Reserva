import { IsBoolean, IsInt, IsNumber, IsOptional, Max, Min } from 'class-validator';

export class UpdateAffiliateConfigDto {
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  commissionRate?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(365)
  cookieDays?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  minWithdrawal?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
