import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { StorageService } from '../storage/storage.service';
import { slugify } from '../utils/slugify';
import { AuthenticatedUser } from '../auth/types/auth.types';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { QueryProductDto } from './dto/query-product.dto';
import { WhatsappMarketingService } from '../whatsapp/whatsapp-marketing.service';
import { MetaCatalogService, CatalogProduct } from '../meta-catalog/meta-catalog.service';

const CACHE_TTL = 300;
// v2: cache namespace bumped after public responses started stripping internal
// fields — prevents serving pre-fix cached payloads that still carried them.
const keyItem = (slug: string) => `products:item:v2:${slug}`;

const INCLUDE_FULL = {
  category: true,
  images: { orderBy: { position: 'asc' as const } },
  createdBy: { select: { id: true, name: true, email: true } },
};

// Public listings/detail only need catalog data — no internal joins.
const INCLUDE_PUBLIC = {
  category: true,
  images: { orderBy: { position: 'asc' as const } },
};

// Internal-only columns that must never reach unauthenticated clients.
const PUBLIC_OMIT_KEYS = [
  'ncm',
  'cfop',
  'cstCsosn',
  'origem',
  'internalCode',
  'whatsappGroupIds',
  'autoPublishWhatsapp',
  'createdById',
  'createdBy',
] as const;

