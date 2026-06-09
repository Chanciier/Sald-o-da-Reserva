import { Body, Controller, Post, Req } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuthenticatedUser } from '../auth/types/auth.types';
import { RecordConsentDto } from './dto/record-consent.dto';

@Controller('content/consent')
export class ConsentController {
  constructor(private readonly prisma: PrismaService) {}

  @Post()
  async record(
    @Body() dto: RecordConsentDto,
    @Req() req: { user: AuthenticatedUser; ip?: string },
  ) {
    const userId = req.user.id;
    const ip = req.ip ?? null;
    await this.prisma.userConsent.createMany({
      data: dto.types.map((type) => ({
        userId,
        type,
        documentVersion: dto.documentVersion,
        ipAddress: ip,
      })),
      skipDuplicates: false,
    });
    return { ok: true };
  }
}
