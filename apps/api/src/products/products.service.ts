import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { StorageService } from '../storage/storage.service';
import { slugify } from '../utils/slugify';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { QueryProductDto } from './dto/query-product.dto';

const CACHE_TTL = 300; // 5 minutes
const keyItem = (slug: string) => `products:item:${slug}`;

function serializeProduct<
  T extends {
    price: Prisma.Decimal;
    salePrice: Prisma.Decimal | null;
    weight: Prisma.Decimal | null;
  },
>(p: T) {
  return {
    ...p,
    price: p.price.toNumber(),
    salePrice: p.salePrice?.toNumber() ?? null,
    weight: p.weight?.toNumber() ?? null,
  };
}

@Injectable()
export class ProductsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly storage: StorageService,
  ) {}

  async create(dto: CreateProductDto) {
    const slug = dto.slug ?? slugify(dto.name);

    const [slugConflict, skuConflict] = await Promise.all([
      this.prisma.product.findUnique({ where: { slug } }),
      this.prisma.product.findUnique({ where: { sku: dto.sku } }),
    ]);
    if (slugConflict) throw new ConflictException('Já existe um produto com esse slug.');
    if (skuConflict) throw new ConflictException('Já existe um produto com esse SKU.');

    const product = await this.prisma.product.create({
      data: {
        name: dto.name,
        slug,
        sku: dto.sku,
        brand: dto.brand,
        description: dto.description,
        price: dto.price,
        salePrice: dto.salePrice,
        weight: dto.weight,
        dimensions: dto.dimensions as unknown as Prisma.InputJsonValue,
        stock: dto.stock ?? 0,
        status: dto.status,
        categoryId: dto.categoryId,
      },
      include: { category: true, images: true },
    });

    if (dto.imageIds?.length) {
      await this.storage.connectImages(dto.imageIds, 'productId', product.id);
    }

    await this.redis.delPattern('products:*');
    return serializeProduct(product);
  }

  async findAll(query: QueryProductDto) {
    const cacheKey = `products:list:${Buffer.from(JSON.stringify(query)).toString('base64url')}`;
    const cached = await this.redis.getJson(cacheKey);
    if (cached) return cached;

    const {
      page = 1,
      limit = 20,
      search,
      categoryId,
      categorySlug,
      status,
      minPrice,
      maxPrice,
      brand,
      inStock,
      sortBy = 'createdAt',
      sortOrder = 'desc',
    } = query;

    const where: Prisma.ProductWhereInput = {
      ...(search && {
        OR: [
          { name: { contains: search, mode: 'insensitive' } },
          { description: { contains: search, mode: 'insensitive' } },
          { sku: { contains: search, mode: 'insensitive' } },
          { brand: { contains: search, mode: 'insensitive' } },
        ],
      }),
      ...(categoryId && { categoryId }),
      ...(categorySlug && { category: { slug: categorySlug } }),
      ...(status && { status }),
      ...((minPrice !== undefined || maxPrice !== undefined) && {
        price: {
          ...(minPrice !== undefined && { gte: new Prisma.Decimal(minPrice) }),
          ...(maxPrice !== undefined && { lte: new Prisma.Decimal(maxPrice) }),
        },
      }),
      ...(brand && { brand: { contains: brand, mode: 'insensitive' } }),
      ...(inStock === true && { stock: { gt: 0 } }),
    };

    const [items, total] = await Promise.all([
      this.prisma.product.findMany({
        where,
        include: { category: true, images: true },
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { [sortBy]: sortOrder },
      }),
      this.prisma.product.count({ where }),
    ]);

    const result = {
      data: items.map(serializeProduct),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };

    await this.redis.setJson(cacheKey, result, CACHE_TTL);
    return result;
  }

  async findBySlug(slug: string) {
    const cached = await this.redis.getJson(keyItem(slug));
    if (cached) return cached;

    const product = await this.prisma.product.findUnique({
      where: { slug },
      include: { category: true, images: true },
    });
    if (!product) throw new NotFoundException('Produto não encontrado.');

    const serialized = serializeProduct(product);
    await this.redis.setJson(keyItem(slug), serialized, CACHE_TTL);
    return serialized;
  }

  async update(id: string, dto: UpdateProductDto) {
    const existing = await this.prisma.product.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Produto não encontrado.');

    if (dto.slug && dto.slug !== existing.slug) {
      const conflict = await this.prisma.product.findUnique({ where: { slug: dto.slug } });
      if (conflict) throw new ConflictException('Slug já em uso.');
    }

    if (dto.sku && dto.sku !== existing.sku) {
      const conflict = await this.prisma.product.findUnique({ where: { sku: dto.sku } });
      if (conflict) throw new ConflictException('SKU já em uso.');
    }

    const { imageIds, dimensions, ...rest } = dto;
    const slug = rest.name && !rest.slug ? slugify(rest.name) : (rest.slug ?? existing.slug);

    const updated = await this.prisma.product.update({
      where: { id },
      data: {
        ...rest,
        slug,
        dimensions: dimensions as unknown as Prisma.InputJsonValue | undefined,
      },
      include: { category: true, images: true },
    });

    if (imageIds?.length) {
      await this.storage.connectImages(imageIds, 'productId', id);
      const withImages = await this.prisma.product.findUnique({
        where: { id },
        include: { category: true, images: true },
      });
      await this.redis.delPattern('products:*');
      return serializeProduct(withImages!);
    }

    await this.redis.delPattern('products:*');
    return serializeProduct(updated);
  }

  async remove(id: string) {
    const existing = await this.prisma.product.findUnique({
      where: { id },
      include: { images: { select: { key: true } } },
    });
    if (!existing) throw new NotFoundException('Produto não encontrado.');

    const keys = existing.images.map((i) => i.key);
    if (keys.length) await this.storage.deleteManyByKeys(keys);

    await this.prisma.product.delete({ where: { id } });
    await this.redis.delPattern('products:*');
  }
}
