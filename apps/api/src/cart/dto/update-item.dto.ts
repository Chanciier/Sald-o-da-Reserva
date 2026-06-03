import { IsInt, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class UpdateItemDto {
  @IsInt()
  @Min(0)
  @Type(() => Number)
  quantity: number;
}
