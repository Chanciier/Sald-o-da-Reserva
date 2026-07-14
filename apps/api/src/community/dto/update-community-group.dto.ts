import { CommunityGroupStatus } from '@prisma/client';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class UpdateCommunityGroupDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @IsString()
  @Matches(/^https:\/\/chat\.whatsapp\.com\/[A-Za-z0-9]+$/, {
    message: 'inviteLink deve ser um link de convite do WhatsApp (https://chat.whatsapp.com/...)',
  })
  inviteLink?: string;

  // null desvincula o grupo do WhatsApp (desliga a sincronização).
  @IsOptional()
  @IsString()
  @Matches(/^\d[\d-]*@g\.us$/, { message: 'groupJid deve ter o formato 123456789@g.us' })
  groupJid?: string | null;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(5000)
  capacity?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  participants?: number;

  @IsOptional()
  @IsInt()
  @Min(-100)
  @Max(100)
  priority?: number;

  @IsOptional()
  @IsEnum(CommunityGroupStatus)
  status?: CommunityGroupStatus;

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}
