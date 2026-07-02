import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { AdminSection, Role, SectionAccessMode, SectionRequestStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { HashService } from '../auth/services/hash.service';
import {
  ADMIN_SECTIONS,
  PASSWORD_GRANT_DURATION_MS,
  SECTION_LABELS,
} from './seller-permissions.constants';
import { SectionPermissionInput } from './dto/update-permissions.dto';

type PermissionRow = {
  mode: SectionAccessMode;
  passwordHash: string | null;
  passwordGrantExpiresAt: Date | null;
  authorizationGrantedAt: Date | null;
};

@Injectable()
export class SellerPermissionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly hashService: HashService,
  ) {}

  async listForAdmin() {
    const vendedores = await this.prisma.user.findMany({
      where: { role: Role.VENDEDOR },
      select: { id: true, name: true, email: true, isActive: true, createdAt: true },
      orderBy: { name: 'asc' },
    });
    if (vendedores.length === 0) return [];

    const userIds = vendedores.map((v) => v.id);
    const [permissions, requests] = await Promise.all([
      this.prisma.sellerSectionPermission.findMany({ where: { userId: { in: userIds } } }),
      this.prisma.sellerAccessRequest.findMany({
        where: { userId: { in: userIds }, status: SectionRequestStatus.PENDING },
        orderBy: { createdAt: 'asc' },
      }),
    ]);

    return vendedores.map((vendedor) => ({
      id: vendedor.id,
      name: vendedor.name,
      email: vendedor.email,
      isActive: vendedor.isActive,
      createdAt: vendedor.createdAt,
      permissions: ADMIN_SECTIONS.map((section) =>
        this.toSectionState(
          section,
          permissions.find((p) => p.userId === vendedor.id && p.section === section),
        ),
      ),
      pendingRequests: requests
        .filter((r) => r.userId === vendedor.id)
        .map((r) => ({ id: r.id, section: r.section, message: r.message, createdAt: r.createdAt })),
    }));
  }

  async getMyPermissions(userId: string, role: Role) {
    if (role !== Role.VENDEDOR) {
      return ADMIN_SECTIONS.map((section) => ({
        section,
        label: SECTION_LABELS[section],
        mode: SectionAccessMode.FREE,
        unlocked: true,
        hasPendingRequest: false,
      }));
    }

    const [permissions, pendingRequests] = await Promise.all([
      this.prisma.sellerSectionPermission.findMany({ where: { userId } }),
      this.prisma.sellerAccessRequest.findMany({
        where: { userId, status: SectionRequestStatus.PENDING },
      }),
    ]);

    return ADMIN_SECTIONS.map((section) => ({
      ...this.toSectionState(
        section,
        permissions.find((p) => p.section === section),
      ),
      hasPendingRequest: pendingRequests.some((r) => r.section === section),
    }));
  }

  async hasSectionAccess(userId: string, sections: AdminSection[]): Promise<boolean> {
    const permissions = await this.prisma.sellerSectionPermission.findMany({
      where: { userId, section: { in: sections } },
    });
    return sections.some((section) => {
      const permission = permissions.find((p) => p.section === section);
      return this.isUnlocked(permission?.mode ?? SectionAccessMode.NONE, permission);
    });
  }

  async updatePermissions(
    targetUserId: string,
    adminId: string,
    entries: SectionPermissionInput[],
  ) {
    const target = await this.prisma.user.findUnique({
      where: { id: targetUserId },
      select: { id: true, role: true },
    });
    if (!target) throw new NotFoundException('Vendedor não encontrado.');
    if (target.role !== Role.VENDEDOR) {
      throw new BadRequestException(
        'Permissões de seção só podem ser configuradas para usuários com perfil VENDEDOR.',
      );
    }

    const prepared = await Promise.all(
      entries.map(async (entry) => {
        if (entry.mode === SectionAccessMode.PASSWORD) {
          if (!entry.password) {
            throw new BadRequestException(
              `Informe uma senha para a seção "${SECTION_LABELS[entry.section]}" no modo Acesso com senha.`,
            );
          }
          return { ...entry, passwordHash: await this.hashService.hashPassword(entry.password) };
        }
        return { ...entry, passwordHash: null as string | null };
      }),
    );

    await this.prisma.$transaction(
      prepared.map((entry) =>
        this.prisma.sellerSectionPermission.upsert({
          where: { userId_section: { userId: targetUserId, section: entry.section } },
          create: {
            userId: targetUserId,
            section: entry.section,
            mode: entry.mode,
            passwordHash: entry.passwordHash,
            updatedByUserId: adminId,
          },
          update: {
            mode: entry.mode,
            passwordHash: entry.passwordHash,
            updatedByUserId: adminId,
            // Qualquer alteração de configuração revoga desbloqueios anteriores.
            passwordGrantedAt: null,
            passwordGrantExpiresAt: null,
            authorizationGrantedAt: null,
          },
        }),
      ),
    );

    return this.getMyPermissions(targetUserId, Role.VENDEDOR);
  }

  async requestAccess(userId: string, section: AdminSection, message?: string) {
    const permission = await this.prisma.sellerSectionPermission.findUnique({
      where: { userId_section: { userId, section } },
    });
    if (permission?.mode !== SectionAccessMode.AUTHORIZATION) {
      throw new BadRequestException('Esta seção não está configurada para solicitação de acesso.');
    }
    if (permission.authorizationGrantedAt) {
      throw new ConflictException('Você já tem acesso liberado a esta seção.');
    }

    const existingPending = await this.prisma.sellerAccessRequest.findFirst({
      where: { userId, section, status: SectionRequestStatus.PENDING },
    });
    if (existingPending) {
      throw new ConflictException('Já existe uma solicitação pendente para esta seção.');
    }

    return this.prisma.sellerAccessRequest.create({ data: { userId, section, message } });
  }

  async approveRequest(requestId: string, adminId: string) {
    const request = await this.prisma.sellerAccessRequest.findUnique({ where: { id: requestId } });
    if (!request) throw new NotFoundException('Solicitação não encontrada.');
    if (request.status !== SectionRequestStatus.PENDING) {
      throw new ConflictException('Esta solicitação já foi resolvida.');
    }

    const now = new Date();
    await this.prisma.$transaction([
      this.prisma.sellerAccessRequest.update({
        where: { id: requestId },
        data: { status: SectionRequestStatus.APPROVED, resolvedById: adminId, resolvedAt: now },
      }),
      this.prisma.sellerSectionPermission.upsert({
        where: { userId_section: { userId: request.userId, section: request.section } },
        create: {
          userId: request.userId,
          section: request.section,
          mode: SectionAccessMode.AUTHORIZATION,
          authorizationGrantedAt: now,
          updatedByUserId: adminId,
        },
        update: { authorizationGrantedAt: now },
      }),
    ]);

    return { message: 'Acesso aprovado.' };
  }

  async denyRequest(requestId: string, adminId: string) {
    const request = await this.prisma.sellerAccessRequest.findUnique({ where: { id: requestId } });
    if (!request) throw new NotFoundException('Solicitação não encontrada.');
    if (request.status !== SectionRequestStatus.PENDING) {
      throw new ConflictException('Esta solicitação já foi resolvida.');
    }

    await this.prisma.sellerAccessRequest.update({
      where: { id: requestId },
      data: { status: SectionRequestStatus.DENIED, resolvedById: adminId, resolvedAt: new Date() },
    });

    return { message: 'Acesso negado.' };
  }

  async validatePassword(userId: string, section: AdminSection, password: string) {
    const permission = await this.prisma.sellerSectionPermission.findUnique({
      where: { userId_section: { userId, section } },
    });
    if (permission?.mode !== SectionAccessMode.PASSWORD || !permission.passwordHash) {
      throw new BadRequestException('Esta seção não está configurada com senha de acesso.');
    }

    const valid = await this.hashService.verifyPassword(permission.passwordHash, password);
    if (!valid) throw new UnauthorizedException('Senha incorreta.');

    const expiresAt = new Date(Date.now() + PASSWORD_GRANT_DURATION_MS);
    await this.prisma.sellerSectionPermission.update({
      where: { userId_section: { userId, section } },
      data: { passwordGrantedAt: new Date(), passwordGrantExpiresAt: expiresAt },
    });

    return { granted: true, expiresAt };
  }

  private toSectionState(section: AdminSection, permission?: PermissionRow) {
    const mode = permission?.mode ?? SectionAccessMode.NONE;
    return {
      section,
      label: SECTION_LABELS[section],
      mode,
      unlocked: this.isUnlocked(mode, permission),
    };
  }

  private isUnlocked(mode: SectionAccessMode, permission?: Partial<PermissionRow>): boolean {
    switch (mode) {
      case SectionAccessMode.FREE:
        return true;
      case SectionAccessMode.PASSWORD:
        return (
          !!permission?.passwordGrantExpiresAt && permission.passwordGrantExpiresAt > new Date()
        );
      case SectionAccessMode.AUTHORIZATION:
        return !!permission?.authorizationGrantedAt;
      default:
        return false;
    }
  }
}
