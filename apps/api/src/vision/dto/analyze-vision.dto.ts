import { ArrayMaxSize, IsArray, IsOptional, IsString, IsUrl } from 'class-validator';

/**
 * Entrada da análise de visão. Aceita URLs públicas de imagem (buscadas pelo
 * servidor com guarda anti-SSRF) e/ou imagens já em base64. Pelo menos uma
 * imagem é obrigatória; o limite combinado (máx. 5) é validado no serviço.
 */
export class AnalyzeVisionDto {
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(5)
  @IsUrl({ require_tld: true, protocols: ['http', 'https'] }, { each: true })
  imageUrls?: string[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(5)
  @IsString({ each: true })
  imagesBase64?: string[];
}
