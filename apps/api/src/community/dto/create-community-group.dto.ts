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

export class CreateCommunityGroupDto {
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name: string;

  @IsString()
  @Matches(/^https:\/\/chat\.whatsapp\.com\/[A-Za-z0-9]+$/, {
    message: 'inviteLink deve ser um link de convite do WhatsApp (https://chat.whatsapp.com/...)',
  })
  inviteLink: string;

  // JID do grupo (xxx@g.us) — habilita a sincronização automática via Baileys.
  @IsOptional()
  @IsString()
  @Matches(/^\d[\d-]*@g\.us$/, { message: 'groupJid deve ter o formato 123456789@g.us' })
  groupJid?: string;

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
