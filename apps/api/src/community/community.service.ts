import { BadRequestException, Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { CommunityGroup, CommunityGroupStatus, CommunityRedirectOutcome } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { DistributableGroup, occupancyRatio, pickGroupForNewMember } from './distribution';
import { CreateCommunityGroupDto } from './dto/create-community-group.dto';
import { UpdateCommunityGroupDto } from './dto/update-community-group.dto';
import { JoinCommunityDto } from './dto/join-community.dto';
import { GROUP_PROVISIONER, GroupProvisioner } from './group-provisioner';

const GROUPS_CACHE_KEY = 'community:groups:active';
const GROUPS_CACHE_TTL_SECONDS = 60;
const PENDING_KEY_PREFIX = 'community:pending:';
// Janela do contador otimista de redirecionados — cobre o intervalo da sync
// (10 min) com folga. Depois disso o valor real do WhatsApp assume.
const PENDING_TTL_SECONDS = 15 * 60;

interface CachedGroup {
  id: string;
  name: string;
  inviteLink: string;
  capacity: number;
  participants: number;
  priority: number;
  status: CommunityGroupStatus;
  active: boolean;
  createdAt: string;
}

export interface JoinResult {
  available: boolean;
  group?: { id: string; name: string; inviteLink: string };
}

@Injectable()
export class CommunityService {
  private readonly logger = new Logger(CommunityService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    @Inject(GROUP_PROVISIONER) private readonly provisioner: GroupProvisioner,
  ) {}

  // ── Distribuição (fluxo público) ───────────────────────────────────────────

  /**
   * Escolhe o grupo para um novo membro e registra o acesso para analytics.
   * Nunca consulta o WhatsApp no caminho quente: trabalha só com banco/cache.
   */
  async join(dto: JoinCommunityDto): Promise<JoinResult> {
    const groups = await this.getDistributableGroups();
    const picked = pickGroupForNewMember(groups);

    await this.recordRedirect(picked?.id ?? null, dto);

    if (!picked) return { available: false };

    // Contador otimista: evita estourar a capacidade entre uma sync e outra
    // quando muita gente entra de uma vez.
    try {
      await this.redis.increment(`${PENDING_KEY_PREFIX}${picked.id}`, PENDING_TTL_SECONDS);
    } catch (err) {
      this.logger.warn(`Falha ao incrementar contador otimista: ${(err as Error).message}`);
    }

    return {
      available: true,
      group: { id: picked.id, name: picked.name, inviteLink: picked.inviteLink },
    };
  }

  private async recordRedirect(groupId: string | null, dto: JoinCommunityDto): Promise<void> {
    try {
      await this.prisma.communityRedirect.create({
        data: {
          groupId,
          outcome: groupId
            ? CommunityRedirectOutcome.REDIRECTED
            : CommunityRedirectOutcome.ALL_FULL,
          visitorId: dto.visitorId,
          utmSource: dto.utmSource,
          utmMedium: dto.utmMedium,
          utmCampaign: dto.utmCampaign,
          referrer: dto.referrer,
        },
      });
    } catch (err) {
      // Analytics nunca pode derrubar o fluxo de entrada.
      this.logger.error('Falha ao registrar redirect de comunidade', err as Error);
    }
  }

  /** Grupos ativos (cache 60s) enriquecidos com os contadores otimistas. */
  private async getDistributableGroups(): Promise<DistributableGroup[]> {
    let cached: CachedGroup[] | null = null;
    try {
      cached = await this.redis.getJson<CachedGroup[]>(GROUPS_CACHE_KEY);
    } catch (err) {
      this.logger.warn(`Cache de grupos indisponível: ${(err as Error).message}`);
    }

    if (!cached) {
      const rows = await this.prisma.communityGroup.findMany({
        where: { active: true, status: { not: CommunityGroupStatus.ARCHIVED } },
        orderBy: { createdAt: 'asc' },
      });
      cached = rows.map((g) => ({
        id: g.id,
        name: g.name,
        inviteLink: g.inviteLink,
        capacity: g.capacity,
        participants: g.participants,
        priority: g.priority,
        status: g.status,
        active: g.active,
        createdAt: g.createdAt.toISOString(),
      }));
      try {
        await this.redis.setJson(GROUPS_CACHE_KEY, cached, GROUPS_CACHE_TTL_SECONDS);
      } catch {
        // cache é otimização, não requisito
      }
    }

    const pending = await this.getPendingCounts(cached.map((g) => g.id));
    return cached.map((g) => ({ ...g, pending: pending.get(g.id) ?? 0 }));
  }

  async getPendingCounts(groupIds: string[]): Promise<Map<string, number>> {
    const entries = await Promise.all(
      groupIds.map(async (id) => {
        try {
          const raw = await this.redis.get(`${PENDING_KEY_PREFIX}${id}`);
          return [id, raw ? parseInt(raw, 10) || 0 : 0] as const;
        } catch {
          return [id, 0] as const;
        }
      }),
    );
    return new Map(entries);
  }

  /** Limpa contadores otimistas (chamado após cada sync bem-sucedida). */
  async clearPendingCounts(): Promise<void> {
    try {
      await this.redis.delPattern(`${PENDING_KEY_PREFIX}*`);
    } catch (err) {
      this.logger.warn(`Falha ao limpar contadores otimistas: ${(err as Error).message}`);
    }
  }

  async invalidateCache(): Promise<void> {
    try {
      await this.redis.del(GROUPS_CACHE_KEY);
    } catch (err) {
      this.logger.warn(`Falha ao invalidar cache de grupos: ${(err as Error).message}`);
    }
  }

  // ── CRUD / dashboard (admin) ───────────────────────────────────────────────

  async listGroupsWithOccupancy() {
    const groups = await this.prisma.communityGroup.findMany({
      orderBy: [{ active: 'desc' }, { priority: 'desc' }, { createdAt: 'asc' }],
    });
    const pending = await this.getPendingCounts(groups.map((g) => g.id));

    const distributable: DistributableGroup[] = groups.map((g) => ({
      id: g.id,
      name: g.name,
      inviteLink: g.inviteLink,
      capacity: g.capacity,
      participants: g.participants,
      priority: g.priority,
      status: g.status,
      active: g.active,
      createdAt: g.createdAt,
      pending: pending.get(g.id) ?? 0,
    }));
    const recommended = pickGroupForNewMember(distributable);

    return {
      recommendedGroupId: recommended?.id ?? null,
      provisioner: this.provisioner.capabilities,
      groups: groups.map((g) => {
        const pendingCount = pending.get(g.id) ?? 0;
        return {
          ...g,
          pendingJoins: pendingCount,
          occupancyPct: Math.min(
            100,
            Math.round(
              occupancyRatio({
                participants: g.participants,
                pending: pendingCount,
                capacity: g.capacity,
              }) * 100,
            ),
          ),
        };
      }),
    };
  }

  async createGroup(dto: CreateCommunityGroupDto): Promise<CommunityGroup> {
    await this.assertJidAvailable(dto.groupJid);
    const group = await this.prisma.communityGroup.create({
      data: {
        name: dto.name,
        inviteLink: dto.inviteLink,
        groupJid: dto.groupJid,
        capacity: dto.capacity ?? 1024,
        participants: dto.participants ?? 0,
        priority: dto.priority ?? 0,
        status: dto.status ?? CommunityGroupStatus.ACTIVE,
        active: dto.active ?? true,
      },
    });
    await this.invalidateCache();
    return group;
  }

  async updateGroup(id: string, dto: UpdateCommunityGroupDto): Promise<CommunityGroup> {
    const current = await this.prisma.communityGroup.findUnique({ where: { id } });
    if (!current) throw new NotFoundException('Grupo não encontrado');
    if (dto.groupJid && dto.groupJid !== current.groupJid) {
      await this.assertJidAvailable(dto.groupJid);
    }

    const capacity = dto.capacity ?? current.capacity;
    const participants = dto.participants ?? current.participants;
    let status = dto.status ?? current.status;
    // Sem status explícito no payload, recalcula ACTIVE↔FULL quando números
    // mudam (PAUSED/ARCHIVED são estados manuais e não são tocados).
    if (
      dto.status === undefined &&
      (status === CommunityGroupStatus.ACTIVE || status === CommunityGroupStatus.FULL)
    ) {
      status = participants >= capacity ? CommunityGroupStatus.FULL : CommunityGroupStatus.ACTIVE;
    }

    const group = await this.prisma.communityGroup.update({
      where: { id },
      data: {
        name: dto.name,
        inviteLink: dto.inviteLink,
        groupJid: dto.groupJid,
        capacity: dto.capacity,
        participants: dto.participants,
        priority: dto.priority,
        active: dto.active,
        status,
      },
    });
    await this.invalidateCache();
    return group;
  }

  async deleteGroup(id: string): Promise<void> {
    const existing = await this.prisma.communityGroup.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Grupo não encontrado');
    await this.prisma.communityGroup.delete({ where: { id } });
    await this.invalidateCache();
  }

  private async assertJidAvailable(groupJid?: string | null): Promise<void> {
    if (!groupJid) return;
    const existing = await this.prisma.communityGroup.findUnique({ where: { groupJid } });
    if (existing) {
      throw new BadRequestException('Já existe um grupo do hub vinculado a este JID do WhatsApp.');
    }
  }
}
