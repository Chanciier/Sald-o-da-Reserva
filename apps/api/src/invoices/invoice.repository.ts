import { Injectable } from '@nestjs/common';
import { InvoiceStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { QueryInvoiceDto } from './dto/query-invoice.dto';

export const INVOICE_INCLUDE = {
  order: {
    include: {
      user: { select: { id: true, name: true, email: true } },
      items: true,
      payment: { select: { method: true, status: true, amount: true } },
    },
  },
} as const;

@Injectable()
export class InvoiceRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(data: Prisma.InvoiceCreateInput) {
    return this.prisma.invoice.create({ data, include: INVOICE_INCLUDE });
  }

  async findById(id: string) {
    return this.prisma.invoice.findUnique({ where: { id }, include: INVOICE_INCLUDE });
  }

  async findByOrderId(orderId: string) {
    return this.prisma.invoice.findFirst({
      where: { orderId },
      orderBy: { createdAt: 'desc' },
      include: INVOICE_INCLUDE,
    });
  }

  async findPending() {
    return this.prisma.invoice.findMany({
      where: { status: { in: ['PENDING', 'PROCESSING'] }, enotasId: { not: null } },
      include: INVOICE_INCLUDE,
    });
  }

  async update(id: string, data: Prisma.InvoiceUpdateInput) {
    return this.prisma.invoice.update({ where: { id }, data, include: INVOICE_INCLUDE });
  }

  async findAll(query: QueryInvoiceDto, createdById?: string) {
    const {
      page = 1,
      limit = 20,
      invoiceNumber,
      orderId,
      search,
      status,
      dateFrom,
      dateTo,
    } = query;

    const where: Prisma.InvoiceWhereInput = {
      ...(invoiceNumber && { invoiceNumber: { contains: invoiceNumber, mode: 'insensitive' } }),
      ...(orderId && { orderId }),
      ...(status && { status }),
      ...(dateFrom || dateTo
        ? {
            createdAt: {
              ...(dateFrom && { gte: new Date(dateFrom) }),
              ...(dateTo && { lte: new Date(dateTo) }),
            },
          }
        : {}),
      ...(search && {
        OR: [
          { invoiceNumber: { contains: search, mode: 'insensitive' } },
          { orderId: { contains: search, mode: 'insensitive' } },
          { order: { user: { name: { contains: search, mode: 'insensitive' } } } },
          { order: { user: { email: { contains: search, mode: 'insensitive' } } } },
        ],
      }),
      ...(createdById && { order: { userId: createdById } }),
    };

    const [items, total] = await Promise.all([
      this.prisma.invoice.findMany({
        where,
        include: INVOICE_INCLUDE,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.invoice.count({ where }),
    ]);

    return { data: items, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async countByStatus(): Promise<Record<InvoiceStatus, number>> {
    const rows = await this.prisma.invoice.groupBy({
      by: ['status'],
      _count: { id: true },
    });
    const result = {} as Record<InvoiceStatus, number>;
    for (const row of rows) result[row.status] = row._count.id;
    return result;
  }
}
