import { ArrayNotEmpty, IsArray, IsEnum } from 'class-validator';
import { Marketplace } from '@prisma/client';

/** Lista de marketplaces alvo para publicação manual de um produto. */
export class PublishProductDto {
  @IsArray()
  @ArrayNotEmpty()
  @IsEnum(Marketplace, { each: true })
  marketplaces!: Marketplace[];
}
