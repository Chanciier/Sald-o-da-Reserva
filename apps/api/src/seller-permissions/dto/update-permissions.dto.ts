import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { AdminSection, SectionAccessMode } from '@prisma/client';

// Cada entrada representa uma alteração deliberada naquela seção: o backend
// sempre reseta desbloqueios anteriores (senha/autorização) e, no modo
// PASSWORD, sempre exige a senha no próprio payload — o frontend só deve
// enviar as seções que o admin efetivamente alterou nesta chamada.
export class SectionPermissionInput {
  @IsEnum(AdminSection)
  section: AdminSection;

  @IsEnum(SectionAccessMode)
  mode: SectionAccessMode;

  @IsOptional()
  @IsString()
  @MinLength(4)
  @MaxLength(72)
  password?: string;
}

export class UpdateSellerPermissionsDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => SectionPermissionInput)
  permissions: SectionPermissionInput[];
}
