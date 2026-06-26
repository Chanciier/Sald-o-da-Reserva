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

  // IDs dos produtos elegíveis para broadcast (ativos e com estoque). Usado pela
  // campanha espaçada (WhatsappBroadcastService) para montar a fila aleatória.
  async getBroadcastProductIds(): Promise<string[]> {
    const products = await this.prisma.product.findMany({
      where: { status: 'ACTIVE', stock: { gt: 0 } },
      select: { id: true },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
    return products.map((p) => p.id);
  }

  // Envia UM produto para todos os grupos ativos. Retorna o nome do produto e se
  // ao menos um envio teve sucesso — usado pelo disparo espaçado (1 a cada N min).
  async broadcastSingleProduct(productId: string): Promise<{ ok: boolean; name: string | null }> {
    const product = await this.prisma.product.findUnique({
      where: { id: productId },
      include: {
        images: { orderBy: { position: 'asc' } },
        category: { select: { name: true } },
      },
    });
    if (!product) return { ok: false, name: null };

    const groups = await this.prisma.whatsappGroup.findMany({ where: { active: true } });
    if (!groups.length) return { ok: false, name: product.name };

    const frontendUrl = (this.config.get<string>('FRONTEND_URL') ?? 'http://localhost:3000')
      .split(',')[0]
      .trim();
    const productUrl = `${frontendUrl}/produtos/${product.slug}`;

    let message: string;
    try {
      const existing = await this.prisma.whatsappContentHistory.findFirst({
        where: { productId: product.id },
        orderBy: { createdAt: 'desc' },
      });
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
      return { ok: false, name: product.name };
    }

    const imageUrl = product.images?.[0]?.url;
    let anySuccess = false;
    for (const group of groups) {
      try {
        if (imageUrl) {
          await this.whatsapp.sendMedia(group.groupId, imageUrl, message);
        } else {
          await this.whatsapp.sendMessage(group.groupId, message);
        }
        anySuccess = true;
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
    return { ok: anySuccess, name: product.name };
  }
}
