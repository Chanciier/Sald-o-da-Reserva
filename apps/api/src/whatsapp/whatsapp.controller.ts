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
import { WhatsappMarketingService } from './whatsapp-marketing.service';
import { CreateGroupDto } from './dto/create-group.dto';
import { UpdateGroupDto } from './dto/update-group.dto';

@Controller('whatsapp')
@Roles(Role.ADMIN)
export class WhatsappController {
  constructor(
    private readonly marketing: WhatsappMarketingService,
    private readonly prisma: PrismaService,
  ) {}

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
}
