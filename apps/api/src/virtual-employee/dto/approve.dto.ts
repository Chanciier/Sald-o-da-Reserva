import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

/** Dimensões da embalagem (cm) — mesmo shape do `DimensionsDto` de produtos. */
class ApproveDimensionsDto {
  @IsNumber() @Min(0) width: number;
  @IsNumber() @Min(0) height: number;
  @IsNumber() @Min(0) depth: number;
  @IsIn(['cm']) unit: 'cm';
}

/** Aceita `null` explícito (limpar um campo opcional) sem falhar a validação. */
const nullable = Transform(({ value }) => (value === null ? undefined : value));

/**
 * Entrada de `POST /virtual-employee/approve`. Só `reviewId` é obrigatório —
 * o resto são overrides do que o operador editou no painel (campos omitidos
 * usam a sugestão da IA, guardada em cache sob `reviewId`).
 */
export class VirtualEmployeeApproveDto {
  @IsString()
  reviewId: string;

  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(10000)
  description?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  shortDescription?: string;

  @nullable
  @IsOptional()
  @IsString()
  categoryId?: string;

  @nullable
  @IsOptional()
  @IsString()
  @MaxLength(20)
  @Matches(/^(\d{8}|\d{4}\.\d{2}\.\d{2})$/, {
    message: 'NCM deve ter 8 dígitos (ex.: 9404.90.00 ou 94049000).',
  })
  ncm?: string;

  @nullable
  @IsOptional()
  @IsString()
  @MaxLength(100)
  brand?: string;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  price?: number;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  metaDescription?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  stock?: number;

  @IsOptional()
  @IsBoolean()
  isUnique?: boolean;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @IsString({ each: true })
  imageIds?: string[];

  @nullable
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(0)
  weight?: number;

  @nullable
  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => ApproveDimensionsDto)
  dimensions?: ApproveDimensionsDto;

  @nullable
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' && value.trim() === '' ? undefined : value))
  @IsString()
  @MaxLength(14)
  gtin?: string;

  @IsOptional()
  @IsIn(['new', 'used'])
  condition?: 'new' | 'used';

  @IsOptional()
  @IsBoolean()
  pickupAvailable?: boolean;

  @IsOptional()
  @IsBoolean()
  autoPublishWhatsapp?: boolean;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @IsString({ each: true })
  whatsappGroupIds?: string[];

  @IsOptional()
  @IsArray()
  @IsIn(['MERCADO_LIVRE', 'SHOPEE'], { each: true })
  publishTo?: ('MERCADO_LIVRE' | 'SHOPEE')[];
}
