import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';

const GRAPH_API = 'https://graph.facebook.com/v20.0';
const RETRY_DELAYS = [0, 1_000, 3_000];

type CatalogMethod = 'CREATE' | 'UPDATE' | 'DELETE';

interface ItemData {
  name: string;
  description: string;
  price: number; // cents
  currency: string;
  availability: 'in stock' | 'out of stock';
  condition: 'new' | 'refurbished' | 'used';
  image_url: string;
  url: string;
  brand?: string;
  retailer_id: string;
}

interface BatchRequest {
  method: CatalogMethod;
  retailer_id: string;
  data?: ItemData;
}

export interface CatalogProduct {
  id: string;
  name: string;
  slug: string;
  price: number;
  salePrice: number | null;
  description: string | null;
  shortDescription: string | null;
  stock: number;
  brand: string | null;
  images: { url: string }[];
}

@Injectable()
export class MetaCatalogService {
  private readonly logger = new Logger(MetaCatalogService.name);
  private readonly catalogId: string;
  private readonly accessToken: string;
  private readonly siteUrl: string;
  private readonly enabled: boolean;

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    this.catalogId = this.config.get<string>('META_CATALOG_ID', '');
    this.accessToken = this.config.get<string>('META_CATALOG_ACCESS_TOKEN', '');
    this.siteUrl = this.config
      .get<string>('FRONTEND_URL', 'https://saldaodareserva.com.br')
      .replace(/\/$/, '');
    this.enabled = Boolean(this.catalogId && this.accessToken);

    if (!this.enabled) {
      this.logger.warn(
        'Meta Catalog desativado: META_CATALOG_ID ou META_CATALOG_ACCESS_TOKEN ausentes',
      );
    }
  }

  upsert(product: CatalogProduct): void {
    if (!this.enabled) return;
    void this.syncProduct(product, 'UPDATE');
  }

  remove(productId: string, productName: string): void {
    if (!this.enabled) return;
    void this.deleteProduct(productId, productName);
  }

  async syncAll(): Promise<{ synced: number; errors: number }> {
    if (!this.enabled) return { synced: 0, errors: 0 };

    const products = await this.prisma.product.findMany({
      where: { status: 'ACTIVE' },
      include: { images: { orderBy: { position: 'asc' }, take: 1 } },
    });

    let synced = 0;
    let errors = 0;

    for (const product of products) {
      const p: CatalogProduct = {
        id: product.id,
        name: product.name,
        slug: product.slug,
        price: product.price.toNumber(),
        salePrice: product.salePrice?.toNumber() ?? null,
        description: product.description,
        shortDescription: product.shortDescription,
        stock: product.stock,
        brand: product.brand,
        images: product.images,
      };

      try {
        await this.syncProduct(p, 'UPDATE');
        synced++;
      } catch {
        errors++;
      }
    }

    return { synced, errors };
  }

  async getStats() {
    const [total, synced, errored, lastSync] = await Promise.all([
      this.prisma.metaCatalogSync.count(),
      this.prisma.metaCatalogSync.count({ where: { status: 'SYNCED' } }),
      this.prisma.metaCatalogSync.count({ where: { status: 'ERROR' } }),
      this.prisma.metaCatalogSync.findFirst({
        where: { status: 'SYNCED' },
        orderBy: { syncedAt: 'desc' },
        select: { syncedAt: true },
      }),
    ]);

    const errors = await this.prisma.metaCatalogSync.findMany({
      where: { status: 'ERROR' },
      include: { product: { select: { name: true, slug: true } } },
      orderBy: { updatedAt: 'desc' },
      take: 20,
    });

    return {
      enabled: this.enabled,
      total,
      synced,
      errored,
      lastSyncedAt: lastSync?.syncedAt ?? null,
      errors: errors.map((e) => ({
        productId: e.productId,
        productName: e.product.name,
        productSlug: e.product.slug,
        errorMessage: e.errorMessage,
        updatedAt: e.updatedAt,
      })),
    };
  }

  private async syncProduct(product: CatalogProduct, method: CatalogMethod): Promise<void> {
    const effectivePrice = product.salePrice ?? product.price;
    const priceInCents = Math.round(effectivePrice * 100);
    const imageUrl = product.images?.[0]?.url ?? '';

    if (!imageUrl) {
      this.logger.warn(`Meta Catalog: produto ${product.id} sem imagem — ignorado`);
      await this.upsertSyncRecord(product.id, 'ERROR', 'Produto sem imagem');
      return;
    }

    const description =
      product.shortDescription ??
      product.description?.replace(/<[^>]+>/g, '').slice(0, 9999) ??
      product.name;

    const data: ItemData = {
      retailer_id: product.id,
      name: product.name.slice(0, 200),
      description: description.slice(0, 9999),
      price: priceInCents,
      currency: 'BRL',
      availability: product.stock > 0 ? 'in stock' : 'out of stock',
      condition: 'refurbished',
      image_url: imageUrl,
      url: `${this.siteUrl}/produtos/${product.slug}`,
      ...(product.brand ? { brand: product.brand } : {}),
    };

    const request: BatchRequest = { method, retailer_id: product.id, data };

    try {
      await this.sendBatch([request]);
      await this.upsertSyncRecord(product.id, 'SYNCED', null);
      this.logger.log(`Meta Catalog: ${method} produto=${product.id} (${product.name})`);
    } catch (err) {
      const msg = (err as Error).message;
      await this.upsertSyncRecord(product.id, 'ERROR', msg);
      throw err;
    }
  }

  private async deleteProduct(productId: string, productName: string): Promise<void> {
    const request: BatchRequest = { method: 'DELETE', retailer_id: productId };

    try {
      await this.sendBatch([request]);
      // Remove sync record since product is deleted (cascade handles it)
      this.logger.log(`Meta Catalog: DELETE produto=${productId} (${productName})`);
    } catch (err) {
      this.logger.warn(`Meta Catalog: falha ao remover produto=${productId}`, err);
    }
  }

  private async sendBatch(requests: BatchRequest[]): Promise<void> {
    const url = `${GRAPH_API}/${this.catalogId}/items_batch`;
    const body = JSON.stringify({
      allow_upsert: true,
      requests,
      access_token: this.accessToken,
    });

    for (let attempt = 0; attempt < RETRY_DELAYS.length; attempt++) {
      if (RETRY_DELAYS[attempt] > 0) await delay(RETRY_DELAYS[attempt]);

      try {
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body,
        });

        if (res.ok) return;

        const err = await res.text();
        if (attempt < RETRY_DELAYS.length - 1) {
          this.logger.warn(`Meta Catalog: tentativa ${attempt + 1} falhou — ${res.status} ${err}`);
        } else {
          throw new Error(`Meta Catalog API ${res.status}: ${err}`);
        }
      } catch (err) {
        if (attempt < RETRY_DELAYS.length - 1) {
          this.logger.warn(`Meta Catalog: tentativa ${attempt + 1} erro de rede`, err);
        } else {
          throw err;
        }
      }
    }
  }

  private async upsertSyncRecord(
    productId: string,
    status: 'SYNCED' | 'ERROR' | 'PENDING',
    errorMessage: string | null,
  ) {
    await this.prisma.metaCatalogSync.upsert({
      where: { productId },
      create: {
        productId,
        status,
        errorMessage,
        syncedAt: status === 'SYNCED' ? new Date() : null,
      },
      update: {
        status,
        errorMessage,
        syncedAt: status === 'SYNCED' ? new Date() : undefined,
      },
    });
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
