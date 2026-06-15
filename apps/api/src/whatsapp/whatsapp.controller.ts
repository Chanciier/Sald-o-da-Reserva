import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { Roles } from '../auth/decorators/roles.decorator';
import { PrismaService } from '../prisma/prisma.service';
import { BaileysService } from './baileys.service';
import { WhatsappMarketingService } from './whatsapp-marketing.service';
import { AIContentService } from './ai-content.service';
import { CreateGroupDto } from './dto/create-group.dto';
import { UpdateGroupDto } from './dto/update-group.dto';
import { GenerateContentDto, UpdateContentDto } from './dto/generate-content.dto';

@Controller('whatsapp')
@Roles(Role.ADMIN)
export class WhatsappController {
  constructor(
    private readonly baileys: BaileysService,
    private readonly marketing: WhatsappMarketingService,
    private readonly ai: AIContentService,
    private readonly prisma: PrismaService,
  ) {}

  @Get('status')
  getStatus() {
    return { connected: this.baileys.isReady(), qr: this.baileys.getQr() };
  }

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  async logout() {
    await this.baileys.clearSession();
  }

  @Get('groups')
  findGroups() {
    return this.prisma.whatsappGroup.findMany({ orderBy: { name: 'asc' } });
  }

  @Post('groups')
  @HttpCode(HttpStatus.CREATED)
  createGroup(@Body() dto: CreateGroupDto) {
    return this.prisma.whatsappGroup.create({ data: dto });
  }

  @Patch('groups/:id')
  updateGroup(@Param('id') id: string, @Body() dto: UpdateGroupDto) {
    return this.prisma.whatsappGroup.update({ where: { id }, data: dto });
  }

  @Delete('groups/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  deleteGroup(@Param('id') id: string) {
    return this.prisma.whatsappGroup.delete({ where: { id } });
  }

  @Post('resend/:productId')
  resend(@Param('productId') productId: string) {
    return this.marketing.resendProduct(productId);
  }

  @Get('logs')
  logs(@Query('productId') productId?: string) {
    return this.prisma.whatsappMessageLog.findMany({
      where: productId ? { productId } : undefined,
      include: { group: { select: { id: true, name: true } } },
      orderBy: { sentAt: 'desc' },
      take: 100,
    });
  }

  // Content generation
  @Post('content/generate')
  async generateContent(@Body() dto: GenerateContentDto) {
    const frontendUrl = process.env.FRONTEND_URL ?? 'http://localhost:3000';
    const product = await this.prisma.product.findUniqueOrThrow({
      where: { id: dto.productId },
      select: { slug: true },
    });
    const productUrl = `${frontendUrl}/produtos/${product.slug}`;

    const content = await this.ai.generateAdCopy({ ...dto, productUrl });

    return this.prisma.whatsappContentHistory.create({
      data: { productId: dto.productId, content, edited: false },
    });
  }

  @Get('content/:productId')
  getContent(@Param('productId') productId: string) {
    return this.prisma.whatsappContentHistory.findMany({
      where: { productId },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });
  }

  @Patch('content/:id')
  updateContent(@Param('id') id: string, @Body() dto: UpdateContentDto) {
    return this.prisma.whatsappContentHistory.update({
      where: { id },
      data: { content: dto.content, edited: true },
    });
  }

  @Delete('content/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  deleteContent(@Param('id') id: string) {
    return this.prisma.whatsappContentHistory.delete({ where: { id } });
  }
}
