import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateLegalPageDto } from './dto/update-legal-page.dto';

@Injectable()
export class LegalPagesService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll() {
    return this.prisma.legalPage.findMany({ orderBy: { slug: 'asc' } });
  }

  async findBySlug(slug: string, includeUnpublished = false) {
    const page = await this.prisma.legalPage.findUnique({ where: { slug } });
    if (!page) throw new NotFoundException('Página não encontrada.');
    if (!includeUnpublished && !page.published)
      throw new NotFoundException('Página não disponível.');
    return page;
  }

  async update(slug: string, dto: UpdateLegalPageDto) {
    const page = await this.prisma.legalPage.findUnique({ where: { slug } });
    if (!page) throw new NotFoundException('Página não encontrada.');
    const hasContentChange = dto.content !== undefined || dto.title !== undefined;
    return this.prisma.legalPage.update({
      where: { slug },
      data: {
        ...dto,
        ...(hasContentChange ? { version: { increment: 1 } } : {}),
      },
    });
  }
}
