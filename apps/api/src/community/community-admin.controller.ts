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
import { BaileysService } from '../whatsapp/baileys.service';
import { CommunityService } from './community.service';
import { CommunitySyncService } from './community-sync.service';
import { CommunityAnalyticsService } from './community-analytics.service';
import { CreateCommunityGroupDto } from './dto/create-community-group.dto';
import { UpdateCommunityGroupDto } from './dto/update-community-group.dto';

@Controller('community/admin')
@Roles(Role.ADMIN)
export class CommunityAdminController {
  constructor(
    private readonly community: CommunityService,
    private readonly sync: CommunitySyncService,
    private readonly analytics: CommunityAnalyticsService,
    private readonly baileys: BaileysService,
  ) {}

  // Dashboard: grupos com ocupação, grupo recomendado, capacidades do
  // provisionador e resultado da última sincronização.
  @Get('groups')
  async listGroups() {
    const data = await this.community.listGroupsWithOccupancy();
    return {
      ...data,
      whatsappConnected: this.baileys.isReady(),
      lastSync: this.sync.getLastSummary(),
    };
  }

  @Post('groups')
  @HttpCode(HttpStatus.CREATED)
  createGroup(@Body() dto: CreateCommunityGroupDto) {
    return this.community.createGroup(dto);
  }

  @Patch('groups/:id')
  updateGroup(@Param('id') id: string, @Body() dto: UpdateCommunityGroupDto) {
    return this.community.updateGroup(id, dto);
  }

  @Delete('groups/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  deleteGroup(@Param('id') id: string) {
    return this.community.deleteGroup(id);
  }

  @Post('sync')
  @HttpCode(HttpStatus.OK)
  syncNow() {
    return this.sync.syncAll('manual');
  }

  // Grupos visíveis na conta do WhatsApp conectada, com total de
  // participantes — usado no admin para vincular o JID ao cadastro.
  @Get('wa-groups')
  listWaGroups() {
    return this.baileys.fetchAllGroupsMetadata();
  }

  @Get('analytics')
  getAnalytics(@Query('days') days?: string) {
    return this.analytics.overview(days);
  }
}
