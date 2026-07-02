import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { AdminSection } from '@prisma/client';

export class RequestSectionAccessDto {
  @IsEnum(AdminSection)
  section: AdminSection;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  message?: string;
}
