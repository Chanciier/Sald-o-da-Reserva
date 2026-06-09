import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

export const RETURN_REASONS = ['REGRET', 'DEFECT', 'WRONG_ITEM', 'OTHER'] as const;
export type ReturnReason = (typeof RETURN_REASONS)[number];

export class CreateReturnDto {
  @IsString()
  orderId: string;

  @IsIn(RETURN_REASONS)
  reason: ReturnReason;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;
}