function toPublicProduct<T extends Record<string, unknown>>(product: T): Partial<T> {
  const copy: Record<string, unknown> = { ...product };
  for (const key of PUBLIC_OMIT_KEYS) delete copy[key];
  return copy as Partial<T>;
}

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
    private readonly whatsappMarketing: WhatsappMarketingService,
    private readonly metaCatalog: MetaCatalogService,
  ) {}

  private generateSku(name: string): string {
    const prefix = name
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, '')
      .slice(0, 3)
      .padEnd(3, 'X');
    const rand = Math.random().toString(36).slice(2, 7).toUpperCase();
    return `${prefix}-${rand}`;
  }

  private async auditLog(action: string, userId?: string, metadata?: object) {
    try {
      await this.prisma.auditLog.create({
        data: {
          action,
          userId,
          metadata: metadata as Prisma.InputJsonValue | undefined,
        },
      });
    } catch (_) {
      // fire-and-forget: audit failures must not break business operations
    }
  }

  private toCatalogProduct(p: {
    id: string;
    name: string;
    slug: string;
    price: Prisma.Decimal;
    salePrice: Prisma.Decimal | null;
    description: string | null;
    shortDescription: string | null;
    stock: number;
    brand: string | null;
    images: { url: string }[];
  }): CatalogProduct {
    return {
      id: p.id,
      name: p.name,
      slug: p.slug,
      price: p.price.toNumber(),
      salePrice: p.salePrice?.toNumber() ?? null,
      description: p.description,
      shortDescription: p.shortDescription,
      stock: p.stock,
      brand: p.brand,
      images: p.images,
    };
  }

  private async connectImagesWithPosition(imageIds: string[], productId: string) {
    if (!imageIds.length) return;
    await Promise.all(
      imageIds.map((id, index) =>
        this.prisma.image.update({
          where: { id },
          data: { productId, position: index },
        }),
      ),
    );
  }

  async create(dto: CreateProductDto, userId?: string) {
    const slug = dto.slug ?? slugify(dto.name);
    const sku = dto.sku || this.generateSku(dto.name);

    const [slugConflict, skuConflict] = await Promise.all([
      this.prisma.product.findUnique({ where: { slug } }),
      this.prisma.product.findUnique({ where: { sku } }),
    ]);
    if (slugConflict) throw new ConflictException('Já existe um produto com esse slug.');
    if (skuConflict) throw new ConflictException('Já existe um produto com esse SKU.');

    // Inherit NCM from category if not explicitly provided
    let ncm = dto.ncm;
    if (!ncm && dto.categoryId) {
      const cat = await this.prisma.category.findUnique({
        where: { id: dto.categoryId },
        select: { ncm: true },
      });
      ncm = cat?.ncm ?? undefined;
    }

    const product = await this.prisma.product.create({
      data: {
        name: dto.name,
        slug,
        sku,
        internalCode: dto.internalCode,
        brand: dto.brand,
        shortDescription: dto.shortDescription,
        description: dto.description,
        price: dto.price,
        salePrice: dto.salePrice,
        weight: dto.weight,
        dimensions: dto.dimensions as unknown as Prisma.InputJsonValue,
        stock: dto.stock ?? 0,
        minimumStock: dto.minimumStock ?? 0,
        pickupAvailable: dto.pickupAvailable ?? false,
        featuredOffer: dto.featuredOffer ?? false,
        status: dto.status,
        autoPublishWhatsapp: dto.autoPublishWhatsapp ?? false,
        whatsappGroupIds: dto.whatsappGroupIds ?? [],
        categoryId: dto.categoryId,
        metaTitle: dto.metaTitle,
        metaDescription: dto.metaDescription,
        ncm,
        origem: dto.origem ?? 0,
        cfop: dto.cfop,
        cstCsosn: dto.cstCsosn,
        createdById: userId,
      },
      include: INCLUDE_FULL,
    });

    if (dto.imageIds?.length) {
      await this.connectImagesWithPosition(dto.imageIds, product.id);
    }

    await this.redis.delPattern('products:*');
    await this.auditLog('PRODUCT_CREATED', userId, { productId: product.id, name: product.name });

    if (product.status === 'ACTIVE') {
      this.whatsappMarketing.publishProduct(product, product.whatsappGroupIds).catch(() => {});
    }

    if (product.status === 'ACTIVE') {
      this.metaCatalog.upsert(this.toCatalogProduct(product));
    }

    return serializeProduct(product);
  }

  async findAll(query: QueryProductDto, isStaff = false) {
    const scope = isStaff ? 'staff' : 'public';
    const cacheKey = `products:list:${scope}:${Buffer.from(JSON.stringify(query)).toString('base64url')}`;
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
      createdById,
    } = query;

    const where: Prisma.ProductWhereInput = {
      ...(search && {
        OR: [
          { name: { contains: search, mode: 'insensitive' } },
          { description: { contains: search, mode: 'insensitive' } },
          { sku: { contains: search, mode: 'insensitive' } },
          { brand: { contains: search, mode: 'insensitive' } },
          { internalCode: { contains: search, mode: 'insensitive' } },
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
      ...(createdById && { createdById }),
      ...(query.featuredOffer === true && { featuredOffer: true }),
    };

    const [items, total] = await Promise.all([
      this.prisma.product.findMany({
        where,
        include: isStaff ? INCLUDE_FULL : INCLUDE_PUBLIC,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { [sortBy]: sortOrder },
      }),
      this.prisma.product.count({ where }),
    ]);

    const serialized = items.map(serializeProduct);
    const result = {
      data: isStaff ? serialized : serialized.map(toPublicProduct),
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
      include: INCLUDE_PUBLIC,
    });
    if (!product) throw new NotFoundException('Produto não encontrado.');

    const serialized = toPublicProduct(serializeProduct(product));
    await this.redis.setJson(keyItem(slug), serialized, CACHE_TTL);
    return serialized;
  }

  async findById(id: string) {
    const product = await this.prisma.product.findUnique({
      where: { id },
      include: INCLUDE_FULL,
    });
    if (!product) throw new NotFoundException('Produto não encontrado.');
    return serializeProduct(product);
  }

  async update(id: string, dto: UpdateProductDto, user: AuthenticatedUser) {
    const existing = await this.prisma.product.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Produto não encontrado.');

    if (user.role === Role.VENDEDOR && existing.createdById !== user.id) {
      throw new ForbiddenException('Você só pode editar seus próprios produtos.');
    }

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

    await this.prisma.product.update({
      where: { id },
      data: {
        ...rest,
        slug,
        dimensions: dimensions as unknown as Prisma.InputJsonValue | undefined,
      },
    });

    if (imageIds !== undefined) {
      await this.prisma.image.updateMany({
        where: { productId: id, id: { notIn: imageIds } },
        data: { productId: null },
      });
      if (imageIds.length) {
        await this.connectImagesWithPosition(imageIds, id);
      }
    }

    await this.redis.delPattern('products:*');
    await this.auditLog('PRODUCT_UPDATED', user.id, { productId: id, changes: Object.keys(rest) });

    const updated = await this.prisma.product.findUnique({ where: { id }, include: INCLUDE_FULL });

    const isActive = (updated?.status ?? existing.status) === 'ACTIVE';
    const justActivated = dto.status === 'ACTIVE' && existing.status !== 'ACTIVE';
    const justEnabledWhatsapp = dto.autoPublishWhatsapp === true && !existing.autoPublishWhatsapp;
    const shouldPublish =
      isActive && updated?.autoPublishWhatsapp && (justActivated || justEnabledWhatsapp);
    if (shouldPublish && updated) {
      this.whatsappMarketing.publishProduct(updated, updated.whatsappGroupIds).catch(() => {});
    }

    if (updated) {
      if (updated.status === 'ACTIVE') {
        this.metaCatalog.upsert(this.toCatalogProduct(updated));
      } else {
        this.metaCatalog.remove(updated.id, updated.name);
      }
    }

    return serializeProduct(updated!);
  }

  async updateStock(id: string, stock: number, user: AuthenticatedUser) {
    const existing = await this.prisma.product.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Produto não encontrado.');

    if (user.role === Role.VENDEDOR && existing.createdById !== user.id) {
      throw new ForbiddenException('Você só pode alterar o estoque dos seus próprios produtos.');
    }

    const updated = await this.prisma.product.update({
      where: { id },
      data: { stock, ...(stock <= 0 && { status: 'INACTIVE' as const }) },
      include: { category: true, images: { orderBy: { position: 'asc' } } },
    });

    await this.redis.delPattern('products:*');
    await this.auditLog('PRODUCT_STOCK_UPDATED', user.id, {
      productId: id,
      previousStock: existing.stock,
      newStock: stock,
    });

    this.metaCatalog.upsert(this.toCatalogProduct(updated));

    return serializeProduct(updated);
  }

  async getMinOfferDiscount(): Promise<{ discountPct: number }> {
    const offers = await this.prisma.product.findMany({
      where: { featuredOffer: true, status: 'ACTIVE', salePrice: { not: null } },
      select: { price: true, salePrice: true },
    });

    if (!offers.length) return { discountPct: 0 };

    const discounts = offers
      .map((p) => {
        const price = p.price.toNumber();
        const sale = (p.salePrice as Prisma.Decimal).toNumber();
        if (price <= 0 || sale >= price) return 0;
        return Math.round(((price - sale) / price) * 100);
      })
      .filter((d) => d > 0);

    if (!discounts.length) return { discountPct: 0 };
    return { discountPct: Math.min(...discounts) };
  }

  async remove(id: string, user: AuthenticatedUser) {
    const existing = await this.prisma.product.findUnique({
      where: { id },
      include: { images: { select: { key: true } } },
    });
    if (!existing) throw new NotFoundException('Produto não encontrado.');

    if (user.role === Role.VENDEDOR && existing.createdById !== user.id) {
      throw new ForbiddenException('Você não pode excluir produtos de outros usuários.');
    }

    const keys = existing.images.map((i) => i.key);
    if (keys.length) await this.storage.deleteManyByKeys(keys);

    await this.prisma.product.delete({ where: { id } });
    await this.redis.delPattern('products:*');
    await this.auditLog('PRODUCT_DELETED', user.id, { productId: id, name: existing.name });

    this.metaCatalog.remove(id, existing.name);
  }
}
