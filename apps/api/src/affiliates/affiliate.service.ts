import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ApplicationStatus, CommissionStatus, Prisma, WithdrawalStatus } from '@prisma/client';
import { randomBytes } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { MailService } from '../mail/mail.service';
import { UpdateAffiliateConfigDto } from './dto/update-config.dto';
import { ApplyAffiliateDto } from './dto/apply.dto';
import { UpdatePixDto } from './dto/update-pix.dto';

const CONFIG_ID = 'singleton';

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

// Avoids ambiguous chars (0/O, 1/I) for codes that people type/share.
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

@Injectable()
export class AffiliateService {
  private readonly logger = new Logger(AffiliateService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
  ) {}

  // ── Config (singleton row) ──────────────────────────────────────────────────

  async getConfig() {
    const existing = await this.prisma.affiliateConfig.findUnique({ where: { id: CONFIG_ID } });
    if (existing) return existing;
    return this.prisma.affiliateConfig.create({ data: { id: CONFIG_ID } });
  }

  /** Taxa de comissão global (fallback por produto/item). */
  async getCommissionRate(): Promise<number> {
    const cfg = await this.getConfig();
    return cfg.commissionRate.toNumber();
  }

  async getPublicConfig() {
    const cfg = await this.getConfig();
    return {
      commissionRate: cfg.commissionRate.toNumber(),
      cookieDays: cfg.cookieDays,
      minWithdrawal: cfg.minWithdrawal.toNumber(),
      isActive: cfg.isActive,
    };
  }

  async updateConfig(dto: UpdateAffiliateConfigDto) {
    await this.getConfig();
    const cfg = await this.prisma.affiliateConfig.update({
      where: { id: CONFIG_ID },
      data: {
        ...(dto.commissionRate !== undefined ? { commissionRate: dto.commissionRate } : {}),
        ...(dto.cookieDays !== undefined ? { cookieDays: dto.cookieDays } : {}),
        ...(dto.minWithdrawal !== undefined ? { minWithdrawal: dto.minWithdrawal } : {}),
        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
      },
    });
    return {
      commissionRate: cfg.commissionRate.toNumber(),
      cookieDays: cfg.cookieDays,
      minWithdrawal: cfg.minWithdrawal.toNumber(),
      isActive: cfg.isActive,
    };
  }

  // ── Dashboard do afiliado (self-service) ────────────────────────────────────

  async getMyDashboard(userId: string) {
    const config = await this.getPublicConfig();

    const [application, affiliate] = await Promise.all([
      this.prisma.affiliateApplication.findUnique({ where: { userId } }),
      this.prisma.affiliate.findUnique({ where: { userId } }),
    ]);

    const applicationOut = application
      ? {
          status: application.status,
          fullName: application.fullName,
          cpf: application.cpf,
          instagram: application.instagram,
          facebook: application.facebook,
          tiktok: application.tiktok,
          reviewNote: application.reviewNote,
        }
      : null;

    if (!affiliate) {
      return {
        application: applicationOut,
        affiliate: null,
        config,
        totals: { available: 0, pending: 0, paid: 0 },
        commissions: [],
        withdrawals: [],
      };
    }

    const [commissions, withdrawals] = await Promise.all([
      this.prisma.commission.findMany({
        where: { affiliateId: affiliate.id },
        orderBy: { createdAt: 'desc' },
        take: 200,
      }),
      this.prisma.withdrawal.findMany({
        where: { affiliateId: affiliate.id },
        orderBy: { createdAt: 'desc' },
        take: 100,
      }),
    ]);

    const totals = this.computeTotals(commissions);

    return {
      application: applicationOut,
      affiliate: {
        id: affiliate.id,
        code: affiliate.code,
        isActive: affiliate.isActive,
        pixKey: affiliate.pixKey,
        pixKeyType: affiliate.pixKeyType,
      },
      config,
      totals,
      commissions: commissions.map((c) => ({
        id: c.id,
        orderId: c.orderId,
        baseAmount: c.baseAmount.toNumber(),
        rate: c.rate.toNumber(),
        amount: c.amount.toNumber(),
        status: c.status,
        createdAt: c.createdAt,
        paidAt: c.paidAt,
      })),
      withdrawals: withdrawals.map((w) => ({
        id: w.id,
        amount: w.amount.toNumber(),
        status: w.status,
        pixKey: w.pixKey,
        pixKeyType: w.pixKeyType,
        note: w.note,
        createdAt: w.createdAt,
        paidAt: w.paidAt,
      })),
    };
  }

