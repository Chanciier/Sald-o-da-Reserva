import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { WhatsappProvider } from './whatsapp.provider';
import { AIContentService } from './ai-content.service';

interface ProductLike {
  id: string;
  name: string;
  slug: string;
  price: Prisma.Decimal;
  salePrice: Prisma.Decimal | null;
  stock: number;
  autoPublishWhatsapp: boolean;
  whatsappGroupIds: string[];
  images: { url: string }[];
  description?: string | null;
  brand?: string | null;
  category?: { name: string } | null;
}

@Injectable()
export class WhatsappMarketingService {
  private readonly logger = new Logger(WhatsappMarketingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly whatsapp: WhatsappProvider,
    private readonly config: ConfigService,
    private readonly ai: AIContentService,
  ) {}

  async publishProduct(product: ProductLike, groupIds: string[]): Promise<void> {
    if (!product.autoPublishWhatsapp || !groupIds.length) return;

    const groups = await this.prisma.whatsappGroup.findMany({
      where: { id: { in: groupIds }, active: true },
    });

    if (!groups.length) return;

    const frontendUrl = (this.config.get<string>('FRONTEND_URL') ?? 'http://localhost:3000')
      .split(',')[0]
      .trim();
    const productUrl = `${frontendUrl}/produtos/${product.slug}`;

    // Usa conteúdo editado manualmente se houver; senão gera via IA
    const existingContent = await this.prisma.whatsappContentHistory.findFirst({
      where: { productId: product.id, edited: true },
      orderBy: { updatedAt: 'desc' },
    });

    let message: string;
    if (existingContent) {
      message = existingContent.content;
      await this.prisma.whatsappContentHistory.update({
        where: { id: existingContent.id },
        data: { sent: true },
      });
    } else {
      message = await this.ai.generateAdCopy({
        name: product.name,
        category: product.category?.name,
        brand: product.brand ?? undefined,
        price: product.price.toNumber(),
        salePrice: product.salePrice?.toNumber(),
        stock: product.stock,
        description: product.description ?? undefined,
        productUrl,
      });
      await this.prisma.whatsappContentHistory.create({
        data: { productId: product.id, content: message, sent: true },
      });
    }

    const imageUrl = product.images?.[0]?.url;

    for (const group of groups) {
      let success = false;
      let error: string | undefined;

      try {
        if (imageUrl) {
          await this.whatsapp.sendMedia(group.groupId, imageUrl, message);
        } else {
          await this.whatsapp.sendMessage(group.groupId, message);
        }
        success = true;
      } catch (e) {
        error = (e as Error).message;
        this.logger.error(`Falha ao enviar para grupo ${group.name}: ${error}`);
      }

      await this.prisma.whatsappMessageLog
        .create({ data: { productId: product.id, groupId: group.id, success, error } })
        .catch(() => {});
    }
  }

  async resendProduct(productId: string): Promise<void> {
    const product = await this.prisma.product.findUniqueOrThrow({
      where: { id: productId },
      include: {
        images: { orderBy: { position: 'asc' } },
        category: { select: { name: true } },
      },
    });

    await this.publishProduct(product, product.whatsappGroupIds);
  }

  async broadcastActiveProducts(): Promise<{ total: number; sent: number; failed: number }> {
    const products = await this.prisma.product.findMany({
      where: { status: 'ACTIVE', stock: { gt: 0 } },
      include: {
        images: { orderBy: { position: 'asc' } },
        category: { select: { name: true } },
      },
      take: 50,
    });

    const groups = await this.prisma.whatsappGroup.findMany({ where: { active: true } });
    if (!groups.length) return { total: products.length, sent: 0, failed: 0 };

    const frontendUrl = (this.config.get<string>('FRONTEND_URL') ?? 'http://localhost:3000')
      .split(',')[0]
      .trim();

    let sent = 0;
    let failed = 0;

    for (const product of products) {
      const productUrl = `${frontendUrl}/produtos/${product.slug}`;

      const existing = await this.prisma.whatsappContentHistory.findFirst({
        where: { productId: product.id },
        orderBy: { createdAt: 'desc' },
      });

      let message: string;
      try {
        if (existing) {
          message = existing.content;
        } else {
          message = await this.ai.generateAdCopy({
            name: product.name,
            category: product.category?.name,
            brand: product.brand ?? undefined,
            price: product.price.toNumber(),
            salePrice: product.salePrice?.toNumber(),
            stock: product.stock,
            description: product.description ?? undefined,
            productUrl,
          });
          await this.prisma.whatsappContentHistory
            .create({ data: { productId: product.id, content: message, sent: false } })
            .catch(() => {});
        }
      } catch {
        failed++;
        continue;
      }

      const imageUrl = product.images?.[0]?.url;
      for (const group of groups) {
        try {
          if (imageUrl) {
            await this.whatsapp.sendMedia(group.groupId, imageUrl, message);
          } else {
            await this.whatsapp.sendMessage(group.groupId, message);
          }
          await this.prisma.whatsappMessageLog
            .create({ data: { productId: product.id, groupId: group.id, success: true } })
            .catch(() => {});
        } catch (e) {
          const error = (e as Error).message;
          this.logger.error(`Broadcast ${product.name} → ${group.name}: ${error}`);
          await this.prisma.whatsappMessageLog
            .create({ data: { productId: product.id, groupId: group.id, success: false, error } })
            .catch(() => {});
        }
      }
      sent++;
      await new Promise((r) => setTimeout(r, 300));
    }

    return { total: products.length, sent, failed };
  }
}
