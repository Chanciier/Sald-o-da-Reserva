import { IsInt, IsString, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class AddItemDto {
  @IsString()
  productId: string;

  @IsInt()
  @Min(1)
  @Type(() => Number)
  quantity: number = 1;
}
