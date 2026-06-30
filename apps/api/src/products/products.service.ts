import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Marketplace, Prisma, ProductStatus, Role, SyncAction } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { StorageService } from '../storage/storage.service';
import { slugify } from '../utils/slugify';
import { AuthenticatedUser } from '../auth/types/auth.types';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { QueryProductDto } from './dto/query-product.dto';
import { WhatsappMarketingService } from '../whatsapp/whatsapp-marketing.service';
import { MarketplaceHubService } from '../marketplace/marketplace-hub.service';

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
    private readonly marketplaceHub: MarketplaceHubService,
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
        isUnique: dto.isUnique ?? false,
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

    // OMS: cria jobs de publicação nos marketplaces escolhidos. SITE é sempre
    // incluído (canal próprio). Enfileiramento nunca lança — se um marketplace
    // falhar, o erro fica visível no painel e o cadastro no site segue normal.
    const targets = [...new Set<Marketplace>([Marketplace.SITE, ...(dto.publishTo ?? [])])];
    await this.marketplaceHub.enqueuePublish(product.id, targets);

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

    // OMS: no catálogo público, esconde itens reservados/vendidos/indisponíveis.
    // Restringe apenas os status novos do OMS — não altera o comportamento já
    // existente para ACTIVE/INACTIVE/etc. quando o cliente não filtra por status.
    if (!isStaff && !status) {
      where.status = {
        notIn: [
          ProductStatus.RESERVED,
          ProductStatus.SOLD,
          ProductStatus.UNAVAILABLE,
          ProductStatus.REMOVED,
        ],
      };
    }

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

    // OMS: sincroniza apenas o que mudou, e só para os marketplaces onde o
    // produto está publicado (enqueueSync é no-op se não houver publicações).
    await this.enqueueSyncForChanges(id, existing, dto, dimensions !== undefined, updated);

    return serializeProduct(updated!);
  }

  /** Detecta campos relevantes alterados e dispara os jobs de sync adequados. */
  private async enqueueSyncForChanges(
    id: string,
    existing: {
      name: string;
      description: string | null;
      shortDescription: string | null;
      price: Prisma.Decimal;
      salePrice: Prisma.Decimal | null;
      weight: Prisma.Decimal | null;
      stock: number;
    },
    dto: UpdateProductDto,
    dimensionsChanged: boolean,
    updated: { price: Prisma.Decimal; salePrice: Prisma.Decimal | null; stock: number } | null,
  ): Promise<void> {
    const priceChanged =
      (dto.price !== undefined && dto.price !== existing.price.toNumber()) ||
      (dto.salePrice !== undefined &&
        dto.salePrice !== (existing.salePrice?.toNumber() ?? undefined));
    const stockChanged = dto.stock !== undefined && dto.stock !== existing.stock;
    const contentChanged =
      (dto.name !== undefined && dto.name !== existing.name) ||
      (dto.description !== undefined && dto.description !== existing.description) ||
      (dto.shortDescription !== undefined && dto.shortDescription !== existing.shortDescription) ||
      (dto.weight !== undefined && dto.weight !== (existing.weight?.toNumber() ?? undefined)) ||
      dimensionsChanged ||
      dto.imageIds !== undefined;

    // Update completo cobre preço/estoque; granular só quando nada mais mudou.
    if (contentChanged) {
      await this.marketplaceHub.enqueueSync(id, SyncAction.UPDATE);
      return;
    }
    if (priceChanged) {
      const price = updated?.salePrice?.toNumber() ?? updated?.price.toNumber() ?? 0;
      await this.marketplaceHub.enqueueSync(id, SyncAction.UPDATE_PRICE, price);
    }
    if (stockChanged) {
      await this.marketplaceHub.enqueueSync(id, SyncAction.UPDATE_STOCK, updated?.stock ?? 0);
    }
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

    // OMS: propaga o novo estoque aos marketplaces onde o produto está publicado.
    if (stock !== existing.stock) {
      await this.marketplaceHub.enqueueSync(id, SyncAction.UPDATE_STOCK, stock);
    }

    return serializeProduct(updated);
  }

  // Returns the HIGHEST discount among featured offers — used for the "Até X% OFF"
  // headline on the landing page ("até" = up to, so it must be the ceiling).
  async getMaxOfferDiscount(): Promise<{ discountPct: number }> {
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
    return { discountPct: Math.max(...discounts) };
  }

  async remove(id: string, user: AuthenticatedUser) {
    const existing = await this.prisma.product.findUnique({
      where: { id },
      include: {
        images: { select: { key: true } },
        _count: { select: { orderItems: true } },
      },
    });
    if (!existing) throw new NotFoundException('Produto não encontrado.');

    if (user.role === Role.VENDEDOR && existing.createdById !== user.id) {
      throw new ForbiddenException('Você não pode excluir produtos de outros usuários.');
    }

    // Produtos vinculados a pedidos não podem ser apagados — a FK de OrderItem é
    // Restrict para preservar o histórico. Nesse caso fazemos soft-delete (arquiva),
    // removendo da loja sem corromper pedidos passados.
    if (existing._count.orderItems > 0) {
      await this.prisma.product.update({
        where: { id },
        data: { status: 'ARCHIVED' as const, stock: 0 },
      });
      await this.redis.delPattern('products:*');
      await this.auditLog('PRODUCT_ARCHIVED', user.id, { productId: id, name: existing.name });

      return { archived: true };
    }

    const keys = existing.images.map((i) => i.key);
    if (keys.length) await this.storage.deleteManyByKeys(keys);

    await this.prisma.product.delete({ where: { id } });
    await this.redis.delPattern('products:*');
    await this.auditLog('PRODUCT_DELETED', user.id, { productId: id, name: existing.name });

    return { archived: false };
  }
}
