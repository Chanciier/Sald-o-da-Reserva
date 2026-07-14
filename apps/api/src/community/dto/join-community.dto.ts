import { IsOptional, IsString, MaxLength } from 'class-validator';

// Query do endpoint público /community/join — tudo opcional, tudo limitado
// em tamanho (entrada anônima e sem autenticação).
export class JoinCommunityDto {
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
