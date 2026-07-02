import { Transform } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsOptional, IsString, MaxLength } from 'class-validator';

/** Aceita `null` (como Vision/Identification devolvem) em campos opcionais. */
const nullToUndefined = Transform(({ value }) => (value === null ? undefined : value));

/**
 * Entrada da pesquisa de mercado — normalmente montada a partir do resultado
 * de Identification (`seoTitle`, `category`) e/ou Vision (`brand`, `model`,
 * `keywords`). Todos opcionais; a query é montada com o que houver.
 */
export class MarketResearchDto {
  @nullToUndefined
  @IsOptional()
  @IsString()
  @MaxLength(200)
  title?: string;

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

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(30)
  @IsString({ each: true })
  keywords?: string[];
}
