import { IsNotEmpty, IsString, MaxLength } from 'class-validator';
import { Transform } from 'class-transformer';

export class TrackAffiliateDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(16)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  code: string;
}
