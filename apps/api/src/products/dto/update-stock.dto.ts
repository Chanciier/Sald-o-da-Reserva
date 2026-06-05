import { IsInt, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class UpdateStockDto {
  @IsInt()
  @Min(0)
  @Type(() => Number)
  stock: number;
}