  /**
   * available = PENDING sem withdrawal (withdrawalId null)
   * pending   = PENDING em withdrawal aberto (withdrawalId não-null)
   * paid      = PAID
   */
  private computeTotals(
    commissions: Array<{
      status: CommissionStatus;
      withdrawalId: string | null;
      amount: Prisma.Decimal;
    }>,
  ) {
    let available = 0;
    let pending = 0;
    let paid = 0;
    for (const c of commissions) {
      const amount = c.amount.toNumber();
      if (c.status === CommissionStatus.PAID) {
        paid += amount;
      } else if (c.status === CommissionStatus.PENDING) {
        if (c.withdrawalId) pending += amount;
        else available += amount;
      }
    }
    return { available: round2(available), pending: round2(pending), paid: round2(paid) };
  }

  // ── Aplicação (candidatura) ─────────────────────────────────────────────────

  async apply(userId: string, dto: ApplyAffiliateDto) {
    // Pelo menos uma rede social (reforço além do custom validator do DTO).
    if (!dto.instagram?.trim() && !dto.facebook?.trim() && !dto.tiktok?.trim()) {
      throw new BadRequestException(
        'Informe ao menos uma rede social (Instagram, Facebook ou TikTok).',
      );
    }

    const existing = await this.prisma.affiliateApplication.findUnique({ where: { userId } });
    if (existing) {
      if (existing.status === ApplicationStatus.PENDING) {
        throw new ConflictException('Você já possui uma candidatura em análise.');
      }
      if (existing.status === ApplicationStatus.APPROVED) {
        throw new ConflictException('Sua candidatura já foi aprovada.');
      }
    }

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { name: true, cpf: true },
    });

    const fullName = dto.fullName?.trim() || user?.name || '';
    const cpf = (dto.cpf || user?.cpf || '').replace(/\D/g, '');

    if (!fullName) throw new BadRequestException('Nome completo é obrigatório.');
    if (!/^\d{11}$/.test(cpf)) throw new BadRequestException('CPF deve conter 11 dígitos.');

    const data = {
      fullName,
      cpf,
      instagram: dto.instagram?.trim() || null,
      facebook: dto.facebook?.trim() || null,
      tiktok: dto.tiktok?.trim() || null,
      status: ApplicationStatus.PENDING,
      reviewNote: null,
      reviewedAt: null,
    };

    // Reenvio após rejeição: reaproveita a linha (userId @unique).
    const application = existing
      ? await this.prisma.affiliateApplication.update({ where: { userId }, data })
      : await this.prisma.affiliateApplication.create({ data: { userId, ...data } });

    this.logger.log(`Candidatura de afiliado: user=${userId}`);
    return {
      status: application.status,
      fullName: application.fullName,
      cpf: application.cpf,
      instagram: application.instagram,
      facebook: application.facebook,
      tiktok: application.tiktok,
      reviewNote: application.reviewNote,
    };
  }

  // ── PIX ─────────────────────────────────────────────────────────────────────

  async updatePix(userId: string, dto: UpdatePixDto) {
    const affiliate = await this.prisma.affiliate.findUnique({ where: { userId } });
    if (!affiliate) throw new NotFoundException('Você ainda não é um afiliado aprovado.');

    const updated = await this.prisma.affiliate.update({
      where: { id: affiliate.id },
      data: { pixKey: dto.pixKey.trim(), pixKeyType: dto.pixKeyType },
    });
    return {
      id: updated.id,
      code: updated.code,
      isActive: updated.isActive,
      pixKey: updated.pixKey,
      pixKeyType: updated.pixKeyType,
    };
  }

  // ── Saque ───────────────────────────────────────────────────────────────────

  async requestWithdrawal(userId: string) {
    const affiliate = await this.prisma.affiliate.findUnique({ where: { userId } });
    if (!affiliate) throw new NotFoundException('Você ainda não é um afiliado aprovado.');
    if (!affiliate.pixKey || !affiliate.pixKeyType) {
      throw new BadRequestException('Cadastre sua chave PIX antes de solicitar um saque.');
    }

    const openWithdrawal = await this.prisma.withdrawal.findFirst({
      where: { affiliateId: affiliate.id, status: WithdrawalStatus.PENDING },
    });
    if (openWithdrawal) {
      throw new BadRequestException('Você já possui um saque pendente em análise.');
    }

    const config = await this.getConfig();
    const minWithdrawal = config.minWithdrawal.toNumber();

    const availableCommissions = await this.prisma.commission.findMany({
      where: {
        affiliateId: affiliate.id,
        status: CommissionStatus.PENDING,
        withdrawalId: null,
      },
      select: { id: true, amount: true },
    });

    const total = round2(availableCommissions.reduce((sum, c) => sum + c.amount.toNumber(), 0));

    if (total < minWithdrawal) {
      throw new BadRequestException(
        `Saldo disponível (R$ ${total.toFixed(2)}) abaixo do mínimo de R$ ${minWithdrawal.toFixed(2)}.`,
      );
    }

    const withdrawal = await this.prisma.$transaction(async (tx) => {
      const created = await tx.withdrawal.create({
        data: {
          affiliateId: affiliate.id,
          amount: total,
          pixKey: affiliate.pixKey as string,
          pixKeyType: affiliate.pixKeyType as string,
          status: WithdrawalStatus.PENDING,
        },
      });
      await tx.commission.updateMany({
        where: { id: { in: availableCommissions.map((c) => c.id) } },
        data: { withdrawalId: created.id },
      });
      return created;
    });

    this.logger.log(`Saque solicitado: affiliate=${affiliate.id} amount=${total}`);
    return {
      id: withdrawal.id,
      amount: withdrawal.amount.toNumber(),
      status: withdrawal.status,
      pixKey: withdrawal.pixKey,
      pixKeyType: withdrawal.pixKeyType,
      note: withdrawal.note,
      createdAt: withdrawal.createdAt,
      paidAt: withdrawal.paidAt,
    };
  }

  // ── Atribuição (track + checkout) ───────────────────────────────────────────

  /** Registra a indicação no usuário autenticado. Idempotente. */
  async track(userId: string, code: string) {
    if (!code?.trim()) throw new BadRequestException('Código de afiliado obrigatório.');
    const config = await this.getConfig();
    if (!config.isActive) return { tracked: false };

    const affiliate = await this.prisma.affiliate.findUnique({
      where: { code: code.trim().toUpperCase() },
    });
    if (!affiliate || !affiliate.isActive) return { tracked: false };
    if (affiliate.userId === userId) return { tracked: false }; // sem auto-indicação

    await this.prisma.user.update({
      where: { id: userId },
      data: { referredByCode: affiliate.code, referredAt: new Date() },
    });
    return { tracked: true, code: affiliate.code };
  }

  /**
   * Resolve o affiliateId. Prioriza o código do cookie; se ausente, faz fallback
   * em user.referredByCode (se dentro da janela de cookieDays). Null se inválido
   * ou auto-indicação.
   */
  async resolveAffiliateId(code: string | undefined, buyerUserId: string): Promise<string | null> {
    const config = await this.getConfig();
    if (!config.isActive) return null;

    let resolvedCode = code?.trim();

    if (!resolvedCode) {
      // Fallback: indicação persistida no usuário (dentro da janela).
      const user = await this.prisma.user.findUnique({
        where: { id: buyerUserId },
        select: { referredByCode: true, referredAt: true },
      });
      if (!user?.referredByCode || !user.referredAt) return null;
      const ageMs = Date.now() - user.referredAt.getTime();
      const windowMs = config.cookieDays * 24 * 60 * 60 * 1000;
      if (ageMs > windowMs) return null;
      resolvedCode = user.referredByCode;
    }

    const affiliate = await this.prisma.affiliate.findUnique({
      where: { code: resolvedCode.toUpperCase() },
    });
    if (!affiliate || !affiliate.isActive) return null;
    if (affiliate.userId === buyerUserId) return null; // sem auto-indicação
    return affiliate.id;
  }

  // ── Ciclo de vida da comissão (chamado pelo webhook) ────────────────────────

  /** Cria comissão PENDENTE quando o pedido é pago. Idempotente. Comissão por item. */
  async createCommissionForOrder(orderId: string): Promise<void> {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: {
        items: true,
        user: { select: { id: true, cpf: true } },
      },
    });
    if (!order?.affiliateId) return;

    const existing = await this.prisma.commission.findUnique({ where: { orderId } });
    if (existing) return;

    const affiliate = await this.prisma.affiliate.findUnique({
      where: { id: order.affiliateId },
      include: {
        user: {
          select: {
            id: true,
            affiliateApplication: { select: { cpf: true } },
          },
        },
      },
    });
    if (!affiliate) return;

    // Anti-fraude: bloqueia auto-indicação por userId...
    if (affiliate.userId === order.userId) {
      this.logger.warn(`Comissão bloqueada (auto-indicação por userId): order=${orderId}`);
      return;
    }
    // ...e por CPF (comprador == titular da application do afiliado).
    const buyerCpf = (order.user?.cpf || '').replace(/\D/g, '');
    const affiliateCpf = (affiliate.user.affiliateApplication?.cpf || '').replace(/\D/g, '');
    if (buyerCpf && affiliateCpf && buyerCpf === affiliateCpf) {
      this.logger.warn(`Comissão bloqueada (CPF igual ao do afiliado): order=${orderId}`);
      return;
    }

    const configRate = await this.getCommissionRate();

    let amount = 0;
    let baseAmount = 0;
    for (const item of order.items) {
      const itemRate = item.commissionRate ? item.commissionRate.toNumber() : configRate;
      if (itemRate <= 0) continue;
      const subtotal = item.subtotal.toNumber();
      amount += (subtotal * itemRate) / 100;
      baseAmount += subtotal;
    }

    amount = round2(amount);
    baseAmount = round2(baseAmount);
    const rate = baseAmount > 0 ? round2((amount / baseAmount) * 100) : 0;

    if (amount <= 0) return;

    await this.prisma.commission.create({
      data: {
        affiliateId: order.affiliateId,
        orderId,
        baseAmount,
        rate,
        amount,
        status: CommissionStatus.PENDING,
      },
    });
    this.logger.log(`Comissão criada: order=${orderId} amount=${amount} (${rate}%)`);
  }

  /** Cancela a comissão se o pedido for reembolsado/cancelado (não mexe em já paga). */
  async cancelCommissionForOrder(orderId: string): Promise<void> {
    const commission = await this.prisma.commission.findUnique({ where: { orderId } });
    if (!commission || commission.status !== CommissionStatus.PENDING) return;

    await this.prisma.commission.update({
      where: { orderId },
      data: { status: CommissionStatus.CANCELLED, withdrawalId: null },
    });
    this.logger.log(`Comissão cancelada (reembolso): order=${orderId}`);
  }

  // ── Admin: candidaturas ─────────────────────────────────────────────────────

  async listApplications(status?: ApplicationStatus) {
    const where: Prisma.AffiliateApplicationWhereInput = status ? { status } : {};
    const applications = await this.prisma.affiliateApplication.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 200,
      include: { user: { select: { name: true, email: true } } },
    });

    return applications.map((a) => ({
      id: a.id,
      userId: a.userId,
      fullName: a.fullName,
      cpf: a.cpf,
      instagram: a.instagram,
      facebook: a.facebook,
      tiktok: a.tiktok,
      status: a.status,
      reviewNote: a.reviewNote,
      createdAt: a.createdAt,
      userName: a.user.name,
      userEmail: a.user.email,
    }));
  }

  async approveApplication(applicationId: string) {
    const application = await this.prisma.affiliateApplication.findUnique({
      where: { id: applicationId },
      include: { user: { select: { id: true, name: true, email: true } } },
    });
    if (!application) throw new NotFoundException('Candidatura não encontrada.');
    if (application.status === ApplicationStatus.APPROVED) {
      throw new BadRequestException('Candidatura já aprovada.');
    }

    // Reaproveita o afiliado se já existir (idempotência defensiva).
    let affiliate = await this.prisma.affiliate.findUnique({
      where: { userId: application.userId },
    });
    if (!affiliate) {
      const code = await this.generateUniqueCode();
      affiliate = await this.prisma.affiliate.create({
        data: { userId: application.userId, code },
      });
    }

    await this.prisma.affiliateApplication.update({
      where: { id: applicationId },
      data: {
        status: ApplicationStatus.APPROVED,
        reviewedAt: new Date(),
        reviewNote: null,
      },
    });

    this.logger.log(`Candidatura aprovada: user=${application.userId} code=${affiliate.code}`);

    this.mail
      .sendAffiliateApprovedEmail(application.user.email, application.user.name, affiliate.code)
      .catch((e) => this.logger.warn(`E-mail de aprovação falhou: ${(e as Error).message}`));

    return { id: affiliate.id, code: affiliate.code, isActive: affiliate.isActive };
  }

  async rejectApplication(applicationId: string, note?: string) {
    const application = await this.prisma.affiliateApplication.findUnique({
      where: { id: applicationId },
      include: { user: { select: { name: true, email: true } } },
    });
    if (!application) throw new NotFoundException('Candidatura não encontrada.');

    const updated = await this.prisma.affiliateApplication.update({
      where: { id: applicationId },
      data: {
        status: ApplicationStatus.REJECTED,
        reviewNote: note ?? null,
        reviewedAt: new Date(),
      },
    });

    this.mail
      .sendAffiliateRejectedEmail(application.user.email, application.user.name, note)
      .catch((e) => this.logger.warn(`E-mail de rejeição falhou: ${(e as Error).message}`));

    return { id: updated.id, status: updated.status, reviewNote: updated.reviewNote };
  }

  // ── Admin: saques ───────────────────────────────────────────────────────────

  async listWithdrawals(status?: WithdrawalStatus) {
    const where: Prisma.WithdrawalWhereInput = status ? { status } : {};
    const withdrawals = await this.prisma.withdrawal.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 200,
      include: {
        affiliate: { include: { user: { select: { name: true, email: true } } } },
      },
    });

    return withdrawals.map((w) => ({
      id: w.id,
      affiliateCode: w.affiliate.code,
      affiliateName: w.affiliate.user.name,
      affiliateEmail: w.affiliate.user.email,
      amount: w.amount.toNumber(),
      pixKey: w.pixKey,
      pixKeyType: w.pixKeyType,
      status: w.status,
      note: w.note,
      createdAt: w.createdAt,
      paidAt: w.paidAt,
    }));
  }

  async payWithdrawal(id: string) {
    const withdrawal = await this.prisma.withdrawal.findUnique({ where: { id } });
    if (!withdrawal) throw new NotFoundException('Saque não encontrado.');
    if (withdrawal.status === WithdrawalStatus.REJECTED) {
      throw new BadRequestException('Saque rejeitado não pode ser pago.');
    }
    if (withdrawal.status === WithdrawalStatus.PAID) {
      return { id: withdrawal.id, status: withdrawal.status, paidAt: withdrawal.paidAt };
    }

    const now = new Date();
    const updated = await this.prisma.$transaction(async (tx) => {
      const w = await tx.withdrawal.update({
        where: { id },
        data: { status: WithdrawalStatus.PAID, paidAt: now },
      });
      await tx.commission.updateMany({
        where: { withdrawalId: id },
        data: { status: CommissionStatus.PAID, paidAt: now },
      });
      return w;
    });

    this.logger.log(`Saque pago: id=${id} amount=${updated.amount.toNumber()}`);
    return { id: updated.id, status: updated.status, paidAt: updated.paidAt };
  }

  async rejectWithdrawal(id: string, note?: string) {
    const withdrawal = await this.prisma.withdrawal.findUnique({ where: { id } });
    if (!withdrawal) throw new NotFoundException('Saque não encontrado.');
    if (withdrawal.status === WithdrawalStatus.PAID) {
      throw new BadRequestException('Saque já pago não pode ser rejeitado.');
    }
    if (withdrawal.status === WithdrawalStatus.REJECTED) {
      return { id: withdrawal.id, status: withdrawal.status, note: withdrawal.note };
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const w = await tx.withdrawal.update({
        where: { id },
        data: { status: WithdrawalStatus.REJECTED, note: note ?? null },
      });
      // Desvincula as comissões (voltam a ficar disponíveis, permanecem PENDING).
      await tx.commission.updateMany({
        where: { withdrawalId: id },
        data: { withdrawalId: null },
      });
      return w;
    });

    this.logger.log(`Saque rejeitado: id=${id}`);
    return { id: updated.id, status: updated.status, note: updated.note };
  }

  // ── Admin: afiliados e comissões ────────────────────────────────────────────

  async listAffiliates() {
    const affiliates = await this.prisma.affiliate.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        user: { select: { name: true, email: true } },
        _count: { select: { orders: true, commissions: true } },
      },
    });

    const sums = await this.prisma.commission.groupBy({
      by: ['affiliateId', 'status'],
      _sum: { amount: true },
    });

    return affiliates.map((a) => {
      const mine = sums.filter((s) => s.affiliateId === a.id);
      const byStatus = (st: CommissionStatus) =>
        mine.find((s) => s.status === st)?._sum.amount?.toNumber() ?? 0;
      return {
        id: a.id,
        code: a.code,
        isActive: a.isActive,
        name: a.user.name,
        email: a.user.email,
        orders: a._count.orders,
        commissionsCount: a._count.commissions,
        pending: byStatus(CommissionStatus.PENDING),
        paid: byStatus(CommissionStatus.PAID),
        createdAt: a.createdAt,
      };
    });
  }

  async listCommissions(status?: CommissionStatus) {
    const where: Prisma.CommissionWhereInput = status ? { status } : {};
    const commissions = await this.prisma.commission.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 200,
      include: {
        affiliate: { include: { user: { select: { name: true, email: true } } } },
        order: { select: { id: true, total: true, createdAt: true } },
      },
    });

    return commissions.map((c) => ({
      id: c.id,
      orderId: c.orderId,
      affiliateCode: c.affiliate.code,
      affiliateName: c.affiliate.user.name,
      affiliateEmail: c.affiliate.user.email,
      baseAmount: c.baseAmount.toNumber(),
      rate: c.rate.toNumber(),
      amount: c.amount.toNumber(),
      status: c.status,
      createdAt: c.createdAt,
      paidAt: c.paidAt,
      orderTotal: c.order ? c.order.total.toNumber() : null,
    }));
  }

  async payCommission(id: string) {
    const commission = await this.prisma.commission.findUnique({ where: { id } });
    if (!commission) throw new NotFoundException('Comissão não encontrada.');
    if (commission.status === CommissionStatus.CANCELLED) {
      throw new BadRequestException('Comissão cancelada não pode ser paga.');
    }
    if (commission.status === CommissionStatus.PAID) {
      return { id: commission.id, status: commission.status, paidAt: commission.paidAt };
    }
    const updated = await this.prisma.commission.update({
      where: { id },
      data: { status: CommissionStatus.PAID, paidAt: new Date() },
    });
    return { id: updated.id, status: updated.status, paidAt: updated.paidAt };
  }

  // ── Helpers ─────────────────────────────────────────────────────────────────

  private async generateUniqueCode(): Promise<string> {
    for (let attempt = 0; attempt < 6; attempt++) {
      const code = randomCode(8);
      const taken = await this.prisma.affiliate.findUnique({ where: { code } });
      if (!taken) return code;
    }
    throw new BadRequestException('Não foi possível gerar um código de afiliado. Tente novamente.');
  }
}

function randomCode(len: number): string {
  const bytes = randomBytes(len);
  let out = '';
  for (let i = 0; i < len; i++) out += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
  return out;
}
