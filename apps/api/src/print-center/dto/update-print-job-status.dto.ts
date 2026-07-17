import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { PrintJobStatus } from '@prisma/client';

const DEVICE_REPORTABLE_STATUSES = [
  PrintJobStatus.PRINTING,
  PrintJobStatus.PRINTED,
  PrintJobStatus.FAILED,
] as const;

export class UpdatePrintJobStatusDto {
  @IsIn(DEVICE_REPORTABLE_STATUSES)
  status: (typeof DEVICE_REPORTABLE_STATUSES)[number];

  @IsOptional()
  @IsString()
  @MaxLength(500)
  error?: string;
}
