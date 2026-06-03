import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { StorageService } from '../storage/storage.service';
import { slugify } from '../utils/slugify';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';
import { QueryCategoryDto } from './dto/query-category.dto';

const CACHE_TTL = 1800; // 30 minutes — categories change rarely
const KEY_LIST = 'categories:list';
const keyItem = (slug: string) => `categories:item:${slug}`;

@Injectable()
export class CategoriesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly storage: StorageService,
  ) {}

  async create(dto: CreateCategoryDto) {
    const slug = dto.slug ?? slugify(dto.name);

    const existing = await this.prisma.category.findUnique({ where: { slug } });
    if (existing) throw new ConflictException('Já existe uma categoria com esse slug.');

    const category = await this.prisma.category.create({
      data: { name: dto.name, slug, description: dto.description },
    });

    await this.redis.delPattern('categories:*');
    return category;
  }

  async findAll(query: QueryCategoryDto) {
    const { page = 1, limit = 20, search } = query;
    const cacheKey = `${KEY_LIST}:${page}:${limit}:${search ?? ''}`;

    const cached = await this.redis.getJson(cacheKey);
    if (cached) return cached;

    const where = search ? { name: { contains: search, mode: 'insensitive' as const } } : undefined;

    const [data, total] = await Promise.all([
      this.prisma.category.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { name: 'asc' },
        include: { _count: { select: { products: true } } },
      }),
      this.prisma.category.count({ where }),
    ]);

    const result = { data, total, page, limit, totalPages: Math.ceil(total / limit) };
    await this.redis.setJson(cacheKey, result, CACHE_TTL);
    return result;
  }

  async findBySlug(slug: string) {
    const cached = await this.redis.getJson(keyItem(slug));
    if (cached) return cached;

    const category = await this.prisma.category.findUnique({
      where: { slug },
      include: { _count: { select: { products: true } } },
    });
    if (!category) throw new NotFoundException('Categoria não encontrada.');

    await this.redis.setJson(keyItem(slug), category, CACHE_TTL);
    return category;
  }

  async update(id: string, dto: UpdateCategoryDto) {
    const existing = await this.prisma.category.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Categoria não encontrada.');

    if (dto.slug && dto.slug !== existing.slug) {
      const conflict = await this.prisma.category.findUnique({ where: { slug: dto.slug } });
      if (conflict) throw new ConflictException('Slug já em uso.');
    }

    const slug = dto.name && !dto.slug ? slugify(dto.name) : (dto.slug ?? existing.slug);

    const updated = await this.prisma.category.update({
      where: { id },
      data: { ...dto, slug },
    });

    await this.redis.delPattern('categories:*');
    return updated;
  }

  async remove(id: string) {
    const existing = await this.prisma.category.findUnique({
      where: { id },
      include: { images: { select: { key: true } } },
    });
    if (!existing) throw new NotFoundException('Categoria não encontrada.');

    const keys = existing.images.map((i) => i.key);
    if (keys.length) await this.storage.deleteManyByKeys(keys);

    await this.prisma.category.delete({ where: { id } });
    await this.redis.delPattern('categories:*');
  }
}
