import { Transform } from 'class-transformer';
import { IsInt, IsNumber, IsOptional, IsString, Min } from 'class-validator';

/** Aceita `null` (comum em respostas de Vision/MarketResearch) em campos opcionais. */
const nullToUndefined = Transform(({ value }) => (value === null ? undefined : value));

/**
 * Entrada de `POST /pricing/suggest`. `marketAvgPrice`/`competitorCount`
 * normalmente vêm do resultado do MarketResearchModule (Hermes);
 * `productId`/`categoryId` são opcionais e habilitam sinais reais do catálogo.
 */
export class PricingRequestDto {
  @nullToUndefined
  @IsOptional()
  @IsNumber()
  @Min(0)
  marketAvgPrice?: number;

  @nullToUndefined
  @IsOptional()
  @IsNumber()
  @Min(0)
  marketMinPrice?: number;

  @nullToUndefined
  @IsOptional()
  @IsNumber()
  @Min(0)
  marketMaxPrice?: number;

  @nullToUndefined
  @IsOptional()
  @IsInt()
  @Min(0)
  competitorCount?: number;

  @nullToUndefined
  @IsOptional()
  @IsString()
  categoryId?: string;

  @nullToUndefined
  @IsOptional()
  @IsString()
  productId?: string;

  @nullToUndefined
  @IsOptional()
  @IsNumber()
  @Min(0)
  referencePrice?: number;
}
