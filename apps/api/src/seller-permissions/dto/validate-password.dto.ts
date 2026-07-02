import { IsEnum, IsString, MaxLength, MinLength } from 'class-validator';
import { AdminSection } from '@prisma/client';

export class ValidateSectionPasswordDto {
  @IsEnum(AdminSection)
  section: AdminSection;

  @IsString()
  @MinLength(1)
  @MaxLength(72)
  password: string;
}
