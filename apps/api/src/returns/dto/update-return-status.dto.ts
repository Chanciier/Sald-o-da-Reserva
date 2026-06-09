import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

export const RETURN_STATUSES = [
  'PENDING',
  'IN_REVIEW',
  'APPROVED',
  'REJECTED',
  'COMPLETED',
] as const;
export type ReturnStatus = (typeof RETURN_STATUSES)[number];

export class UpdateReturnStatusDto {
  @IsIn(RETURN_STATUSES)
  status: ReturnStatus;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  adminNotes?: string;
}
