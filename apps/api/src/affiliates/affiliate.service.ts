import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { CommissionStatus, Prisma } from '@prisma/client';
import { randomBytes } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateAffiliateConfigDto } from './dto/update-config.dto';

const CONFIG_ID = 'singleton';

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

// Avoids ambiguous chars (0/O, 1/I) for codes that people type/share.
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

@Injectable()
export class AffiliateService {
  private readonly logger = new Logger(AffiliateService.name);

  constructor(private readonly prisma: PrismaService) {}

  // ── Config (singleton row) ──────────────────────────────────────────────────

  async getConfig() {
    const existing = await this.prisma.affiliateConfig.findUnique({ where: { id: CONFIG_ID } });
    if (existing) return existing;
    return this.prisma.affiliateConfig.create({ data: { id: CONFIG_ID } });
  }

  async getPublicConfig() {
    const cfg = await this.getConfig();
    return {
      commissionRate: cfg.commissionRate.toNumber(),
      cookieDays: cfg.cookieDays,
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
        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
      },
    });
    return {
      commissionRate: cfg.commissionRate.toNumber(),
      cookieDays: cfg.cookieDays,
      isActive: cfg.isActive,
    };
  }

  // ── Affiliate profile (self-service) ────────────────────────────────────────

  async getMyDashboard(userId: string) {
    const affiliate = await this.prisma.affiliate.findUnique({ where: { userId } });
    const config = await this.getPublicConfig();

    if (!affiliate) {
      return { affiliate: null, config, totals: emptyTotals(), commissions: [] };
    }

    const [commissions, grouped] = await Promise.all([
      this.prisma.commission.findMany({
        where: { affiliateId: affiliate.id },
        orderBy: { createdAt: 'desc' },
        take: 100,
        include: { order: { select: { id: true, total: true, createdAt: true } } },
      }),
      this.prisma.commission.groupBy({
        by: ['status'],
        where: { affiliateId: affiliate.id },
        _sum: { amount: true },
        _count: { _all: true },
      }),
    ]);

    return {
      affiliate: { id: affiliate.id, code: affiliate.code, isActive: affiliate.isActive },
      config,
      totals: summarize(grouped),
      commissions: commissions.map((c) => ({
        id: c.id,
        orderId: c.orderId,
        baseAmount: c.baseAmount.toNumber(),
        rate: c.rate.toNumber(),
        amount: c.amount.toNumber(),
        status: c.status,
        createdAt: c.createdAt,
        paidAt: c.paidAt,
        orderTotal: c.order ? c.order.total.toNumber() : null,
      })),
    };
  }

  async activate(userId: string) {
    const existing = await this.prisma.affiliate.findUnique({ where: { userId } });
    if (existing) return { id: existing.id, code: existing.code, isActive: existing.isActive };

    const code = await this.generateUniqueCode();
    const affiliate = await this.prisma.affiliate.create({ data: { userId, code } });
    this.logger.log(`Affiliate ativado: user=${userId} code=${code}`);
    return { id: affiliate.id, code: affiliate.code, isActive: affiliate.isActive };
  }

  // ── Attribution (chamado pelo checkout) ─────────────────────────────────────

  /** Resolve o affiliateId a partir do código do cookie. Null se inválido/auto-indicação. */
  async resolveAffiliateId(code: string | undefined, buyerUserId: string): Promise<string | null> {
    if (!code) return null;
    const config = await this.getConfig();
    if (!config.isActive) return null;

    const affiliate = await this.prisma.affiliate.findUnique({
      where: { code: code.trim().toUpperCase() },
    });
    if (!affiliate || !affiliate.isActive) return null;
    if (affiliate.userId === buyerUserId) return null; // sem auto-indicação
    return affiliate.id;
  }

  // ── Ciclo de vida da comissão (chamado pelo webhook) ────────────────────────

  /** Cria comissão PENDENTE quando o pedido é pago. Idempotente. */
  async createCommissionForOrder(orderId: string): Promise<void> {
    const order = await this.prisma.order.findUnique({ where: { id: orderId } });
    if (!order?.affiliateId) return;

    const existing = await this.prisma.commission.findUnique({ where: { orderId } });
    if (existing) return;

    const config = await this.getConfig();
    const rate = config.commissionRate.toNumber();
    const baseAmount = Math.max(0, order.subtotal.toNumber() - order.discount.toNumber());
    const amount = round2((baseAmount * rate) / 100);

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
      data: { status: CommissionStatus.CANCELLED },
    });
    this.logger.log(`Comissão cancelada (reembolso): order=${orderId}`);
  }

  // ── Admin ───────────────────────────────────────────────────────────────────

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

function emptyTotals() {
  return { pending: 0, paid: 0, cancelled: 0, conversions: 0 };
}

function summarize(
  grouped: Array<{
    status: CommissionStatus;
    _sum: { amount: Prisma.Decimal | null };
    _count: { _all: number };
  }>,
) {
  const totals = emptyTotals();
  for (const g of grouped) {
    const sum = g._sum.amount?.toNumber() ?? 0;
    if (g.status === CommissionStatus.PENDING) totals.pending = sum;
    if (g.status === CommissionStatus.PAID) totals.paid = sum;
    if (g.status === CommissionStatus.CANCELLED) totals.cancelled = sum;
    totals.conversions += g._count._all;
  }
  return totals;
}
