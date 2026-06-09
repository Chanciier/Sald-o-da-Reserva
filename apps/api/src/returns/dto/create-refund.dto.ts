import { IsNumber, IsOptional, IsPositive } from 'class-validator';

export class CreateRefundDto {
  @IsOptional()
  @IsNumber()
  @IsPositive()
  amount?: number;
}
