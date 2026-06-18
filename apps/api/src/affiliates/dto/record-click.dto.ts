import { IsOptional, IsString, MaxLength } from 'class-validator';

export class RecordClickDto {
  @IsString()
  @MaxLength(16)
  code!: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  productSlug?: string;
}
