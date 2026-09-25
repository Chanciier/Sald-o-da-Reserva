import { WhatsappRelayRole } from '@prisma/client';
import {
  IsBoolean,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';

export class CreateRelayGroupDto {
  @IsString()
  @Matches(/^[\d-]+@g\.us$/, { message: 'jid deve ser o ID de um grupo (ex.: 120363...@g.us)' })
  @MaxLength(60)
  jid: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name: string;

  @IsEnum(WhatsappRelayRole)
  role: WhatsappRelayRole;

  @IsBoolean()
  @IsOptional()
  active?: boolean;
}

export class UpdateRelayGroupDto {
  @IsEnum(WhatsappRelayRole)
  @IsOptional()
  role?: WhatsappRelayRole;

  @IsBoolean()
  @IsOptional()
  active?: boolean;
}

export class SetRelayEnabledDto {
  @IsBoolean()
  enabled: boolean;
}
