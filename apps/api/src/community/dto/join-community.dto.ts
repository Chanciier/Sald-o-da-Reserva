import { IsOptional, IsString, Matches, MaxLength } from 'class-validator';
import { CATEGORY_MAX_LENGTH, CATEGORY_MESSAGE, CATEGORY_PATTERN } from '../category';

// Query do endpoint público /community/join — tudo opcional, tudo limitado
// em tamanho (entrada anônima e sem autenticação).
export class JoinCommunityDto {
  // Categoria do link (/grupos/<categoria>). Ausente = "geral" (/grupos).
  @IsOptional()
  @IsString()
  @MaxLength(CATEGORY_MAX_LENGTH)
  @Matches(CATEGORY_PATTERN, { message: CATEGORY_MESSAGE })
  category?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  visitorId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  utmSource?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  utmMedium?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  utmCampaign?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  referrer?: string;
}
