import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCouponDto } from './dto/create-coupon.dto';
import { UpdateCouponDto } from './dto/update-coupon.dto';

function serializeCoupon<
  T extends {
    value: { toNumber(): number };
    minOrderValue?: { toNumber(): number } | null;
    maxDiscount?: { toNumber(): number } | null;
  },
>(c: T) {
  return {
    ...c,
    value: c.value.toNumber(),
    minOrderValue: c.minOrderValue?.toNumber() ?? null,
    maxDiscount: c.maxDiscount?.toNumber() ?? null,
  };
}

@Injectable()
export class CouponsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateCouponDto) {
    const exists = await this.prisma.coupon.findUnique({ where: { code: dto.code } });
    if (exists) throw new ConflictException('Já existe um cupom com esse código.');

    const coupon = await this.prisma.coupon.create({
      data: {
        code: dto.code,
        description: dto.description,
        type: dto.type,
        value: dto.value,
        minOrderValue: dto.minOrderValue,
        maxDiscount: dto.maxDiscount,
        usageLimit: dto.usageLimit,
        isActive: dto.isActive ?? true,
        expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : null,
      },
    });

    return serializeCoupon(coupon);
  }

  async findAll() {
    const coupons = await this.prisma.coupon.findMany({ orderBy: { createdAt: 'desc' } });
    return coupons.map(serializeCoupon);
  }

  async findByCode(code: string) {
    const coupon = await this.prisma.coupon.findUnique({
      where: { code: code.toUpperCase() },
    });
    if (!coupon) throw new NotFoundException('Cupom não encontrado.');
    return serializeCoupon(coupon);
  }

  async update(id: string, dto: UpdateCouponDto) {
    const existing = await this.prisma.coupon.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Cupom não encontrado.');

    if (dto.code && dto.code !== existing.code) {
      const conflict = await this.prisma.coupon.findUnique({ where: { code: dto.code } });
      if (conflict) throw new ConflictException('Código já em uso.');
    }

    const coupon = await this.prisma.coupon.update({
      where: { id },
      data: {
        ...(dto.code && { code: dto.code }),
        ...(dto.description !== undefined && { description: dto.description }),
        ...(dto.type && { type: dto.type }),
        ...(dto.value !== undefined && { value: dto.value }),
        ...(dto.minOrderValue !== undefined && { minOrderValue: dto.minOrderValue }),
        ...(dto.maxDiscount !== undefined && { maxDiscount: dto.maxDiscount }),
        ...(dto.usageLimit !== undefined && { usageLimit: dto.usageLimit }),
        ...(dto.isActive !== undefined && { isActive: dto.isActive }),
        ...(dto.expiresAt !== undefined && {
          expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : null,
        }),
      },
    });

    return serializeCoupon(coupon);
  }

  async remove(id: string) {
    const existing = await this.prisma.coupon.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Cupom não encontrado.');
    await this.prisma.coupon.delete({ where: { id } });
  }
}
