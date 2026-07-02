import { ArrayMaxSize, IsArray, IsOptional, IsString, IsUrl } from 'class-validator';

/**
 * Entrada de `POST /virtual-employee/analyze` — idêntica a `AnalyzeVisionDto`
 * (mesmas regras), mas mantida separada para o VirtualEmployeeModule não
 * depender do DTO interno do VisionModule.
 */
export class VirtualEmployeeAnalyzeDto {
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
