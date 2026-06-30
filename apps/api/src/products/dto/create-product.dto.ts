import {
  IsArray,
  IsBoolean,
  IsEnum,
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
} from 'class-validator';
import { Type, Transform } from 'class-transformer';
import { Marketplace, ProductStatus } from '@prisma/client';

export class DimensionsDto {
  @IsNumber() width: number;
  @IsNumber() height: number;
  @IsNumber() depth: number;
  @IsString() unit: string;
}

export class CreateProductDto {
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  name: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  slug?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  sku?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  internalCode?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  brand?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  shortDescription?: string;

  @IsOptional()
  @IsString()
  @MaxLength(10000)
  description?: string;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Type(() => Number)
  price: number;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Type(() => Number)
  salePrice?: number;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(0)
  @Type(() => Number)
  weight?: number;

  @IsOptional()
  @IsObject()
  @Type(() => DimensionsDto)
  dimensions?: DimensionsDto;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Type(() => Number)
  stock?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Type(() => Number)
  minimumStock?: number;

  @IsOptional()
  @IsBoolean()
  pickupAvailable?: boolean;

  @IsOptional()
  @IsBoolean()
  featuredOffer?: boolean;

  @IsOptional()
  @IsEnum(ProductStatus)
  status?: ProductStatus;

  @IsOptional()
  @IsString()
  categoryId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  metaTitle?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  metaDescription?: string;

  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' && value.trim() === '' ? undefined : value))
  @IsString()
  @MaxLength(20)
  @Matches(/^(\d{8}|\d{4}\.\d{2}\.\d{2})$/, {
    message: 'NCM deve ter 8 dígitos (ex.: 9404.90.00 ou 94049000).',
  })
  ncm?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Type(() => Number)
  origem?: number;

  @IsOptional()
  @IsString()
  @MaxLength(10)
  cfop?: string;

  @IsOptional()
  @IsString()
  @MaxLength(10)
  cstCsosn?: string;

  // OMS/Marketplace: EAN/UPC (atributo GTIN exigido por várias categorias do ML).
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' && value.trim() === '' ? undefined : value))
  @IsString()
  @MaxLength(14)
  gtin?: string;

  // OMS/Marketplace: condição do anúncio ('new' | 'used').
  @IsOptional()
  @IsIn(['new', 'used'])
  condition?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  imageIds?: string[];

  @IsOptional()
  @IsBoolean()
  autoPublishWhatsapp?: boolean;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  whatsappGroupIds?: string[];

  // OMS: produto único (peça sem reposição) → reserva imediata + proteção contra
  // venda duplicada entre canais.
  @IsOptional()
  @IsBoolean()
  isUnique?: boolean;

  // OMS: marketplaces onde publicar ao salvar. SITE é incluído por padrão no
  // service quando a lista vier vazia.
  @IsOptional()
  @IsArray()
  @IsEnum(Marketplace, { each: true })
  publishTo?: Marketplace[];
}
