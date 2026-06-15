import { IsString, IsOptional, IsNumber, IsPositive, Min } from 'class-validator';

export class GenerateContentDto {
  @IsString()
  productId: string;

  @IsString()
  name: string;

  @IsOptional()
  @IsString()
  category?: string;

  @IsOptional()
  @IsString()
  brand?: string;

  @IsNumber()
  @IsPositive()
  price: number;

  @IsOptional()
  @IsNumber()
  @IsPositive()
  salePrice?: number;

  @IsNumber()
  @Min(0)
  stock: number;

  @IsOptional()
  @IsString()
  description?: string;
}

export class UpdateContentDto {
  @IsString()
  content: string;
}
