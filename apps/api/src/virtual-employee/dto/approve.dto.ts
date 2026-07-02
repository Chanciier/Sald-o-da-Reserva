import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

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
}
