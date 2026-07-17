import { IsEnum, IsOptional, IsString } from 'class-validator';
import { PrintJobStatus, PrintJobType } from '@prisma/client';

export class QueryPrintJobsDto {
  @IsOptional()
  @IsEnum(PrintJobStatus)
  status?: PrintJobStatus;

  @IsOptional()
  @IsEnum(PrintJobType)
  type?: PrintJobType;

  @IsOptional()
  @IsString()
  orderId?: string;
}
