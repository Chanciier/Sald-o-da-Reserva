import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { WhatsappProvider } from './whatsapp.provider';

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
}

@Injectable()
export class WhatsappMarketingService {
  private readonly logger = new Logger(WhatsappMarketingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly whatsapp: WhatsappProvider,
    private readonly config: ConfigService,
  ) {}

  async publishProduct(product: ProductLike, groupIds: string[]): Promise<void> {
    if (!product.autoPublishWhatsapp || !groupIds.length) return;

    const groups = await this.prisma.whatsappGroup.findMany({
      where: { id: { in: groupIds }, active: true },
    });

    if (!groups.length) return;

    const frontendUrl = this.config.get<string>('FRONTEND_URL') ?? 'http://localhost:3000';
    const productUrl = `${frontendUrl}/produtos/${product.slug}`;
    const message = this.buildMessage(product, productUrl);
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
      include: { images: { orderBy: { position: 'asc' } } },
    });

    await this.publishProduct(product, product.whatsappGroupIds);
  }

  private buildMessage(product: ProductLike, url: string): string {
    const price = product.price.toNumber();
    const salePrice = product.salePrice?.toNumber() ?? null;
    const displayPrice = salePrice ?? price;
    const fmt = (n: number) =>
      new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(n);

    const lines: string[] = [`🔥 *${product.name}*`, ''];

    if (salePrice && salePrice < price) {
      const pct = Math.round(((price - salePrice) / price) * 100);
      lines.push(`De: ~R$ ${fmt(price)}~`, `*Por: ${fmt(displayPrice)}* (-${pct}%)`);
    } else {
      lines.push(`*${fmt(displayPrice)}*`);
    }

    if (product.stock > 0 && product.stock <= 5) {
      lines.push('', `⚡ Últimas ${product.stock} unidades!`);
    }

    lines.push('', `👉 ${url}`);
    return lines.join('\n');
  }
}
