import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { CommunityService } from './community.service';
import { CommunitySyncService } from './community-sync.service';
import { CommunityAnalyticsService } from './community-analytics.service';
import { CommunityController } from './community.controller';
import { CommunityAdminController } from './community-admin.controller';
import { BaileysGroupProvisioner, GROUP_PROVISIONER } from './group-provisioner';

/**
 * Hub Inteligente de Distribuição de Grupos do WhatsApp.
 *
 * Um único link público (/grupos no site → GET /community/join) distribui
 * novos membros entre os grupos cadastrados, equilibrando a ocupação e nunca
 * enviando para grupo lotado. Os contadores são espelhados do WhatsApp pelo
 * CommunitySyncService (cron + eventos em tempo real via Baileys).
 *
 * BaileysService e RedisService vêm de módulos globais (WhatsappModule /
 * RedisModule); o provisionador de grupos é injetado por token para permitir
 * a futura criação automática de grupos sem tocar nos consumidores.
 */
@Module({
  imports: [PrismaModule],
  controllers: [CommunityController, CommunityAdminController],
  providers: [
    CommunityService,
    CommunitySyncService,
    CommunityAnalyticsService,
    { provide: GROUP_PROVISIONER, useClass: BaileysGroupProvisioner },
  ],
  exports: [CommunityService],
})
export class CommunityModule {}
