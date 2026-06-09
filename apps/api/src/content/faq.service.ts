import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateFaqDto } from './dto/create-faq.dto';
import { UpdateFaqDto } from './dto/update-faq.dto';

@Injectable()
export class FaqService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(category?: string) {
    return this.prisma.faq.findMany({
      where: { active: true, ...(category ? { category } : {}) },
      orderBy: [{ category: 'asc' }, { position: 'asc' }],
    });
  }

  async findAllAdmin() {
    return this.prisma.faq.findMany({ orderBy: [{ category: 'asc' }, { position: 'asc' }] });
  }

  async create(dto: CreateFaqDto) {
    return this.prisma.faq.create({ data: dto });
  }

  async update(id: string, dto: UpdateFaqDto) {
    const item = await this.prisma.faq.findUnique({ where: { id } });
    if (!item) throw new NotFoundException('Item não encontrado.');
    return this.prisma.faq.update({ where: { id }, data: dto });
  }

  async remove(id: string) {
    const item = await this.prisma.faq.findUnique({ where: { id } });
    if (!item) throw new NotFoundException('Item não encontrado.');
    return this.prisma.faq.delete({ where: { id } });
  }
}
