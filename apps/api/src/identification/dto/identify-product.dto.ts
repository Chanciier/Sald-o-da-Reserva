import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { VISION_CONDITIONS } from '../../vision/vision.types';

/** Aceita `null` (como o VisionModule devolve) em campos opcionais de texto. */
const nullToUndefined = Transform(({ value }) => (value === null ? undefined : value));

/**
 * Entrada do IdentificationModule — o próprio JSON devolvido por
 * `POST /vision/analyze` (menos os metadados `modelUsed`/`imagesAnalyzed`,
 * que são ignorados se enviados).
 */
export class IdentifyProductDto {
  @nullToUndefined
  @IsOptional()
  @IsString()
  @MaxLength(150)
  brand?: string;

  @nullToUndefined
  @IsOptional()
  @IsString()
  @MaxLength(150)
  model?: string;

  @nullToUndefined
  @IsOptional()
  @IsString()
  @MaxLength(150)
  category?: string;

  @nullToUndefined
  @IsOptional()
  @IsString()
  @MaxLength(60)
  color?: string;

  @nullToUndefined
  @IsOptional()
  @IsString()
  @MaxLength(150)
  material?: string;

  @nullToUndefined
  @IsOptional()
  @IsString()
  @MaxLength(150)
  dimensions?: string;

  @nullToUndefined
  @IsOptional()
  @IsIn(VISION_CONDITIONS)
  condition?: (typeof VISION_CONDITIONS)[number];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(30)
  @IsString({ each: true })
  features?: string[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(30)
  @IsString({ each: true })
  keywords?: string[];

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  confidence?: number;
}
